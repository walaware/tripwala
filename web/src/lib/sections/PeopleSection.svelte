<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, SegmentedControl, LeanMeter, Chip, Button } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import StatusAvatar from '$lib/ui/StatusAvatar.svelte';
  import { statusOf, countByStatus, summarise } from '$lib/peopleStatus.js';
  import TripInviteModal from '$lib/sections/TripInviteModal.svelte';
  import JoinRequests from '$lib/sections/JoinRequests.svelte';

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
   *   emailEnabled?: boolean,
   *   members?: Array<{ id: string, display_name: string, role: string }>,
   *   pending?: Array<{ id: string, display_name: string, avatar?: string }>,
   *   invites?: Array<{ id: string, email: string, role: string, invitedBy?: string | null }>,
   *   tripInvitations?: Array<{ id: string, name: string, avatar?: string, role: string }>,
   *   invitedCount?: number
   * }}
   */
  let { shareToken, participants, currentParticipantId, ownerMode = false, onHide = null,
    onSettings = null, collapsed = false, onToggle = null, isPast = false, invitableFriends = [],
    inviteVisibility = 'everyone', joinPolicy = 'instant', inviteUrl = '', ownerUrl = '', emailEnabled = false,
    members = [], pending = [], invites = [], tripInvitations = [], invitedCount = 0 } = $props();

  // Inviting is a one-tap action from this header (the ＋ button → a Modal),
  // allowed for everyone unless the trip restricts invites to organizers.
  const canInvite = $derived(!isPast && (ownerMode || inviteVisibility !== 'organizers'));
  const showInvite = $derived(ownerMode || inviteVisibility === 'everyone');
  let inviteOpen = $state(false);

  // Roles management (organizers) lives here on the people surface now — moved
  // out of Trip settings. Uses the shared tripAction op endpoint.
  let rolesBusy = $state('');
  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (rolesBusy) return;
    rolesBusy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      rolesBusy = '';
    }
  }

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
  const me = $derived(participants.find((p) => p.id === currentParticipantId) ?? null);

  // Everyone who's been asked but isn't on the trip yet, from both invite paths:
  // friend invitations (a known account, has a name + face) and email invites (an
  // address only). Shown as ghost pills so "invited" reads as a real status
  // rather than something you have to go hunting for.
  const invitedPeople = $derived(
    isPast
      ? []
      : [
          ...tripInvitations.map((i) => ({
            key: `friend-${i.id}`,
            label: i.name,
            avatar: i.avatar,
            detail: i.role === 'organizer' ? 'invited as organizer' : 'invited'
          })),
          ...invites.map((i) => ({
            key: `email-${i.id}`,
            label: i.email,
            avatar: '',
            detail: i.invitedBy ? `invited by ${i.invitedBy}` : 'invited by email'
          }))
        ]
  );
  // Email addresses aren't the whole crew's business — non-organizers get the
  // headcount only (`invitedCount`, always supplied), organizers get the names.
  const showInvitedPills = $derived(ownerMode && invitedPeople.length > 0);
  const outstanding = $derived(isPast ? 0 : invitedCount);
  const counts = $derived(countByStatus(participants, outstanding));
  const summary = $derived(summarise(counts));

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
    {#if isPast}
      <Chip tone="leaf">{counts.going} went</Chip>
    {:else}
      <!-- Every status that has anyone in it, so "3 invited" and "2 no answer"
           are as visible as "4 going" — that's the whole point of the line. -->
      {#each summary as s (s.key)}
        <Chip tone={s.tone}>{s.count} {s.key === 'no_answer' ? 'no answer' : s.key === 'out' ? "can't" : s.key}</Chip>
      {/each}
    {/if}
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
        <StatusAvatar
          name={p.display_name}
          src={p.avatar}
          size={26}
          status={statusOf(p).key}
          dim={p.rsvp_status === 'out'}
        />
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
          <!-- Status itself is on the avatar badge now; "maybe" still earns the
               extra detail of how likely they are. -->
          <LeanMeter lean={leanOf(p.lean || 2)} showLabel={false} />
        {/if}
        {#if p.arrival}
          <span class="text-[13px]" title={ARRIVAL_OPTS.find((o) => o.value === p.arrival)?.label}>{arrivalEmoji[p.arrival]}</span>
        {/if}
      </span>
    {/each}

    <!-- Asked, but not on the trip yet. Dashed + faded so they read as "not here
         yet" rather than crew, but they're on the same row so nobody has to go
         looking for who's still outstanding. -->
    {#each invitedPeople as inv (inv.key)}
      <span
        class="flex items-center gap-1.5 rounded-full border-2 border-dashed border-sand-300 py-1 pl-1 pr-3"
        class:hidden={!showInvitedPills}
        title={inv.detail}
      >
        <StatusAvatar name={inv.label} src={inv.avatar} size={26} status="invited" dim />
        <span class="max-w-[11rem] truncate font-body text-[13px] font-bold text-cocoa-500">{inv.label}</span>
      </span>
    {/each}

    {#if outstanding > 0 && !showInvitedPills}
      <span class="flex items-center rounded-full border-2 border-dashed border-sand-300 px-3 py-1 font-body text-[13px] font-bold text-cocoa-500">
        ✉️ {outstanding} invited, waiting to hear back
      </span>
    {/if}
  </div>

  {#if ownerMode && !isPast}
    <div class="mb-3.5 -mt-1.5">
      <a
        href="/{shareToken}/people"
        class="font-body text-[12.5px] font-extrabold text-coral-600 underline-offset-2 hover:underline"
      >Manage everyone →</a>
    </div>
  {/if}

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

{#if ownerMode && !isPast && pending.length}
  <!-- Only the approval queue stays on the card — it's time-sensitive and someone
       is actively waiting. The rest of people management (roles, remove, resend
       and revoke invites) lives on the People page so there's one place for it. -->
  <Card class="mt-3">
    <JoinRequests {pending} busy={rolesBusy} {act} />
  </Card>
{/if}

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
    {inviteVisibility}
    {invitableFriends}
    {emailEnabled}
  />
{/if}
