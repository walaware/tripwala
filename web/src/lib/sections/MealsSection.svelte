<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import Card from '$lib/ui/Card.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { fmtDate } from '$lib/format.js';

  /**
   * @type {{
   *   shareToken: string,
   *   meals: Array<any>,
   *   currentParticipantId: string | null
   * }}
   */
  let { shareToken, meals, currentParticipantId } = $props();

  let busy = $state('');

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
  {#each meals as m, i}
    {@const mine = mySignup(m)}
    <div class="py-3 {i !== 0 ? 'border-t border-sand-200' : ''}">
      <!-- meal label + date + help affordance -->
      <div class="flex items-center gap-2">
        <span class="font-body text-sm font-extrabold text-cocoa-900">{m.label}</span>
        {#if m.date}<span class="ml-auto shrink-0 font-body text-xs font-bold text-cocoa-400">{fmtDate(m.date)}</span>{/if}
        {#if currentParticipantId && !mine}
          <button
            type="button"
            disabled={busy === m.id}
            onclick={() => signUp(m)}
            class="{m.date ? '' : 'ml-auto'} shrink-0 rounded-full bg-sun-200 px-3 py-1 font-display text-[12px] font-semibold text-sun-600 transition hover:bg-sun-300 disabled:opacity-50"
          >
            {busy === m.id ? '…' : m.signups.length ? '+ Help too' : "+ I'll help"}
          </button>
        {/if}
      </div>

      <!-- who's helping (a meal can be a team) -->
      {#if m.signups.length}
        <ul class="mt-2 flex flex-col gap-1.5">
          {#each m.signups as s}
            <li class="flex items-center gap-2">
              <Avatar name={s.participantName} size={22} />
              {#if s.participant === currentParticipantId}
                <input
                  value={s.dish_note ?? ''}
                  placeholder="add what you're bringing…"
                  maxlength="300"
                  onblur={(e) => saveNote(s.id, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                  class="min-w-0 flex-1 rounded-md border-2 border-sand-300 bg-white px-2.5 py-1 font-body text-[13px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
                />
                <button
                  type="button"
                  disabled={busy === m.id}
                  onclick={() => cancel(m)}
                  class="shrink-0 font-body text-[12px] font-extrabold text-cocoa-400 hover:text-coral-600"
                >
                  Drop
                </button>
              {:else}
                <span class="shrink-0 font-body text-[13px] font-extrabold text-cocoa-900">{s.participantName}</span>
                {#if s.dish_note}
                  <span class="min-w-0 truncate font-body text-[13px] font-bold text-cocoa-500">· {s.dish_note}</span>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-1.5 font-body text-[13px] font-bold text-cocoa-500">Nobody's on it yet — pitch in!</p>
      {/if}
    </div>
  {/each}
</Card>
