<script>
  import { AvatarUpload, Card, Button, TextField } from '@walaware/design';
  import { enhance } from '$app/forms';
  import { displayName } from '$lib/displayName.js';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();

  let busy = $state(false);

  // Name-display prefs (live preview; the default is first name only). Seeded
  // once from load data; the form owns the value after that.
  // svelte-ignore state_referenced_locally
  let nickname = $state(data.nickname || '');
  // svelte-ignore state_referenced_locally
  let showLast = $state(data.showLastName || false);
  let savingPrefs = $state(false);
  const preview = $derived(displayName(data.name, { nickname, show_last_name: showLast }));
  const savePrefs = () => {
    savingPrefs = true;
    return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
      await update();
      savingPrefs = false;
    };
  };

  // App preferences. Temperature unit for the forecast (default F). Each unit is
  // its own submit button carrying name="temp_unit" value=…, so the click submits
  // that exact value — no hidden input to race against Svelte's DOM flush. The
  // `tempUnit` state only drives the optimistic pressed styling.
  const UNITS = /** @type {const} */ (['F', 'C']);
  // svelte-ignore state_referenced_locally
  let tempUnit = $state(data.tempUnit === 'C' ? 'C' : 'F');
  let savingUnits = $state(false);
  const saveUnits = () => {
    savingUnits = true;
    return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
      await update();
      savingUnits = false;
    };
  };

  // A hidden, enhanced form does the actual multipart upload (collections are
  // superuser-locked; the action scopes the write to locals.user.id). AvatarUpload
  // only hands us the picked File — we feed it into this form's input and submit.
  /** @type {HTMLFormElement | undefined} */
  let uploadForm = $state();
  /** @type {HTMLInputElement | undefined} */
  let fileInput = $state();

  /** @param {File} file */
  function onPick(file) {
    if (!fileInput || !uploadForm) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    uploadForm.requestSubmit();
  }

  // Shared progressive-enhancement handler: flip busy, follow the action's redirect
  // (which reloads data with the new avatar URL), then clear busy.
  const track = () => {
    busy = true;
    return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
      await update();
      busy = false;
    };
  };
</script>

<svelte:head><title>Your profile — tripwala</title></svelte:head>

<div class="mx-auto max-w-md">
  <h1 class="mb-5 font-display text-[24px] font-bold tracking-tight text-text-strong">Your profile</h1>

  <Card>
    <div class="flex flex-col items-center text-center">
      <AvatarUpload
        name={data.name}
        src={data.avatar}
        size={96}
        {onPick}
        disabled={busy}
        label="Change profile photo"
      />
      <div class="mt-3 min-w-0">
        <div class="truncate font-display text-[17px] font-bold text-text-strong">{data.name}</div>
        <div class="truncate font-body text-[13px] font-bold text-text-muted">{data.email}</div>
      </div>
    </div>

    {#if form?.error}
      <p class="mt-4 rounded-md bg-berry-200 px-3 py-2 text-center font-body text-sm font-bold text-berry-600">
        {form.error}
      </p>
    {/if}

    <p class="mt-4 text-center font-body text-[12px] font-bold text-cocoa-400">
      Tap the camera to upload a photo — JPG or PNG, under 5&nbsp;MB. It shows on the trips you
      join. Signing in with Google sets it automatically; upload here to override it.
    </p>

    {#if data.avatar}
      <div class="mt-3 flex justify-center">
        <form method="POST" action="?/remove" use:enhance={track}>
          <Button type="submit" variant="ghost" size="sm" disabled={busy}>Remove photo</Button>
        </form>
      </div>
    {/if}
  </Card>

  <!-- Display-name prefs: nickname + show-last-name (first name only by default). -->
  <div class="mt-4">
    <Card>
      <div class="font-display text-[15px] font-bold text-text-strong">Display name</div>
      <p class="mt-0.5 font-body text-[12.5px] font-bold text-text-muted">
        How your name shows on trips. First name only by default.
      </p>
      <form method="POST" action="?/prefs" use:enhance={savePrefs} class="mt-3 flex flex-col gap-3">
        <div>
          <label for="nickname" class="mb-1 block font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">
            Nickname (optional)
          </label>
          <TextField id="nickname" name="nickname" bind:value={nickname} maxlength={100} placeholder={`e.g. ${(data.name || '').split(' ')[0] || 'Sam'}`} />
        </div>
        <label class="flex cursor-pointer items-center justify-between gap-3">
          <span class="min-w-0">
            <span class="block font-body text-[14px] font-extrabold text-text-strong">Show my last name</span>
            <span class="block font-body text-[12px] font-bold text-text-muted">Off shows just your first name</span>
          </span>
          <input type="checkbox" name="show_last_name" bind:checked={showLast} class="h-5 w-5 flex-none accent-[var(--color-primary)]" />
        </label>
        <div class="rounded-lg bg-sand-100 px-3 py-2 font-body text-[13px] font-bold text-cocoa-700">
          Shown as <span class="font-extrabold text-cocoa-900">{preview || '—'}</span>
        </div>
        <div>
          <Button type="submit" variant="primary" size="md" disabled={savingPrefs}>
            {savingPrefs ? 'Saving…' : 'Save name'}
          </Button>
        </div>
      </form>
    </Card>
  </div>

  <!-- App preferences: forecast temperature unit (room to grow). -->
  <div class="mt-4">
    <Card>
      <div class="font-display text-[15px] font-bold text-text-strong">Preferences</div>
      <p class="mt-0.5 font-body text-[12.5px] font-bold text-text-muted">
        How things show up for you across your trips.
      </p>
      <form method="POST" action="?/units" use:enhance={saveUnits} class="mt-3">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0">
            <span class="block font-body text-[14px] font-extrabold text-text-strong">Temperature</span>
            <span class="block font-body text-[12px] font-bold text-text-muted">
              Units in the trip weather forecast
            </span>
          </span>
          <div class="flex flex-none rounded-lg bg-sand-100 p-0.5" role="group" aria-label="Temperature unit">
            {#each UNITS as u}
              <button
                type="submit"
                name="temp_unit"
                value={u}
                onclick={() => (tempUnit = u)}
                disabled={savingUnits}
                aria-pressed={tempUnit === u}
                class="rounded-md px-3.5 py-1.5 font-body text-[13px] font-extrabold transition-colors {tempUnit ===
                u
                  ? 'bg-white text-cocoa-900 shadow-sm'
                  : 'text-cocoa-400'}"
              >
                °{u}
              </button>
            {/each}
          </div>
        </div>
      </form>
    </Card>
  </div>

  {#if data.isAdmin}
    <!-- Instance admin: link to app-wide settings (Immich, etc.). -->
    <div class="mt-4">
      <Card>
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-display text-[15px] font-bold text-text-strong">⚙️ Instance settings</div>
            <div class="font-body text-[12.5px] font-bold text-text-muted">Connect Immich for shared photo albums</div>
          </div>
          <Button href="/admin" variant="soft" size="sm">Open</Button>
        </div>
      </Card>
    </div>
  {/if}

  <!-- Hidden upload form driven by AvatarUpload's onPick. -->
  <form
    bind:this={uploadForm}
    method="POST"
    action="?/upload"
    enctype="multipart/form-data"
    class="hidden"
    use:enhance={track}
  >
    <input bind:this={fileInput} type="file" name="photo" accept="image/*" />
  </form>
</div>
