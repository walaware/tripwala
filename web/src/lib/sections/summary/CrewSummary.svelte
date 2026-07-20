<script>
  import { Avatar } from '@walaware/design';

  /** @type {{ participants: Array<any>, onOpen: () => void }} */
  let { participants, onOpen } = $props();

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);
  const out = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'out').length);
  const shown = $derived(participants.slice(0, 7));
  const extra = $derived(Math.max(0, participants.length - shown.length));
  const status = $derived(
    [going ? `${going} going` : '', maybe ? `${maybe} maybe` : '', out ? `${out} out` : '']
      .filter(Boolean)
      .join(' · ') || 'No RSVPs yet'
  );
</script>

{#if participants.length}
  <div class="flex items-center" aria-hidden="true">
    {#each shown as p, i (p.id)}
      <span class="-ml-2 first:ml-0" style="z-index: {shown.length - i}">
        <Avatar name={p.display_name} src={p.avatar} size={30} ring />
      </span>
    {/each}
    {#if extra}
      <span class="-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white bg-sand-200 font-body text-[11px] font-extrabold text-cocoa-600">+{extra}</span>
    {/if}
  </div>
  <div class="mt-2 font-body text-[13.5px] font-extrabold text-text-strong">{status}</div>
{:else}
  <p class="py-1 font-body text-[13px] font-bold text-text-muted">No one's claimed a spot yet.</p>
{/if}
<button type="button" class="mt-3 block font-body text-[13px] font-extrabold text-coral-600 hover:underline" onclick={onOpen}>See the crew →</button>
