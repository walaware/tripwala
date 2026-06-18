<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import Card from '$lib/ui/Card.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { fmtWeekday, fmtMonthDay } from '$lib/format.js';

  /**
   * @type {{
   *   shareToken: string,
   *   meals: Array<any>,
   *   currentParticipantId: string | null
   * }}
   */
  let { shareToken, meals, currentParticipantId } = $props();

  let busy = $state('');
  let confirmDrop = $state(''); // meal id whose owner-drop is awaiting confirmation

  /** @param {any[]} list */
  function groupByDay(list) {
    /** @type {Array<{ date: string, items: any[] }>} */
    const groups = [];
    const byKey = new Map();
    for (const m of list) {
      const key = m.date || '∅';
      let g = byKey.get(key);
      if (!g) {
        g = { date: m.date, items: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      g.items.push(m);
    }
    return groups;
  }
  const byDay = $derived(groupByDay(meals));

  const mealName = (/** @type {any} */ m) => m.label.split(' ').slice(1).join(' ') || m.label;

  /** @type {Record<string, string>} */
  const MEAL_EMOJI = { breakfast: '🥞', lunch: '🥪', dinner: '🍲', snack: '🍿', snacks: '🍿', dessert: '🍪' };
  const mealEmoji = (/** @type {any} */ m) => MEAL_EMOJI[mealName(m).toLowerCase()] ?? '🍴';

  const iAmOwner = (/** @type {any} */ m) => !!currentParticipantId && m.ownerParticipant === currentParticipantId;
  const iAmHelper = (/** @type {any} */ m) =>
    !!currentParticipantId && m.helpers.some((/** @type {any} */ h) => h.participant === currentParticipantId);

  /** @param {any} m @param {Record<string, unknown>} body */
  async function act(m, body) {
    if (busy) return;
    busy = m.id;
    try {
      await tripAction(shareToken, body);
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
      confirmDrop = '';
    }
  }

  const take = (/** @type {any} */ m) =>
    currentParticipantId && act(m, { op: 'meal_take', mealSlotId: m.id, participantId: currentParticipantId });
  const help = (/** @type {any} */ m) =>
    currentParticipantId && act(m, { op: 'meal_help', mealSlotId: m.id, participantId: currentParticipantId });
  const drop = (/** @type {any} */ m) =>
    currentParticipantId && act(m, { op: 'meal_drop', mealSlotId: m.id, participantId: currentParticipantId });

  /** @param {any} m @param {string} dish */
  async function saveDish(m, dish) {
    if (!currentParticipantId) return;
    try {
      await tripAction(shareToken, { op: 'meal_dish', mealSlotId: m.id, participantId: currentParticipantId, dish });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    }
  }
</script>

<Card>
  <CardHeader icon="🍳" iconBg="var(--color-berry-200)" title="What's for food?" />

  {#each byDay as day, di}
    <div class={di !== 0 ? 'mt-3.5 border-t border-sand-200 pt-3.5' : ''}>
      {#if day.date}
        <div class="mb-1 flex items-baseline gap-2">
          <span class="font-display text-base font-semibold text-cocoa-900">{fmtWeekday(day.date)}</span>
          <span class="font-body text-xs font-bold text-cocoa-400">{fmtMonthDay(day.date)}</span>
        </div>
      {/if}

      {#each day.items as m}
        {@const owner = iAmOwner(m)}
        {@const helper = iAmHelper(m)}
        <div class="py-2">
          <!-- highlighted meal: emoji tile + name + the dish (owner-editable) -->
          <div class="flex items-center gap-2.5">
            <span class="grid h-8 w-8 flex-none place-items-center rounded-md bg-sand-200 text-base">
              {mealEmoji(m)}
            </span>
            <span class="shrink-0 font-display text-[15px] font-semibold text-cocoa-900">{mealName(m)}</span>

            {#if owner}
              <input
                value={m.dish ?? ''}
                placeholder="+ add a dish"
                maxlength="300"
                onblur={(e) => saveDish(m, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                class="min-w-0 flex-1 rounded-md bg-sand-100 px-2 py-0.5 font-body text-[13px] font-bold text-cocoa-700 outline-none placeholder:font-bold placeholder:text-cocoa-400 focus:bg-white focus:ring-2 focus:ring-coral-200"
              />
            {:else if m.dish}
              <span class="min-w-0 truncate font-body text-[13px] font-bold text-cocoa-500">— {m.dish}</span>
            {/if}

            {#if currentParticipantId && !owner && !helper}
              <button
                type="button"
                disabled={busy === m.id}
                onclick={() => (m.ownerParticipant ? help(m) : take(m))}
                class="ml-auto shrink-0 rounded-full bg-sun-200 px-3 py-1 font-display text-[12px] font-semibold text-sun-600 transition hover:bg-sun-300 disabled:opacity-50"
              >
                {busy === m.id ? '…' : m.ownerParticipant ? '+ Help out' : "I'll cook this"}
              </button>
            {/if}
          </div>

          <!-- owner + helpers, or empty state -->
          <div class="mt-1.5 pl-[42px]">
            {#if m.ownerParticipant}
              <ul class="flex flex-col gap-1.5">
                <li class="flex items-center gap-2">
                  <Avatar name={m.ownerName} size={22} />
                  <span class="shrink-0 font-body text-[13px] font-extrabold text-cocoa-900">
                    {m.ownerName}{#if owner}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
                  </span>
                  <span class="shrink-0 font-body text-[10.5px] font-extrabold uppercase tracking-wide text-coral-600">owner</span>
                  {#if owner}
                    {#if confirmDrop === m.id}
                      <span class="ml-auto flex shrink-0 items-center gap-2">
                        <span class="font-body text-[12px] font-bold text-cocoa-500">Clear everyone?</span>
                        <button type="button" onclick={() => drop(m)} class="font-body text-[12px] font-extrabold text-berry-600">Reset</button>
                        <button type="button" onclick={() => (confirmDrop = '')} class="font-body text-[12px] font-extrabold text-cocoa-400">Cancel</button>
                      </span>
                    {:else}
                      <button
                        type="button"
                        onclick={() => (confirmDrop = m.id)}
                        class="ml-auto shrink-0 font-body text-[12px] font-extrabold text-cocoa-400 hover:text-coral-600"
                      >
                        Drop
                      </button>
                    {/if}
                  {/if}
                </li>

                {#each m.helpers as h}
                  <li class="flex items-center gap-2">
                    <Avatar name={h.name} size={22} />
                    <span class="shrink-0 font-body text-[13px] font-extrabold text-cocoa-900">
                      {h.name}{#if h.participant === currentParticipantId}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
                    </span>
                    {#if h.participant === currentParticipantId}
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onclick={() => drop(m)}
                        class="ml-auto shrink-0 font-body text-[12px] font-extrabold text-cocoa-400 hover:text-coral-600"
                      >
                        Leave
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="font-body text-[12.5px] font-bold text-cocoa-400">Nobody's on it yet — pitch in!</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/each}
</Card>
