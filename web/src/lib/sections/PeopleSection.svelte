<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Avatar, SegmentedControl, LeanMeter, Chip, Button } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import TripInviteModal from '$lib/sections/TripInviteModal.svelte';

  // LeanMeter's `lean` prop is a 1|2|3 union; narrow the raw number to it.
  /** @param {number} n @returns {1 | 2 | 3} */
  const leanOf = (n) => (n >= 3 ? 3 : n <= 1 ? 1 : 2);

  /**
   * @type {{
   *   shareToken: string,
   *   participants: Array<{ id: string, display_name: string, rsvp_status: string | null, lean: number, avatar?: string, dietary?: string, arrival?: string }>,
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null,
   *   isPast?: boolean,
   *   invitableFriends?: Array<{ id: string, name: string, avatar?: string }>,
   *   inviteVisibility?: string,
   *   joinPolicy?: string,
   *   inviteUrl?: string,
   *   ownerUrl?: string,
   *   emailEnabled?: boolean
   * }}
   */
  let { shareToken, participants, currentParticipantId, ownerMode = false, onHide = null,
    onSettings = null, collapsed = false, onToggle = null, isPast = false, invitableFriends = [],
    inviteVisibility = 'everyone', joinPolicy = 'instant', inviteUrl = '', ownerUrl = '', emailEnabled = false } = $props();

  // Inviting is a one-tap action from this header (the ＋ button → a Modal),
  // allowed for everyone unless the trip restricts invites to organizers.
  const canInvite = $derived(!isPast && (ownerMode || inviteVisibility !== 'organizers'));
  const showInvite = $derived(ownerMode || inviteVisibility === 'everyone');
  let inviteOpen = $state(false);

  /** @type {Record<string, string>} */
  const statusEmoji = { going: '🔥', maybe: '🤔', out: '💤' };
  const RSVP_OPTS = [
    { value: 'going', emoji: '🔥' },
    { value: 'maybe', emoji: '🤔' },
    { value: 'out', emoji: '💤' }
  ];
  const LEAN_OPTS = [
    { v: 1, label: 'Long shot' },
    { v: 2, label: '50 / 50' },
    { v: 3, label: 'Leaning yes' }
  ];
  const going = $derived(participants.filter((p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((p) => p.rsvp_status === 'maybe').length);
  const me = $derived(participants.find((p) => p.id === currentParticipantId) ?? null);

  let saving = $state(false);
  /** participant id currently being saved (owner edits) */
  let savingId = $state('');

  /** @param {string} status @param {string} [participantId] */
  async function setRsvp(status, participantId) {
    const id = participantId ?? currentParticipantId;
    if (!id || saving || savingId) return;
    if (participantId) savingId = participantId;
    else saving = true;
    try {
      await tripAction(shareToken, { op: 'rsvp', participantId: id, status });
      await invalidateAll();
    } catch (_) {
      // next load / poll will reconcile
    } finally {
      saving = false;
      savingId = '';
    }
  }

  /** @param {number} lean */
  async function setLean(lean) {
    if (!currentParticipantId || saving) return;
    saving = true;
    try {
      await tripAction(shareToken, { op: 'lean', participantId: currentParticipantId, lean });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      saving = false;
    }
  }

  // Live check-in (#11). '' = not checked in.
  /** @type {Record<string, string>} */
  const arrivalEmoji = { not_left: '🏠', en_route: '🚗', arrived: '✅' };
  const ARRIVAL_OPTS = [
    { value: 'not_left', emoji: '🏠', label: 'Not left' },
    { value: 'en_route', emoji: '🚗', label: 'En route' },
    { value: 'arrived', emoji: '✅', label: 'Arrived' }
  ];
  // Anyone who's checked in — drives the "who's here" summary line.
  const checkedIn = $derived(participants.filter((p) => p.arrival));

  /** Set my arrival; tapping the current one again clears it. @param {string} value */
  async function setArrival(value) {
    if (!currentParticipantId || saving) return;
    saving = true;
    const next = me?.arrival === value ? '' : value;
    try {
      await tripAction(shareToken, { op: 'set_arrival', participantId: currentParticipantId, arrival: next });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      saving = false;
    }
  }

  // Everyone with a dietary note set — shown to the crew (and the cooks via Meals).
  const dietaryList = $derived(participants.filter((p) => (p.dietary || '').trim()));

  /** @param {string} dietary */
  async function saveDietary(dietary) {
    if (!currentParticipantId || (me?.dietary ?? '') === dietary) return;
    try {
      await tripAction(shareToken, { op: 'set_dietary', participantId: currentParticipantId, dietary });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    }
  }
</script>

<SectionHeader emoji="🙌" title={isPast ? 'Who went' : "Who's in"} {onHide} {onSettings} {collapsed} {onToggle}>
  {#snippet action()}
    <Chip tone="leaf">{going} {isPast ? 'went' : 'going'}</Chip>
    {#if maybe > 0 && !isPast}<Chip tone="sun">{maybe} maybe</Chip>{/if}
    {#if canInvite}
      <Button variant="soft" size="sm" onclick={() => (inviteOpen = true)}>＋ Invite</Button>
    {/if}
  {/snippet}
</SectionHeader>

<Card>
  <!-- Crew as avatar pills (the mock's roster). Owners get inline RSVP controls
       on each pill; everyone else sees the person's status glyph. -->
  <div class="mb-3.5 flex flex-wrap gap-2">
    {#each participants as p}
      <span
        class="flex items-center gap-1.5 rounded-full bg-sand-100 py-1 pl-1 pr-3"
        class:opacity-50={p.rsvp_status === 'out'}
      >
        <Avatar name={p.display_name} src={p.avatar} size={26} />
        <span class="font-body text-[13px] font-extrabold text-cocoa-900">
          {p.display_name}{#if p.id === currentParticipantId}<span class="font-bold text-cocoa-500"> (you)</span>{/if}
        </span>
        {#if ownerMode}
          <span class="ml-0.5 flex gap-0.5">
            {#each RSVP_OPTS as opt}
              <button
                type="button"
                disabled={savingId === p.id}
                aria-label="Set {p.display_name} {opt.value}"
                onclick={() => setRsvp(opt.value, p.id)}
                class="grid h-6 w-6 place-items-center rounded-full text-[12px] transition
                  {p.rsvp_status === opt.value ? 'bg-white shadow-soft' : 'opacity-35 hover:opacity-70'}"
              >
                {opt.emoji}
              </button>
            {/each}
          </span>
        {:else if p.rsvp_status === 'maybe'}
          <LeanMeter lean={leanOf(p.lean || 2)} showLabel={false} />
        {:else if p.rsvp_status}
          <span class="text-[13px]">{statusEmoji[p.rsvp_status]}</span>
        {/if}
        {#if p.arrival}
          <span class="text-[13px]" title={ARRIVAL_OPTS.find((o) => o.value === p.arrival)?.label}>{arrivalEmoji[p.arrival]}</span>
        {/if}
      </span>
    {/each}
  </div>

  <div class="mb-1.5 font-body text-[12.5px] font-extrabold text-cocoa-500">
    {me ? 'Your answer' : 'Claim a name above to RSVP'}
  </div>
  <SegmentedControl
    options={[
      { value: 'going', label: 'Going' },
      { value: 'maybe', label: 'Maybe' },
      { value: 'out', label: "Can't" }
    ]}
    value={me?.rsvp_status ?? null}
    onChange={setRsvp}
  />

  {#if me?.rsvp_status === 'maybe'}
    <div class="mt-2.5 rounded-md bg-sun-200 px-3 py-2.5">
      <div class="mb-2 font-body text-[12px] font-extrabold text-sun-600">How likely, really? 🤔</div>
      <div class="flex gap-1.5">
        {#each LEAN_OPTS as o}
          <button
            type="button"
            disabled={saving}
            onclick={() => setLean(o.v)}
            class="flex-1 rounded-full px-1 py-1.5 font-display text-[12px] font-semibold transition
              {(me.lean || 2) === o.v ? 'bg-white text-cocoa-900 shadow-soft' : 'bg-white/50 text-cocoa-700 hover:bg-white/80'}"
          >
            {o.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Live check-in (#11): your own arrival status + a who's-here summary. -->
  {#if me}
    <div class="mt-3.5 border-t border-sand-200 pt-3.5">
      <div class="mb-1.5 flex items-baseline justify-between gap-2">
        <span class="font-body text-[12.5px] font-extrabold text-cocoa-500">📍 Check in</span>
        {#if checkedIn.length}
          <span class="font-body text-[12px] font-bold text-cocoa-400">
            {checkedIn.filter((p) => p.arrival === 'arrived').length} here · {checkedIn.filter((p) => p.arrival === 'en_route').length} en route
          </span>
        {/if}
      </div>
      <div class="flex gap-1.5">
        {#each ARRIVAL_OPTS as o}
          <button
            type="button"
            disabled={saving}
            onclick={() => setArrival(o.value)}
            class="flex-1 rounded-full px-1 py-1.5 font-display text-[12px] font-semibold transition
              {me.arrival === o.value ? 'bg-coral-500 text-white shadow-soft' : 'bg-sand-100 text-cocoa-700 hover:bg-sand-200'}"
          >{o.emoji} {o.label}</button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Dietary needs: your own (editable) + everyone who's noted one. Surfaces in
       Meals so cooks can plan around allergies / preferences. -->
  <div class="mt-3.5 border-t border-sand-200 pt-3.5">
    <div class="mb-1.5 font-body text-[12.5px] font-extrabold text-cocoa-500">🥗 Dietary needs</div>
    {#if me}
      <input
        value={me.dietary ?? ''}
        placeholder="Yours — e.g. vegetarian, no nuts, gluten-free"
        maxlength="200"
        onblur={(e) => saveDietary(/** @type {HTMLInputElement} */ (e.currentTarget).value.trim())}
        class="w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[13px] font-bold text-cocoa-900 outline-none placeholder:font-bold placeholder:text-cocoa-400 focus:border-coral-400"
      />
    {/if}
    {#if dietaryList.length}
      <ul class="mt-2 flex flex-col gap-1">
        {#each dietaryList as p}
          <li class="font-body text-[13px] font-bold text-cocoa-600">
            <span class="font-extrabold text-cocoa-900">{p.display_name}</span> — {p.dietary}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-1.5 font-body text-[12.5px] font-bold text-cocoa-400">No notes yet — add yours so the cooks know.</p>
    {/if}
  </div>
</Card>

{#if canInvite}
  <TripInviteModal
    open={inviteOpen}
    onClose={() => (inviteOpen = false)}
    {shareToken}
    {inviteUrl}
    {ownerUrl}
    {showInvite}
    {ownerMode}
    {joinPolicy}
    {invitableFriends}
    {emailEnabled}
  />
{/if}
