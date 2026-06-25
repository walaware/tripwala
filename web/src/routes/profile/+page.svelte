<script>
  import { AvatarUpload, Card, Button } from '@walaware/design';
  import { enhance } from '$app/forms';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();

  let busy = $state(false);

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
