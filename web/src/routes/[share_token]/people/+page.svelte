<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { Card, Chip } from '@walaware/design';
  import { tripAction } from '$lib/tripClient.js';
  import { useShell } from '$lib/shell.svelte.js';
  import StatusAvatar from '$lib/ui/StatusAvatar.svelte';
  import PeopleRoles from '$lib/sections/settings/PeopleRoles.svelte';
  import { STATUS, STATUS_ORDER, statusOf, countByStatus, summarise } from '$lib/peopleStatus.js';

  /** @type {{ data: any }} */
  let { data } = $props();

  const shareToken = $derived(data.shareToken);
  const invitedCount = $derived(data.invites.length + data.tripInvitations.length);
  const counts = $derived(countByStatus(data.crew, invitedCount));
  const summary = $derived(summarise(counts));

  // Everyone on the trip, bucketed by where they stand. This is the answer to
  // "who's actually coming?" that the compact card can only gesture at.
  const buckets = $derived(
    STATUS_ORDER.filter((k) => k !== 'invited')
      .map((key) => ({ key, meta: STATUS[key], people: data.crew.filter((/** @type {any} */ p) => statusOf(p).key === key) }))
      .filter((b) => b.people.length)
  );

  // Keep the trip's contextual shell (back to the trip, not the global nav).
  const shell = useShell();
  $effect(() => {
    shell.trip = {
      title: '🙌 People',
      subtitle: data.trip.name,
      emoji: '🙌',
      nav: [],
      scrollSpy: false,
      back: { label: data.trip.name, onClick: () => goto(`/${shareToken}`) }
    };
  });
  $effect(() => () => {
    shell.trip = null;
  });

  let busy = $state('');
  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>People · {data.trip.name}</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
  <!-- The headline the crew actually wants: the split, in one line. -->
  <Card>
    <div class="mb-2.5 flex flex-wrap gap-1.5">
      {#each summary as s (s.key)}
        <Chip tone={s.tone}>{s.count} {s.label.toLowerCase()}</Chip>
      {/each}
    </div>

    {#each buckets as b (b.key)}
      <div class="border-t border-sand-200 py-3 first:border-t-0 first:pt-0">
        <div class="mb-2 font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-400">
          {b.meta.emoji} {b.meta.label} · {b.people.length}
        </div>
        <div class="flex flex-wrap gap-2">
          {#each b.people as p (p.id)}
            <span class="flex items-center gap-1.5 rounded-full bg-sand-100 py-1 pl-1 pr-3">
              <StatusAvatar name={p.display_name} src={p.avatar} size={26} status={b.key} dim={b.key === 'out'} />
              <span class="font-body text-[13px] font-extrabold text-cocoa-900">
                {p.display_name}{#if p.id === data.currentParticipantId}<span class="font-bold text-cocoa-500"> (you)</span>{/if}
              </span>
              {#if p.role === 'organizer'}
                <span class="font-body text-[10.5px] font-extrabold uppercase tracking-wide text-coral-600">org</span>
              {/if}
            </span>
          {/each}
        </div>
      </div>
    {/each}
  </Card>

  {#if data.isOrganizer}
    <Card>
      <div class="mb-2 font-display text-[15px] font-bold text-text-strong">Members &amp; roles</div>
      <PeopleRoles
        members={data.members}
        pending={data.pending}
        invites={data.invites}
        tripInvitations={data.tripInvitations}
        currentParticipantId={data.currentParticipantId}
        emailEnabled={data.emailEnabled}
        {busy}
        {act}
      />
    </Card>
  {:else if invitedCount}
    <Card>
      <p class="font-body text-[13px] font-bold text-cocoa-500">
        {invitedCount} more {invitedCount === 1 ? 'person has' : 'people have'} been invited and
        {invitedCount === 1 ? "hasn't" : "haven't"} answered yet. An organizer can chase them up.
      </p>
    </Card>
  {/if}
</div>
