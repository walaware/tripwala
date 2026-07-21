<script>
  import { AvatarGroup } from '@walaware/design';

  /** @type {{ participants: Array<any>, onOpen: () => void }} */
  let { participants, onOpen } = $props();

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);
  const people = $derived(participants.map((/** @type {any} */ p) => ({ id: p.id, name: p.display_name, src: p.avatar })));

  // Meaningful status that uses the row's width — never a bare "No RSVPs yet"
  // under people who are already listed. Prefer RSVP counts; fall back to a crew
  // count when there's no RSVP signal yet.
  const status = $derived(
    going || maybe
      ? [going ? `${going} going` : '', maybe ? `${maybe} maybe` : ''].filter(Boolean).join(' · ')
      : participants.length
        ? `${participants.length} in the crew`
        : 'No one yet'
  );
</script>

<button type="button" class="flex w-full items-center gap-3 text-left" onclick={onOpen}>
  {#if participants.length}
    <AvatarGroup {people} max={5} size={30} />
  {/if}
  <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-text-strong">{status}</span>
  <span class="flex-none font-body text-[13px] font-extrabold text-coral-600">See the crew →</span>
</button>
