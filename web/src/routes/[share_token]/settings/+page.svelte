<script>
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Card } from '@walaware/design';
  import { Button } from '@walaware/design';
  import { TextField } from '@walaware/design';
  import { Avatar } from '@walaware/design';
  import { DateField } from '@walaware/design';

  /** @type {{ data: any, form: any }} */
  let { data, form } = $props();

  const errors = $derived(form?.errors ?? {});
  const values = $derived(form?.values ?? data.values);
  const members = $derived(data.members ?? []);
  const memberError = $derived(form?.memberError ?? '');

  const TYPES = [
    ['camping', '🏕️ Camping'], ['backpacking', '🎒 Backpacking'], ['road_trip', '🚗 Road trip'],
    ['cabin', '🛖 Cabin'], ['ski', '⛷️ Ski'], ['beach', '🏖️ Beach'], ['city', '🏙️ City'],
    ['festival', '🎪 Festival'], ['other', '🧭 Other']
  ];

  const origin = $derived(page.url.origin);
  const shareUrl = $derived(`${origin}/${data.shareToken}`);
  const ownerUrl = $derived(`${origin}/${data.shareToken}/edit?owner=${data.ownerToken}`);

  let copied = $state('');
  /** @param {string} text @param {string} which */
  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      copied = which;
      setTimeout(() => (copied = ''), 1500);
    } catch (_) {
      copied = '';
    }
  }

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3.5 py-3 font-body text-base font-bold text-cocoa-900 outline-none transition focus:border-coral-400 focus:ring-4 focus:ring-coral-200 placeholder:text-cocoa-300';
  const labelClass = 'mb-[7px] block font-display text-sm font-semibold text-cocoa-900';
</script>

<svelte:head><title>Settings — tripwala</title></svelte:head>

<div class="min-h-full">
  <div class="mx-auto max-w-xl">
    <a href="/{data.shareToken}" class="font-body text-sm font-extrabold text-coral-600 hover:underline">← Back to trip</a>
    <h1 class="mt-2 font-display text-[27px] font-bold tracking-tight text-cocoa-900">Settings</h1>

    <!-- Details -->
    <Card class="mt-5">
      {#if form?.saved}
        <p class="mb-3 rounded-md bg-leaf-200 px-3 py-2 font-body text-sm font-bold text-leaf-600">Saved ✓</p>
      {/if}
      {#if errors._form}
        <p class="mb-3 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">{errors._form}</p>
      {/if}

      <form method="POST" action="?/update" use:enhance class="flex flex-col gap-4">
        <div>
          <TextField label="Trip name" name="name" required value={values.name} placeholder="Mendocino Coast Camping" />
          {#if errors.name}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.name}</p>{/if}
        </div>

        <div>
          <label class={labelClass} for="trip_type">Trip type <span class="font-body font-bold text-cocoa-500">(optional)</span></label>
          <select id="trip_type" name="trip_type" value={values.trip_type} class={inputClass}>
            <option value="">Pick one…</option>
            {#each TYPES as [v, l]}<option value={v}>{l}</option>{/each}
          </select>
        </div>

        <div>
          <TextField label="Where?" name="location" value={values.location} placeholder="Russian Gulch State Park, CA" />
          {#if errors.location}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.location}</p>{/if}
        </div>

        <div>
          <DateField
            range
            start={values.start_date}
            end={values.end_date}
            nameStart="start_date"
            nameEnd="end_date"
            startLabel="Start"
            endLabel="End"
          />
          {#if errors.end_date}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.end_date}</p>{/if}
        </div>

        <div>
          <label class={labelClass} for="description">The plan</label>
          <textarea id="description" name="description" rows="3" placeholder="What's the plan? What should people know?" class={inputClass}>{values.description}</textarea>
          {#if errors.description}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.description}</p>{/if}
        </div>

        <div>
          <label class={labelClass} for="expense_link">Expense-split link <span class="font-body font-bold text-cocoa-500">(optional)</span></label>
          <input id="expense_link" name="expense_link" inputmode="url" value={values.expense_link} placeholder="https://spliit.app/..." class={inputClass} />
          {#if errors.expense_link}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.expense_link}</p>{/if}
        </div>

        <Button variant="primary" size="lg" full type="submit">Save changes</Button>
      </form>
    </Card>

    <!-- Links -->
    <Card class="mt-4">
      <h2 class="font-display text-base font-bold text-cocoa-900">Links</h2>

      <p class="mb-1.5 mt-3 font-display text-sm font-semibold text-cocoa-900">Share link</p>
      <div class="flex gap-2">
        <input readonly value={shareUrl} class="{inputClass} flex-1" />
        <Button variant="primary" size="md" onclick={() => copy(shareUrl, 'share')}>{copied === 'share' ? 'Copied!' : 'Copy'}</Button>
      </div>

      <p class="mb-1.5 mt-4 font-display text-sm font-semibold text-cocoa-900">Co-organizer link</p>
      <p class="-mt-1 mb-1.5 font-body text-xs font-bold text-cocoa-500">
        Send this to someone you want to co-run the trip. They sign in and become an organizer. Keep it private otherwise.
      </p>
      <div class="flex gap-2">
        <input readonly value={ownerUrl} class="flex-1 rounded-md border-2 border-sun-300 bg-sun-200 px-3.5 py-3 font-body text-base font-bold text-cocoa-900 outline-none" />
        <Button variant="soft" size="md" onclick={() => copy(ownerUrl, 'owner')}>{copied === 'owner' ? 'Copied!' : 'Copy'}</Button>
      </div>
    </Card>

    <!-- Members -->
    <Card class="mt-4">
      <h2 class="font-display text-base font-bold text-cocoa-900">Members</h2>
      {#if memberError}
        <p class="mt-2 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">{memberError}</p>
      {/if}
      <div class="mt-3 flex flex-col gap-2">
        {#each members as m (m.id)}
          <div class="flex items-center gap-2.5 rounded-xl bg-sand-50 px-2.5 py-2">
            <Avatar name={m.display_name} size={30} />
            <div class="min-w-0 flex-1">
              <div class="truncate font-body text-sm font-extrabold text-cocoa-900">
                {m.display_name}{#if m.isYou}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
              </div>
              <div class="font-body text-[11px] font-extrabold uppercase tracking-wide {m.role === 'organizer' ? 'text-coral-600' : 'text-cocoa-400'}">
                {m.role === 'organizer' ? '✨ Organizer' : 'Guest'}
              </div>
            </div>
            <div class="flex shrink-0 gap-1.5">
              <form method="POST" action="?/setRole" use:enhance>
                <input type="hidden" name="participantId" value={m.id} />
                <input type="hidden" name="role" value={m.role === 'organizer' ? 'guest' : 'organizer'} />
                <button type="submit" class="rounded-full border-2 border-sand-300 px-2.5 py-1 font-body text-[12px] font-extrabold text-cocoa-700 hover:border-coral-300">
                  {m.role === 'organizer' ? 'Make guest' : 'Make organizer'}
                </button>
              </form>
              {#if !m.isYou}
                <form method="POST" action="?/removeMember" use:enhance>
                  <input type="hidden" name="participantId" value={m.id} />
                  <button type="submit" class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200" title="Remove from trip">Remove</button>
                </form>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-2.5 font-body text-xs font-bold text-cocoa-400">
        Guests who haven't signed in yet (name-only) appear on the trip page, not here.
      </p>
    </Card>
  </div>
</div>
