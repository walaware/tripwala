<script>
  import GoogleIcon from '$lib/ui/GoogleIcon.svelte';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const next = $derived(data.next ?? '/');
  const googleHref = $derived(`/auth/google?next=${encodeURIComponent(next)}`);
</script>

<svelte:head><title>Sign in — tripwala</title></svelte:head>

<main class="min-h-full bg-sand-100">
  <div class="mx-auto max-w-md px-4 py-12 sm:px-6">
    <div class="rounded-xl bg-white p-[22px] shadow-pop">
      <div class="text-center text-[40px] leading-none">🧭</div>
      <h1 class="mt-2 text-center font-display text-xl font-bold text-cocoa-900">Welcome to tripwala</h1>
      <p class="mt-1 text-center font-body text-[13px] font-bold text-cocoa-500">
        Sign in to plan trips and join the ones you're invited to.
      </p>

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
  </div>
</main>
