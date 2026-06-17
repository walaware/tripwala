<script>
  // Landing placeholder. The create-trip flow is build-sequence step 2.
  const demoToken = 'demo-rally-weekend';
</script>

<svelte:head><title>Rally — one link, everyone's in</title></svelte:head>

<main class="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-8 px-6 py-16">
  <div>
    <h1 class="text-4xl font-bold tracking-tight text-rally-900">Rally</h1>
    <p class="mt-3 text-lg text-stone-600">
      One link where the group gathers. Plan a trip, share it, and everyone RSVPs,
      claims gear, and signs up for meals — no accounts, no friction.
    </p>
  </div>

  <a
    href="/{demoToken}"
    class="inline-flex items-center justify-center rounded-xl bg-rally-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-rally-700"
  >
    Open the demo trip →
  </a>

  <p class="text-sm text-stone-400">
    Create-a-trip is next on the build list. The demo trip above is rendered live
    from the PocketBase seed.
  </p>
</main>
