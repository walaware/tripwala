<script>
  import StatusAvatar from '$lib/ui/StatusAvatar.svelte';
  import { statusOf, countByStatus, summarise } from '$lib/peopleStatus.js';

  /** @type {{ participants: Array<any>, invitedCount?: number, onOpen: () => void }} */
  let { participants, invitedCount = 0, onOpen } = $props();

  // Faces carry their own status here, same as on the full crew view — a row of
  // plain avatars can't answer "is this person actually coming?", which is the
  // only question this summary exists to answer.
  const shown = $derived(participants.slice(0, 5));
  const extra = $derived(Math.max(0, participants.length - shown.length));
  const counts = $derived(countByStatus(participants, invitedCount));
  const summary = $derived(summarise(counts));

  const status = $derived(
    summary.length
      ? summary
          .map((s) => `${s.count} ${s.key === 'no_answer' ? 'no answer' : s.key === 'out' ? "can't" : s.key}`)
          .join(' · ')
      : participants.length
        ? `${participants.length} in the crew`
        : 'No one yet'
  );
</script>

<button type="button" class="flex w-full items-center gap-3 text-left" onclick={onOpen}>
  {#if shown.length}
    <span class="flex flex-none items-center">
      {#each shown as p, i (p.id)}
        <span class="-ml-2 first:ml-0" style="z-index: {shown.length - i}">
          <StatusAvatar
            name={p.display_name}
            src={p.avatar}
            size={30}
            status={statusOf(p).key}
            dim={p.rsvp_status === 'out'}
          />
        </span>
      {/each}
      {#if extra}
        <span class="-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white bg-sand-200 font-body text-[11px] font-extrabold text-cocoa-600">+{extra}</span>
      {/if}
    </span>
  {/if}
  <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-text-strong">{status}</span>
  <span class="flex-none font-body text-[13px] font-extrabold text-coral-600">See the crew →</span>
</button>
