<script>
  import { Button, DateField } from '@walaware/design';
  import { inputClass, labelClass } from './styles.js';

  /**
   * The organizer's edit-the-trip form. Seeded from the trip record and
   * re-seeded whenever it changes underneath us (another organizer saving).
   *
   * @type {{
   *   trip: any,
   *   busy: string,
   *   savedFlash: boolean,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let { trip, busy, savedFlash, act } = $props();

  const TYPES = [
    ['camping', '🏕️ Camping'], ['backpacking', '🎒 Backpacking'], ['road_trip', '🚗 Road trip'],
    ['cabin', '🛖 Cabin'], ['ski', '⛷️ Ski'], ['beach', '🏖️ Beach'], ['city', '🏙️ City'],
    ['festival', '🎪 Festival'], ['other', '🧭 Other']
  ];

  /** Stored `<p>…</p>`+`<br>` → plain text for the textarea. @param {string} html */
  const descToText = (html) =>
    (html || '').replace(/^<p>/i, '').replace(/<\/p>$/i, '').replace(/<br\s*\/?>/gi, '\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /** @param {string} d */
  const ymd = (d) => (d || '').slice(0, 10);

  let form = $state({ name: '', trip_type: '', location: '', start_date: '', end_date: '', description: '', emergency_info: '', expense_link: '', min_nights: 0 });
  let seeded = '';
  $effect(() => {
    const sig = `${trip.name}|${trip.start_date}|${trip.description}|${trip.emergency_info}|${trip.min_nights}`;
    if (sig !== seeded) {
      seeded = sig;
      form = {
        name: trip.name || '',
        trip_type: trip.trip_type || '',
        location: trip.location || '',
        start_date: ymd(trip.start_date),
        end_date: ymd(trip.end_date),
        description: descToText(trip.description),
        emergency_info: trip.emergency_info || '',
        expense_link: trip.expense_link || '',
        min_nights: trip.min_nights || 0
      };
    }
  });
</script>

<div class="flex flex-col gap-2.5">
  <div>
    <label class={labelClass} for="ts-name">Trip name</label>
    <input id="ts-name" bind:value={form.name} maxlength="200" class={inputClass} />
  </div>
  <div class="flex gap-2.5">
    <div class="min-w-0 flex-1">
      <label class={labelClass} for="ts-type">Type</label>
      <select id="ts-type" bind:value={form.trip_type} class={inputClass}>
        <option value="">Pick one…</option>
        {#each TYPES as [v, l]}<option value={v}>{l}</option>{/each}
      </select>
    </div>
    <div class="min-w-0 flex-1">
      <label class={labelClass} for="ts-loc">Where</label>
      <input id="ts-loc" bind:value={form.location} maxlength="300" class={inputClass} />
    </div>
  </div>
  <DateField range bind:start={form.start_date} bind:end={form.end_date} startLabel="Start" endLabel="End" />
  <div>
    <label class={labelClass} for="ts-min-nights">Minimum nights</label>
    <input id="ts-min-nights" type="number" inputmode="numeric" min="0" max="365" bind:value={form.min_nights} class={inputClass} />
    <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">
      {Number(form.min_nights) > 0
        ? `Proposed dates must span at least ${form.min_nights} night${Number(form.min_nights) === 1 ? '' : 's'}.`
        : '0 = no minimum. Set this so nobody proposes a single-day trip.'}
    </p>
  </div>
  <div>
    <label class={labelClass} for="ts-desc">The plan</label>
    <textarea id="ts-desc" bind:value={form.description} rows="3" maxlength="5000" class={inputClass}></textarea>
  </div>
  <div>
    <label class={labelClass} for="ts-emergency">🚨 Emergency info</label>
    <textarea id="ts-emergency" bind:value={form.emergency_info} rows="3" maxlength="2000" placeholder="Nearest hospital, ranger/park station, emergency contacts…" class={inputClass}></textarea>
    <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">Shown to everyone as a Safety card — handy for backcountry trips.</p>
  </div>
  <div>
    <label class={labelClass} for="ts-exp">Expense-split link</label>
    <input id="ts-exp" bind:value={form.expense_link} inputmode="url" placeholder="https://spliit.app/…" class={inputClass} />
  </div>
  <div class="flex items-center gap-2">
    <Button variant="primary" size="md" disabled={busy === 'trip_update' || !form.name.trim()} onclick={() => act('trip_update', form)}>
      {busy === 'trip_update' ? 'Saving…' : 'Save changes'}
    </Button>
    {#if savedFlash}<span class="font-body text-[12px] font-extrabold text-leaf-600">Saved ✓</span>{/if}
  </div>
</div>
