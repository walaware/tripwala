<script>
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import TextField from '$lib/ui/TextField.svelte';

  /** @type {{ form: any }} */
  let { form } = $props();

  const created = $derived(form?.created);
  const errors = $derived(form?.errors ?? {});
  const values = $derived(form?.values ?? {});

  const origin = $derived(page.url.origin);
  const shareUrl = $derived(created ? `${origin}/${created.share_token}` : '');
  const ownerUrl = $derived(
    created ? `${origin}/${created.share_token}/edit?owner=${created.owner_token}` : ''
  );

  let copied = $state('');
  /** @param {string} text @param {string} which */
  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      copied = which;
      setTimeout(() => (copied = ''), 1500);
    } catch (_) {
      copied = '';
    }
  }

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3.5 py-3 font-body text-base font-bold text-cocoa-900 outline-none transition focus:border-coral-400 focus:ring-4 focus:ring-coral-200 placeholder:text-cocoa-300';
  const labelClass = 'mb-[7px] block font-display text-sm font-semibold text-cocoa-900';
</script>

<svelte:head><title>{created ? 'Trip created' : 'New trip'} — Rally</title></svelte:head>

<main class="min-h-full bg-sand-100">
  <div class="mx-auto max-w-xl px-4 py-8 sm:px-6">
    <a href="/" class="font-body text-[13px] font-extrabold text-coral-600 hover:underline">← Rally</a>

    {#if created}
      <Card hero class="mt-4">
        <div class="text-center text-[44px] leading-none">🎉</div>
        <h1 class="mt-2 text-center font-display text-2xl font-bold text-cocoa-900">"{created.name}" is live!</h1>
        <p class="mt-1 text-center font-body font-bold text-cocoa-500">
          Drop this link in the group chat — anyone with it is in.
          {#if created.mealSlots}<br />We set up {created.mealSlots} meal slots from your dates.{/if}
        </p>

        <p class="mb-1.5 mt-5 font-display text-sm font-semibold text-cocoa-900">Share link</p>
        <div class="flex gap-2">
          <input readonly value={shareUrl} class="{inputClass} flex-1" />
          <Button variant="primary" size="md" onclick={() => copy(shareUrl, 'share')}>
            {copied === 'share' ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        <p class="mb-1.5 mt-4 font-display text-sm font-semibold text-cocoa-900">Your private owner link</p>
        <p class="-mt-1 mb-1.5 font-body text-xs font-bold text-cocoa-500">
          Keep this — it's how you edit the trip later. Don't share it.
        </p>
        <div class="flex gap-2">
          <input
            readonly
            value={ownerUrl}
            class="flex-1 rounded-md border-2 border-sun-300 bg-sun-200 px-3.5 py-3 font-body text-base font-bold text-cocoa-900 outline-none"
          />
          <Button variant="soft" size="md" onclick={() => copy(ownerUrl, 'owner')}>
            {copied === 'owner' ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        <div class="mt-6">
          <Button href="/{created.share_token}" variant="primary" size="lg" full>Open the trip →</Button>
        </div>
      </Card>
    {:else}
      <h1 class="mt-4 font-display text-[27px] font-bold tracking-tight text-cocoa-900">Plan a trip 🎒</h1>
      <p class="mt-1 font-body font-bold text-cocoa-500">One link, everyone's in. No accounts needed.</p>

      {#if errors._form}
        <p class="mt-4 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">{errors._form}</p>
      {/if}

      <form method="POST" use:enhance class="mt-5 flex flex-col gap-4">
        <div>
          <TextField
            label="What's the trip?"
            name="name"
            required
            value={values.name ?? ''}
            placeholder="Mendocino Coast Camping"
          />
          {#if errors.name}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.name}</p>{/if}
        </div>

        <div>
          <TextField
            label="Where?"
            name="location"
            value={values.location ?? ''}
            placeholder="Russian Gulch State Park, CA"
          />
          {#if errors.location}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.location}</p>{/if}
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <label class={labelClass} for="start_date">Start</label>
            <input id="start_date" name="start_date" type="date" value={values.start_date ?? ''} class={inputClass} />
          </div>
          <div class="flex-1">
            <label class={labelClass} for="end_date">End</label>
            <input id="end_date" name="end_date" type="date" value={values.end_date ?? ''} class={inputClass} />
            {#if errors.end_date}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.end_date}</p>{/if}
          </div>
        </div>

        <div>
          <label class={labelClass} for="description">The plan</label>
          <textarea
            id="description"
            name="description"
            rows="3"
            placeholder="What's the plan? What should people know?"
            class={inputClass}>{values.description ?? ''}</textarea>
          {#if errors.description}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.description}</p>{/if}
        </div>

        <div>
          <label class={labelClass} for="expense_link">
            Expense-split link <span class="font-body font-bold text-cocoa-500">(optional)</span>
          </label>
          <input
            id="expense_link"
            name="expense_link"
            inputmode="url"
            value={values.expense_link ?? ''}
            placeholder="https://spliit.app/..."
            class={inputClass}
          />
          {#if errors.expense_link}<p class="mt-1 font-body text-sm font-bold text-berry-600">{errors.expense_link}</p>{/if}
        </div>

        <Button variant="primary" size="lg" full type="submit">Create trip & get link 🎉</Button>
      </form>
    {/if}
  </div>
</main>
