<script>
  import { Avatar } from '@walaware/design';

  /** @type {{ expenses: Array<any>, settlement: any, currentParticipantId: string | null, onOpen: () => void }} */
  let { expenses, settlement, currentParticipantId, onOpen } = $props();

  const total = $derived(settlement?.total ?? 0);
  const youNet = $derived(
    (settlement?.net ?? []).find((/** @type {any} */ n) => n.id === currentParticipantId)?.net ?? 0
  );
  const money = (/** @type {number} */ n) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;
  const balance = $derived(
    youNet > 0.005 ? `You're owed ${money(youNet)}` : youNet < -0.005 ? `You owe ${money(youNet)}` : 'All settled up'
  );
  const last = $derived(expenses[0] ?? null);
  const linkClass = 'mt-3 block font-body text-[13px] font-extrabold text-coral-600 hover:underline';
</script>

{#if expenses.length}
  <div class="flex items-center justify-between rounded-md px-3 py-2.5" style="background: var(--color-primary-soft)">
    <span class="font-body text-[14px] font-extrabold" style="color: var(--color-primary-press, var(--color-coral-700))">{balance}</span>
    <span class="font-body text-[12.5px] font-bold" style="color: var(--color-primary-press, var(--color-coral-700))">{money(total)} so far</span>
  </div>
  {#if last}
    <div class="mt-2.5 flex items-center gap-2">
      <Avatar name={last.paidByName} size={22} />
      <span class="min-w-0 flex-1 truncate font-body text-[12.5px] font-bold text-text-muted">
        {last.paidByName} added “{last.title}” · {money(last.amount)}
      </span>
    </div>
  {/if}
  <button type="button" class={linkClass} onclick={onOpen}>＋ Add an expense</button>
{:else}
  <p class="py-1 font-body text-[13px] font-bold text-text-muted">No expenses yet.</p>
  <button type="button" class={linkClass} onclick={onOpen}>＋ Add an expense</button>
{/if}
