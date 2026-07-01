<script>
  import { Composer, EmptyState } from '@walaware/design';
  import { enhance } from '$app/forms';
  import TripCard from '$lib/TripCard.svelte';

  /** @type {{ data: import('./$types').PageData, form: any }} */
  let { data, form } = $props();

  const ideas = $derived(data.ideas ?? []);

  // Composer isn't a native form, so it hands us the title via onSend; we stash
  // it in a hidden input and submit the enhanced ?/create action.
  /** @type {HTMLFormElement | undefined} */
  let createForm = $state();
  let pendingName = $state('');
  /** @type {HTMLDivElement | undefined} */
  let quickAdd = $state();

  /** @param {string} title */
  function createIdea(title) {
    const name = title.trim();
    if (!name) return;
    pendingName = name;
    createForm?.requestSubmit();
  }

  function focusQuickAdd() {
    /** @type {HTMLElement | null | undefined} */
    const el = quickAdd?.querySelector('input, textarea');
    el?.focus();
  }
</script>

<svelte:head><title>Someday — tripwala</title></svelte:head>

<div>
  <div class="border-b border-sand-300 pb-4">
    <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Someday 💭</h1>
    <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
      Trips you're daydreaming about. Private to you, or a co-organizer you invite.
    </p>
  </div>

  <!-- Title-only quick-add (shared Composer). Hidden enhanced form does the write. -->
  <div bind:this={quickAdd} class="mt-5">
    <Composer
      me={null}
      placeholder="Somewhere you're dreaming about…"
      onSend={createIdea}
    />
    {#if form?.createError}
      <p class="mt-2 font-body text-sm font-bold text-berry-600">{form.createError}</p>
    {/if}
  </div>

  <form
    bind:this={createForm}
    method="POST"
    action="?/create"
    class="hidden"
    use:enhance={() => async ({ update }) => {
      await update();
      pendingName = '';
    }}
  >
    <input type="hidden" name="name" value={pendingName} />
  </form>

  {#if form?.promoteError}
    <p class="mt-4 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">{form.promoteError}</p>
  {/if}

  {#if ideas.length === 0}
    <div class="mt-8">
      <EmptyState
        emoji="💭"
        title="Nothing on the someday list yet"
        body="Capture a trip you're daydreaming about — no dates needed."
        action="Add an idea"
        onAction={focusQuickAdd}
      />
    </div>
  {:else}
    <div class="mt-8 flex flex-col gap-3 sm:grid sm:grid-cols-2">
      {#each ideas as trip (trip.id)}
        <TripCard {trip} variant="idea" />
      {/each}
    </div>
  {/if}
</div>
