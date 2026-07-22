<script>
  import GoogleIcon from '$lib/ui/GoogleIcon.svelte';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const next = $derived(data.next ?? '/');
  const googleHref = $derived(`/auth/google?next=${encodeURIComponent(next)}`);
  const fromTrip = $derived(data.fromTrip ?? false);
</script>

<svelte:head><title>Sign in — tripwala</title></svelte:head>

<main class="min-h-full bg-sand-100">
  <div class="mx-auto max-w-md px-4 py-12 sm:px-6">
    <div class="rounded-xl bg-white p-[22px] shadow-pop">
      <div class="text-center text-[40px] leading-none">🧭</div>
      {#if fromTrip}
        <h1 class="mt-2 text-center font-display text-xl font-bold text-cocoa-900">Sign in to see this trip</h1>
        <p class="mt-1 text-center font-body text-[13px] font-bold text-cocoa-500">
          Trip pages are private. Sign in and we'll take you straight there — if you're invited, it'll open right up.
        </p>
      {:else}
        <h1 class="mt-2 text-center font-display text-xl font-bold text-cocoa-900">Welcome to tripwala</h1>
        <p class="mt-1 text-center font-body text-[13px] font-bold text-cocoa-500">
          Sign in to plan trips and join the ones you're invited to.
        </p>
      {/if}

      {#if data.oauthError}
        <p class="mt-4 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">
          Google sign-in didn't complete. Try again.
        </p>
      {/if}

      <a
        href={googleHref}
        class="mt-5 flex w-full items-center justify-center gap-2.5 rounded-md border-2 border-sand-300 bg-white py-3 font-display text-sm font-semibold text-cocoa-900 transition hover:border-coral-400"
      >
        <GoogleIcon /> Continue with Google
      </a>

      <p class="mt-4 text-center font-body text-[13px] font-bold text-cocoa-500">
        First time? This creates your account — no password to remember.
      </p>
    </div>

    <ul class="mx-auto mt-6 flex max-w-sm flex-col gap-2.5 px-1">
      <li class="flex items-start gap-2.5 font-body text-[13px] font-bold text-cocoa-500">
        <span aria-hidden="true">🗳️</span>
        <span>One link where the crew RSVPs, votes on plans, and claims what to bring.</span>
      </li>
      <li class="flex items-start gap-2.5 font-body text-[13px] font-bold text-cocoa-500">
        <span aria-hidden="true">🗺️</span>
        <span>Itinerary, packing, and costs on one scrollable page — no more group-chat scroll-back.</span>
      </li>
      <li class="flex items-start gap-2.5 font-body text-[13px] font-bold text-cocoa-500">
        <span aria-hidden="true">❤️</span>
        <span>Free for you and your crew, on any phone.</span>
      </li>
    </ul>
  </div>
</main>
