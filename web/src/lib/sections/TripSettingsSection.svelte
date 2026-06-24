<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Avatar, Button } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @type {{
   *   shareToken: string,
   *   ownerMode?: boolean,
   *   me?: { name: string, notify?: boolean } | null,
   *   trip: any,
   *   members?: Array<{ id: string, display_name: string, role: string }>,
   *   currentParticipantId?: string | null,
   *   showSections?: boolean
   * }}
   */
  let { shareToken, ownerMode = false, me = null, trip, members = [], currentParticipantId = null, showSections = true } = $props();

  const TYPES = [
    ['camping', '🏕️ Camping'], ['backpacking', '🎒 Backpacking'], ['road_trip', '🚗 Road trip'],
    ['cabin', '🛖 Cabin'], ['ski', '⛷️ Ski'], ['beach', '🏖️ Beach'], ['city', '🏙️ City'],
    ['festival', '🎪 Festival'], ['other', '🧭 Other']
  ];
  // Hideable modules (Overview + Trip settings are always shown).
  const HIDEABLE = [
    ['dates', '📅 Dates'], ['crew', "🙌 Who's coming"], ['gear', '🎒 Gear'],
    ['food', '🍳 Food'], ['packing', '🧳 Packing'], ['expenses', '💸 Expenses']
  ];

  /** Stored `<p>…</p>`+`<br>` → plain text for the textarea. @param {string} html */
  const descToText = (html) =>
    (html || '').replace(/^<p>/i, '').replace(/<\/p>$/i, '').replace(/<br\s*\/?>/gi, '\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /** @param {string} d */
  const ymd = (d) => (d || '').slice(0, 10);

  // Details form state (organizer). Seeded from the trip; re-seed if it changes.
  let form = $state({ name: '', trip_type: '', location: '', start_date: '', end_date: '', description: '', expense_link: '' });
  let seeded = '';
  $effect(() => {
    const sig = `${trip.name}|${trip.start_date}|${trip.description}`;
    if (sig !== seeded) {
      seeded = sig;
      form = {
        name: trip.name || '',
        trip_type: trip.trip_type || '',
        location: trip.location || '',
        start_date: ymd(trip.start_date),
        end_date: ymd(trip.end_date),
        description: descToText(trip.description),
        expense_link: trip.expense_link || ''
      };
    }
  });

  let busy = $state('');
  let savedFlash = $state(false);
  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
      if (op === 'trip_update') {
        savedFlash = true;
        setTimeout(() => (savedFlash = false), 1500);
      }
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  async function leave() {
    if (busy) return;
    if (!confirm('Leave this trip? You can re-join later from the invite link.')) return;
    busy = 'leave';
    try {
      await tripAction(shareToken, { op: 'leave_trip' });
      await goto('/');
    } catch (_) {
      busy = '';
    }
  }

  const hidden = $derived(new Set(trip.hidden_sections ?? []));
  const ownerUrl = $derived(`${page.url.origin}/${shareToken}/edit?owner=${trip.owner_token}`);
  let copied = $state(false);
  async function copyOwner() {
    try {
      await navigator.clipboard.writeText(ownerUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (_) { /* clipboard blocked */ }
  }

  const notifyOn = $derived(me?.notify !== false);
  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2.5 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
  const labelClass = 'mb-1 block font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500';
</script>

<SectionHeader emoji="⚙️" title="Trip settings" />
<div class="flex flex-col gap-3.5">
  <!-- Everyone: your own preferences -->
  {#if me}
    <Card>
      <div class="flex items-center gap-3 py-1">
        <span class="w-6 text-center text-[18px]">🔔</span>
        <div class="min-w-0 flex-1">
          <div class="font-body text-[14.5px] font-extrabold text-text-strong">Trip notifications</div>
          <div class="font-body text-[12.5px] font-bold text-text-muted">Claims, RSVPs and meal updates</div>
        </div>
        <button
          type="button" role="switch" aria-checked={notifyOn} aria-label="Trip notifications"
          disabled={busy === 'notify_toggle'} onclick={() => act('notify_toggle')}
          class="flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors {notifyOn ? 'justify-end bg-[var(--color-primary)]' : 'justify-start bg-sand-300'}"
        ><span class="block h-[22px] w-[22px] rounded-full bg-white shadow-soft"></span></button>
      </div>
      <div class="flex items-center justify-between gap-3 border-t border-sand-200 pt-3.5">
        <div class="flex items-center gap-3">
          <span class="w-6 text-center text-[18px]">🚪</span>
          <div>
            <div class="font-body text-[14.5px] font-extrabold text-text-strong">Leave this trip</div>
            <div class="font-body text-[12.5px] font-bold text-text-muted">You'll stop getting updates</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" disabled={busy === 'leave'} onclick={leave}>Leave</Button>
      </div>
    </Card>
  {/if}

  {#if ownerMode}
    <!-- Organizer: edit trip details -->
    <Card>
      <div class="mb-2.5 flex items-center gap-2">
        <span class="font-display text-[15px] font-bold text-text-strong">Edit trip details</span>
        {#if savedFlash}<span class="font-body text-[12px] font-extrabold text-leaf-600">Saved ✓</span>{/if}
      </div>
      <div class="flex flex-col gap-2.5">
        <div>
          <label class={labelClass} for="ts-name">Trip name</label>
          <input id="ts-name" bind:value={form.name} maxlength="200" class={inputClass} />
        </div>
        <div class="flex gap-2.5">
          <div class="flex-1">
            <label class={labelClass} for="ts-type">Type</label>
            <select id="ts-type" bind:value={form.trip_type} class={inputClass}>
              <option value="">Pick one…</option>
              {#each TYPES as [v, l]}<option value={v}>{l}</option>{/each}
            </select>
          </div>
          <div class="flex-1">
            <label class={labelClass} for="ts-loc">Where</label>
            <input id="ts-loc" bind:value={form.location} maxlength="300" class={inputClass} />
          </div>
        </div>
        <div class="flex gap-2.5">
          <div class="flex-1">
            <label class={labelClass} for="ts-start">Start</label>
            <input id="ts-start" type="date" bind:value={form.start_date} class={inputClass} />
          </div>
          <div class="flex-1">
            <label class={labelClass} for="ts-end">End</label>
            <input id="ts-end" type="date" bind:value={form.end_date} min={form.start_date} class={inputClass} />
          </div>
        </div>
        <div>
          <label class={labelClass} for="ts-desc">The plan</label>
          <textarea id="ts-desc" bind:value={form.description} rows="3" maxlength="5000" class={inputClass}></textarea>
        </div>
        <div>
          <label class={labelClass} for="ts-exp">Expense-split link</label>
          <input id="ts-exp" bind:value={form.expense_link} inputmode="url" placeholder="https://spliit.app/…" class={inputClass} />
        </div>
        <Button variant="primary" size="md" disabled={busy === 'trip_update' || !form.name.trim()} onclick={() => act('trip_update', form)}>
          {busy === 'trip_update' ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Card>

    <!-- Organizer: section visibility -->
    {#if showSections}
    <Card>
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Sections</div>
      <div class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">Hide a section for everyone on the trip. Restore it any time.</div>
      {#each HIDEABLE as [key, label], i}
        {@const off = hidden.has(key)}
        <div class="flex items-center gap-3 py-2.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
          <span class="min-w-0 flex-1 font-body text-[14px] font-extrabold {off ? 'text-cocoa-400' : 'text-cocoa-900'}">{label}{#if off}<span class="font-bold text-cocoa-400"> · hidden</span>{/if}</span>
          <button
            type="button" role="switch" aria-checked={!off} aria-label="Show {label}"
            disabled={busy === 'sec-' + key} onclick={() => act(off ? 'section_show' : 'section_hide', { key }, 'sec-' + key)}
            class="flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors {off ? 'justify-start bg-sand-300' : 'justify-end bg-[var(--color-primary)]'}"
          ><span class="block h-[22px] w-[22px] rounded-full bg-white shadow-soft"></span></button>
        </div>
      {/each}
    </Card>

    {/if}

    <!-- Organizer: members -->
    <Card>
      <div class="mb-2.5 font-display text-[15px] font-bold text-text-strong">Members</div>
      <div class="flex flex-col gap-2">
        {#each members as m (m.id)}
          <div class="flex items-center gap-2.5 rounded-xl bg-sand-50 px-2.5 py-2">
            <Avatar name={m.display_name} size={30} />
            <div class="min-w-0 flex-1">
              <div class="truncate font-body text-[14px] font-extrabold text-cocoa-900">
                {m.display_name}{#if m.id === currentParticipantId}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
              </div>
              <div class="font-body text-[11px] font-extrabold uppercase tracking-wide {m.role === 'organizer' ? 'text-coral-600' : 'text-cocoa-400'}">
                {m.role === 'organizer' ? '✨ Organizer' : 'Guest'}
              </div>
            </div>
            <div class="flex shrink-0 gap-1.5">
              <button
                type="button" disabled={busy === 'role-' + m.id}
                onclick={() => act('set_role', { participantId: m.id, role: m.role === 'organizer' ? 'guest' : 'organizer' }, 'role-' + m.id)}
                class="rounded-full border-2 border-sand-300 px-2.5 py-1 font-body text-[12px] font-extrabold text-cocoa-700 hover:border-coral-300"
              >{m.role === 'organizer' ? 'Make guest' : 'Make organizer'}</button>
              {#if m.id !== currentParticipantId}
                <button
                  type="button" disabled={busy === 'rm-' + m.id} title="Remove from trip"
                  onclick={() => act('remove_member', { participantId: m.id }, 'rm-' + m.id)}
                  class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200"
                >Remove</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-2.5 font-body text-[11.5px] font-bold text-cocoa-400">Name-only guests (not signed in) appear on the trip, not here.</p>
    </Card>

    <!-- Organizer: co-organizer link -->
    <Card>
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Co-organizer link</div>
      <p class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">Send to someone you want to co-run the trip — they sign in and become an organizer. Keep it private.</p>
      <div class="flex gap-2">
        <input readonly value={ownerUrl} class="{inputClass} flex-1 bg-sun-100" />
        <Button variant="soft" size="md" onclick={copyOwner}>{copied ? 'Copied!' : 'Copy'}</Button>
      </div>
    </Card>
  {/if}
</div>
