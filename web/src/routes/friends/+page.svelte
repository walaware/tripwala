<script>
  import { Button, TextField, RequestCard, PersonList, EmptyState } from '@walaware/design';
  import { applyAction, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();

  const incoming = $derived(data.incoming ?? []);
  const outgoing = $derived(data.outgoing ?? []);
  // PersonList uses `src` for the photo — map our `avatar` onto it.
  /** @param {Array<{ id: string, name: string, avatar?: string }>} list */
  const toRows = (list) => list.map((p) => ({ id: p.id, name: p.name, src: p.avatar }));
  const friends = $derived(toRows(data.friends ?? []));
  const suggestions = $derived(toRows(data.suggestions ?? []));

  let email = $state('');
  let copied = $state(false);

  // ?add= confirmation from the /add-friend/[token] flow.
  const addNotice = $derived(
    ({
      sent: 'Friend request sent.',
      accepted: "You're now friends!",
      self: "That's your own link 🙂",
      notfound: 'That friend link is no longer valid.'
    })[page.url.searchParams.get('add') ?? '']
  );

  /** @param {string} action @param {Record<string,string>} fields */
  async function submitAction(action, fields) {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const res = await fetch(`/friends?/${action}`, { method: 'POST', body });
    /** @type {any} */
    const result = deserialize(await res.text());
    if (result.type === 'redirect') {
      window.location.href = result.location;
      return;
    }
    await applyAction(result);
    await invalidateAll();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.friendLink);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (_) {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  /** @param {SubmitEvent} e */
  async function sendEmail(e) {
    e.preventDefault();
    if (!email.trim()) return;
    await submitAction('requestByEmail', { email });
    email = '';
  }
</script>

<svelte:head><title>tripwala — friends</title></svelte:head>

<div>
  <div class="border-b border-sand-300 pb-4">
    <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Friends</h1>
    <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
      Add the people you travel with — invite them to trips in a tap and see each other's plans.
    </p>
  </div>

  {#if addNotice}
    <p class="mt-4 rounded-xl bg-surface-card px-4 py-2.5 font-body text-sm font-bold text-text-body shadow-card">
      {addNotice}
    </p>
  {/if}

  <!-- Add a friend: your personal link + by email -->
  <section class="mt-6 rounded-2xl bg-surface-card p-5 shadow-card">
    <h2 class="font-display text-base font-bold text-text-strong">Add a friend</h2>
    <div class="mt-3 flex flex-col gap-2">
      <span class="font-body text-[13px] font-bold text-text-muted">Your invite link</span>
      <div class="flex gap-2">
        <input
          class="min-w-0 flex-1 rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 font-body text-sm text-text-body"
          readonly
          value={data.friendLink}
          onclick={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" size="md" onclick={copyLink}>{copied ? 'Copied ✓' : 'Copy'}</Button>
      </div>
    </div>
    <form class="mt-4 flex items-end gap-2" onsubmit={sendEmail}>
      <div class="flex-1">
        <TextField label="…or by email" type="email" placeholder="friend@email.com" bind:value={email} />
      </div>
      <Button variant="primary" size="md" type="submit">Send</Button>
    </form>
    {#if form?.emailError}
      <p class="mt-2 font-body text-sm font-bold text-red-600">{form.emailError}</p>
    {:else if form?.emailSent}
      <p class="mt-2 font-body text-sm font-bold text-text-muted">
        If that person has a tripwala account, we've sent them a request.
      </p>
    {/if}
  </section>

  {#if incoming.length}
    <section class="mt-8">
      <h2 class="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
        Requests
      </h2>
      <div class="flex flex-col gap-3">
        {#each incoming as req (req.id)}
          <RequestCard
            avatar={{ name: req.from.name, src: req.from.avatar }}
            title={`${req.from.name} wants to be friends`}
            onAccept={() => submitAction('accept', { id: req.id })}
            onDecline={() => submitAction('remove', { id: req.id })}
          />
        {/each}
      </div>
    </section>
  {/if}

  {#if outgoing.length}
    <section class="mt-8">
      <h2 class="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
        Sent
      </h2>
      <div class="flex flex-col gap-3">
        {#each outgoing as req (req.id)}
          <RequestCard
            avatar={{ name: req.to.name, src: req.to.avatar }}
            title={req.to.name}
            pending
            onCancel={() => submitAction('remove', { id: req.id })}
          />
        {/each}
      </div>
    </section>
  {/if}

  <section class="mt-8">
    <h2 class="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
      Your friends
    </h2>
    {#if friends.length}
      <div class="rounded-2xl bg-surface-card p-2 shadow-card">
        <PersonList people={friends} divider>
          {#snippet action(person)}
            <Button variant="ghost" size="sm" onclick={() => submitAction('unfriend', { user: person.id })}>
              Remove
            </Button>
          {/snippet}
        </PersonList>
      </div>
    {:else}
      <EmptyState emoji="👋" title="No friends yet" />
    {/if}
  </section>

  {#if suggestions.length}
    <section class="mt-8">
      <h2 class="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
        People you've traveled with
      </h2>
      <div class="rounded-2xl bg-surface-card p-2 shadow-card">
        <PersonList people={suggestions} divider>
          {#snippet action(person)}
            <Button variant="secondary" size="sm" onclick={() => submitAction('request', { user: person.id })}>
              Add friend
            </Button>
          {/snippet}
        </PersonList>
      </div>
    </section>
  {/if}
</div>
