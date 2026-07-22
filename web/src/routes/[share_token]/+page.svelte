<script>
  import TripView from '$lib/TripView.svelte';
  import TripTeaser from '$lib/TripTeaser.svelte';
  import ClaimBanner from '$lib/ClaimBanner.svelte';
  import PlanningView from '$lib/PlanningView.svelte';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();
</script>

<svelte:head>
  <title>{data.trip?.name ?? data.og?.title ?? 'tripwala'} — tripwala</title>
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

{#if data.crawler}
  <!-- Only reached by link-preview bots (humans are redirected to sign in). The
       OG tags in the head are what they consume; this body is a graceful fallback. -->
  <div class="min-h-full">
    <div class="mx-auto max-w-md px-4 py-12 text-center sm:px-6">
      <div class="rounded-xl bg-white p-[22px] shadow-pop">
        <div class="text-[40px] leading-none">🧭</div>
        <h1 class="mt-2 font-display text-xl font-bold text-cocoa-900">{data.og?.title ?? 'tripwala'}</h1>
        <p class="mt-1 font-body text-[13px] font-bold text-cocoa-500">This trip is private — sign in to see the plan.</p>
        <a href="/login?from=trip" class="mt-4 inline-block font-body text-[13px] font-extrabold text-coral-600">Sign in →</a>
      </div>
    </div>
  </div>
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
