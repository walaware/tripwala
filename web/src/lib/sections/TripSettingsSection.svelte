<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Button, Switch } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import SettingsGroup from './settings/SettingsGroup.svelte';
  import SettingRow from './settings/SettingRow.svelte';
  import InviteAccess from './settings/InviteAccess.svelte';
  import PeopleRoles from './settings/PeopleRoles.svelte';
  import TripDetailsForm from './settings/TripDetailsForm.svelte';
  import PhotoAlbum from './settings/PhotoAlbum.svelte';
  import StageSections from './settings/StageSections.svelte';
  import TripInviteModal from './TripInviteModal.svelte';

  /**
   * @type {{
   *   shareToken: string,
   *   ownerMode?: boolean,
   *   me?: { name: string, notify?: boolean } | null,
   *   trip: any,
   *   members?: Array<{ id: string, display_name: string, role: string }>,
   *   currentParticipantId?: string | null,
   *   showSections?: boolean,
   *   joinPolicy?: string,
   *   inviteVisibility?: string,
   *   pending?: Array<{ id: string, display_name: string, avatar?: string }>,
   *   invites?: Array<{ id: string, email: string, role: string }>,
   *   emailEnabled?: boolean,
   *   immichEnabled?: boolean,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    shareToken, ownerMode = false, me = null, trip, members = [], currentParticipantId = null,
    showSections = true, joinPolicy = 'instant', inviteVisibility = 'everyone', pending = [],
    invites = [], emailEnabled = false, immichEnabled = false, collapsed = false, onToggle = null
  } = $props();

  // Hideable modules (Overview + Trip settings are always shown).
  /** @type {Array<[string, string]>} */
  const HIDEABLE = [
    ['dates', '📅 Dates'], ['map', '🗺️ Map'], ['crew', '🙌 Members'], ['gear', '🎒 Gear'],
    ['food', '🍳 Food'], ['expenses', '💸 Expenses']
  ];

  let busy = $state('');
  let savedFlash = $state(false);
  let cloning = $state(false);

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

  // Single status control (Stage & sections). Moves the trip to any lifecycle
  // stage. Moving back to 'idea' drops it off the dated dashboard and reopens
  // the planning canvas, so it gets a reassuring confirm; the rest are cheap.
  /** @param {string} status */
  async function setStage(status) {
    if (busy || status === (trip.status || 'confirmed')) return;
    if (status === 'idea' && !confirm('Move this trip back to your Ideas wishlist? Everything is kept — it just leaves the calendar until you promote it again.')) return;
    await act('set_status', { status }, 'stage');
  }

  // Permanently delete the trip and everything under it (cascades server-side),
  // then bounce home. Irreversible, so double-confirm before firing.
  async function deleteTrip() {
    if (busy) return;
    if (!confirm(`Delete "${trip.name}" permanently? This removes the itinerary, gear, expenses, photo links and everyone's data for this trip. This cannot be undone.`)) return;
    busy = 'delete';
    try {
      await tripAction(shareToken, { op: 'delete_trip' });
      await goto('/');
    } catch (_) {
      busy = '';
    }
  }

  const hidden = $derived(new Set(trip.hidden_sections ?? []));
  const hiddenList = $derived(showSections ? HIDEABLE.filter(([key]) => hidden.has(key)) : []);
  const ownerUrl = $derived(`${page.url.origin}/${shareToken}/edit?owner=${trip.owner_token}`);
  // The invite link carries the trip's invite_token (join capability), distinct
  // from the bare share link which is view-only (#2).
  const inviteUrl = $derived(`${page.url.origin}/${shareToken}?invite=${trip.invite_token || ''}`);
  // Guests see the invite link only when the organizer allows it; organizers always do.
  const showInvite = $derived(ownerMode || inviteVisibility === 'everyone');
  const notifyOn = $derived(me?.notify !== false);

  // Accordion: one group open at a time. Nine stacked blocks used to make this
  // card the longest thing on the page — now the closed summaries carry the
  // state and you open only what you came for.
  let openGroup = $state('');
  let inviteOpen = $state(false);
  /** @param {string} key */
  const toggler = (key) => (/** @type {boolean} */ open) => (openGroup = open ? key : '');

  // Always available to owners: this is the one home for changing the trip's
  // stage and for deleting it, regardless of the current stage.
  const stageShown = $derived(ownerMode);
  const STAGE_LABELS = { idea: 'Idea', planning: 'In planning', confirmed: 'Confirmed', completed: 'Completed' };

  const inviteHint = $derived(
    ownerMode
      ? `${joinPolicy === 'approval' ? 'Request to join' : 'Instant join'} · ${inviteVisibility === 'organizers' ? 'organizers share' : 'everyone shares'}`
      : 'Share this trip'
  );
  const peopleHint = $derived(
    [
      `${members.length} with account${members.length === 1 ? '' : 's'}`,
      pending.length ? `${pending.length} waiting` : '',
      invites.length ? `${invites.length} invited` : ''
    ].filter(Boolean).join(' · ')
  );
  const photoHint = $derived((trip.photo_album_url || '').trim() ? 'Album linked' : 'No album yet');
  const stageHint = $derived(
    [
      STAGE_LABELS[/** @type {keyof typeof STAGE_LABELS} */ (trip.status)] || 'Confirmed',
      hiddenList.length ? `${hiddenList.length} hidden` : ''
    ].filter(Boolean).join(' · ')
  );
