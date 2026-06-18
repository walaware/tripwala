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

  // Group slots by day so we show "Friday" once with its meals underneath,
  // instead of repeating "Fri Breakfast / Fri Lunch / …". meals arrive sorted
  // by sort_order, so insertion order is already chronological.
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

  /** Meal name without the weekday prefix: "Fri Breakfast" → "Breakfast". */
  const mealName = (/** @type {any} */ m) => m.label.split(' ').slice(1).join(' ') || m.label;

  /** @type {Record<string, string>} */
  const MEAL_EMOJI = { breakfast: '🥞', lunch: '🥪', dinner: '🍲', snack: '🍿', snacks: '🍿', dessert: '🍪' };
  const mealEmoji = (/** @type {any} */ m) => MEAL_EMOJI[mealName(m).toLowerCase()] ?? '🍴';

  function mySignup(/** @type {any} */ m) {
    return m.signups.find((/** @type {any} */ s) => s.participant === currentParticipantId) ?? null;
  }

  /** @param {any} m */
  async function signUp(m) {
    if (!currentParticipantId || busy) return;
    busy = m.id;
    try {
      await tripAction(shareToken, { op: 'meal_signup', mealSlotId: m.id, participantId: currentParticipantId });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }

  /** @param {any} m */
  async function cancel(m) {
    const mine = mySignup(m);
    if (!mine || busy) return;
    busy = m.id;
    try {
      await tripAction(shareToken, { op: 'meal_cancel', mealSlotId: m.id, participantId: currentParticipantId });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }

  /** @param {string} signupId @param {string} note */
  async function saveNote(signupId, note) {
    try {
      await tripAction(shareToken, { op: 'meal_note', signupId, note });
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
        {@const mine = mySignup(m)}
        <div class="py-2">
          <!-- highlighted meal: emoji tile + name -->
          <div class="flex items-center gap-2.5">
            <span class="grid h-8 w-8 flex-none place-items-center rounded-md bg-sand-200 text-base">
              {mealEmoji(m)}
            </span>
            <span class="font-display text-[15px] font-semibold text-cocoa-900">{mealName(m)}</span>
            {#if currentParticipantId && !mine}
              <button
                type="button"
                disabled={busy === m.id}
                onclick={() => signUp(m)}
                class="ml-auto shrink-0 rounded-full bg-sun-200 px-3 py-1 font-display text-[12px] font-semibold text-sun-600 transition hover:bg-sun-300 disabled:opacity-50"
              >
                {busy === m.id ? '…' : m.signups.length ? '+ Help too' : "+ I'll help"}
              </button>
            {/if}
          </div>

          <!-- helpers underneath, aligned past the tile -->
          <div class="mt-1.5 pl-[42px]">
            {#if m.signups.length}
              <ul class="flex flex-col gap-1.5">
                {#each m.signups as s}
                  <li class="flex items-center gap-2">
                    <Avatar name={s.participantName} size={22} />
                    <span class="shrink-0 font-body text-[13px] font-extrabold text-cocoa-900">
                      {s.participantName}{#if s.participant === currentParticipantId}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
                    </span>
                    {#if s.participant === currentParticipantId}
                      <input
                        value={s.dish_note ?? ''}
                        placeholder="+ add a dish"
                        maxlength="300"
                        onblur={(e) => saveNote(s.id, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                        class="min-w-0 flex-1 rounded-md bg-sand-100 px-2 py-0.5 font-body text-[13px] font-bold text-cocoa-700 outline-none placeholder:font-bold placeholder:text-cocoa-400 focus:bg-white focus:ring-2 focus:ring-coral-200"
                      />
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onclick={() => cancel(m)}
                        class="shrink-0 font-body text-[12px] font-extrabold text-cocoa-400 hover:text-coral-600"
                      >
                        Drop
                      </button>
                    {:else if s.dish_note}
                      <span class="min-w-0 truncate font-body text-[13px] font-bold text-cocoa-500">· {s.dish_note}</span>
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
