<script>
  import TripView from '$lib/TripView.svelte';
  import TripTeaser from '$lib/TripTeaser.svelte';
  import ClaimBanner from '$lib/ClaimBanner.svelte';
  import PlanningView from '$lib/PlanningView.svelte';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();
</script>

<svelte:head>
  <title>{data.trip?.name ?? 'tripwala'} — tripwala</title>
  {#if data.og}
    <meta name="description" content={data.og.description} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="tripwala" />
    <meta property="og:title" content={data.og.title} />
    <meta property="og:description" content={data.og.description} />
    <meta property="og:url" content={data.og.url} />
    <meta name="twitter:title" content={data.og.title} />
    <meta name="twitter:description" content={data.og.description} />
    {#if data.og.image}
      <meta property="og:image" content={data.og.image} />
      <meta name="twitter:image" content={data.og.image} />
      <meta name="twitter:card" content="summary_large_image" />
    {:else}
      <meta name="twitter:card" content="summary" />
    {/if}
  {/if}
</svelte:head>

{#if data.teaser}
  <TripTeaser trip={data.trip} mode="signin" inviteToken={data.inviteToken ?? ''} />
{:else if data.invite}
  <TripTeaser
    trip={data.trip}
    mode="join"
    orphans={data.orphans ?? []}
    canJoin={data.canJoin ?? false}
    inviteToken={data.inviteToken ?? ''}
    {form}
  />
{:else if data.awaitingApproval}
  <TripTeaser trip={data.trip} mode="pending" {form} />
{:else if data.planning}
  <PlanningView {data} />
{:else}
  <TripView
    {data}
    currentParticipantId={data.membership?.participantId ?? null}
    ownerMode={data.isOrganizer ?? false}
  >
    {#snippet top()}
      {#if (data.orphans ?? []).length}
        <ClaimBanner orphans={data.orphans ?? []} {form} />
      {/if}
    {/snippet}
  </TripView>
{/if}