</script>

<SectionHeader emoji="⚙️" title="Settings" {collapsed} {onToggle} />
<Card>
  {#if me}
    <SettingsGroup icon="🔔" title="Yours" hint="Notifications, leave, clone" first open={openGroup === 'you'} onToggle={toggler('you')}>
      <SettingRow icon="🔔" title="Trip notifications" desc="Claims, RSVPs and meal updates" first>
        {#snippet control()}
          <Switch
            checked={notifyOn}
            ariaLabel="Trip notifications"
            disabled={busy === 'notify_toggle'}
            onChange={() => act('notify_toggle')}
          />
        {/snippet}
      </SettingRow>

      <SettingRow icon="🚪" title="Leave this trip" desc="You'll stop getting updates">
        {#snippet control()}
          <Button variant="ghost" size="sm" disabled={busy === 'leave'} onclick={leave}>Leave</Button>
        {/snippet}
      </SettingRow>

      <!-- Clone: copy this trip's gear/packing/meals into a new planning trip you own. -->
      <form
        method="POST"
        action="?/clone"
        use:enhance={() => {
          cloning = true;
          return async ({ update }) => {
            await update();
            cloning = false;
          };
        }}
      >
        <SettingRow icon="📋" title="Clone this trip" desc="Copy the gear, packing & meals into a new trip">
          {#snippet control()}
            <Button type="submit" variant="soft" size="sm" disabled={cloning}>{cloning ? 'Cloning…' : 'Make a copy'}</Button>
          {/snippet}
        </SettingRow>
      </form>
    </SettingsGroup>
  {/if}

  {#if showInvite || ownerMode}
    <SettingsGroup icon="🔗" title="Invite & access" hint={inviteHint} first={!me} open={openGroup === 'invite'} onToggle={toggler('invite')}>
      <Button variant="primary" size="sm" onclick={() => (inviteOpen = true)}>＋ Invite people</Button>
      {#if ownerMode}
        <div class="mt-3">
          <div class="mb-1.5 font-body text-[12.5px] font-extrabold text-text-muted">What friends see on their calendar</div>
          <InviteAccess {ownerMode} visibility={trip.visibility || 'private'} {act} />
        </div>
      {/if}
    </SettingsGroup>
  {/if}

  {#if ownerMode}
    <SettingsGroup icon="🙌" title="People & roles" hint={peopleHint} open={openGroup === 'people'} onToggle={toggler('people')}>
      <PeopleRoles {members} {pending} {invites} {currentParticipantId} {busy} {act} />
    </SettingsGroup>

    <SettingsGroup icon="✏️" title="Trip details" hint="Name, dates, description, safety" open={openGroup === 'details'} onToggle={toggler('details')}>
      <TripDetailsForm {trip} {busy} {savedFlash} {act} />
    </SettingsGroup>

    <SettingsGroup icon="📷" title="Photos" hint={photoHint} open={openGroup === 'photos'} onToggle={toggler('photos')}>
      <PhotoAlbum {shareToken} {trip} {immichEnabled} />
    </SettingsGroup>

    {#if stageShown}
      <SettingsGroup icon="🗂️" title="Stage & sections" hint={stageHint} open={openGroup === 'stage'} onToggle={toggler('stage')}>
        <StageSections {trip} {hiddenList} {busy} {act} onSetStage={setStage} onDelete={deleteTrip} />
      </SettingsGroup>
    {/if}
  {/if}
</Card>

{#if showInvite || ownerMode}
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
    invitableFriends={[]}
    {emailEnabled}
  />
{/if}
