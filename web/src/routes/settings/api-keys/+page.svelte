<script>
  import { Card, Button, TextField, CopyField, Modal } from '@walaware/design';
  import { enhance } from '$app/forms';
  import { fmtRelative } from '$lib/format.js';

  /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
  let { data, form } = $props();

  let name = $state('');
  let creating = $state(false);
  let revokingId = $state('');

  // The full token from a just-created key — revealed ONCE in a modal, then gone.
  // Seeded from the create action's result; never re-fetchable.
  const created = $derived(form?.created ?? null);
  let showReveal = $state(false);
  // Open the reveal whenever a fresh token comes back from the action.
  $effect(() => {
    if (form?.created) showReveal = true;
  });

  const onCreate = () => {
    creating = true;
    return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
      await update();
      creating = false;
      name = '';
    };
  };

  /** @param {string} id */
  const onRevoke = (id) => {
    revokingId = id;
    return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
      await update();
      revokingId = '';
    };
  };

  const curlSnippet = $derived(
    `curl -H "Authorization: Bearer $TRIPWALA_API_TOKEN" \\\n  ${data.apiBase}/whoami`
  );
</script>

<svelte:head><title>API keys — tripwala</title></svelte:head>

<div class="mx-auto max-w-xl">
  <h1 class="mb-1 font-display text-[24px] font-bold tracking-tight text-text-strong">API keys</h1>
  <p class="mb-5 font-body text-[13px] font-bold text-text-muted">
    A personal key lets a script or an AI agent (Claude Code, a chatbot) act on
    <em>your own</em> trips over the API — exactly what you can do here, nothing more.
    Reads see only your trips; writes follow your role on each trip.
  </p>

  {#if form?.error}
    <div class="mb-4 rounded-md bg-berry-200 px-3 py-2 font-body text-sm font-bold text-berry-600">
      {form.error}
    </div>
  {/if}

  <!-- Create -->
  <Card>
    <div class="font-display text-[15px] font-bold text-text-strong">Create a key</div>
    <p class="mt-0.5 font-body text-[12.5px] font-bold text-text-muted">
      Name it for where you'll use it (e.g. “claude-code”, “laptop script”).
    </p>
    <form method="POST" action="?/create" use:enhance={onCreate} class="mt-3 flex items-end gap-2">
      <div class="flex-1">
        <label for="key-name" class="mb-1 block font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">
          Key name
        </label>
        <TextField id="key-name" name="name" bind:value={name} maxlength={60} placeholder="claude-code" />
      </div>
      <Button type="submit" variant="primary" size="md" disabled={creating || !name.trim()}>
        {creating ? 'Creating…' : 'Create key'}
      </Button>
    </form>
  </Card>

  <!-- Existing keys -->
  <div class="mt-4">
    <Card>
      <div class="font-display text-[15px] font-bold text-text-strong">Your keys</div>
      {#if !data.keys.length}
        <p class="mt-2 font-body text-[13px] font-bold text-text-muted">
          No keys yet. Create one above to get started.
        </p>
      {:else}
        <ul class="mt-3 flex flex-col divide-y divide-sand-200">
          {#each data.keys as key (key.id)}
            <li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate font-body text-[14px] font-extrabold text-text-strong">{key.label}</span>
                  {#if !key.active}
                    <span class="flex-none rounded-full bg-sand-200 px-2 py-0.5 font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400">
                      Revoked
                    </span>
                  {/if}
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-3 font-body text-[12px] font-bold text-text-muted">
                  {#if key.prefix}<span class="font-mono text-cocoa-500">{key.prefix}</span>{/if}
                  <span>Created {fmtRelative(key.created)}</span>
                  <span>{key.last_used ? `Last used ${fmtRelative(key.last_used)}` : 'Never used'}</span>
                </div>
              </div>
              {#if key.active}
                <form method="POST" action="?/revoke" use:enhance={() => onRevoke(key.id)} class="flex-none">
                  <input type="hidden" name="id" value={key.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={revokingId === key.id}>
                    {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  <!-- Usage snippet -->
  <div class="mt-4">
    <Card>
      <div class="font-display text-[15px] font-bold text-text-strong">Using your key</div>
      <p class="mt-0.5 font-body text-[12.5px] font-bold text-text-muted">
        Set your key as an environment variable, then call the API. Full reference in
        <span class="font-mono text-[12px]">docs/for-api.md</span>.
      </p>
      <div class="mt-3 overflow-x-auto rounded-lg bg-cocoa-900 px-3 py-2.5">
        <pre class="font-mono text-[12px] leading-relaxed text-sand-100"><code>export TRIPWALA_API_URL={data.apiBase}
export TRIPWALA_API_TOKEN=&lt;your key&gt;

{curlSnippet}</code></pre>
      </div>
    </Card>
  </div>
</div>

<!-- One-time reveal of a freshly created key. -->
<Modal
  open={showReveal && created != null}
  title="Copy your new key now"
  size="md"
  onClose={() => (showReveal = false)}
>
  {#if created}
    <p class="font-body text-[13px] font-bold text-text-muted">
      This is the only time <span class="font-extrabold text-text-strong">{created.label}</span> is
      shown. Copy it somewhere safe — you can't see it again. If you lose it, revoke it and make a new one.
    </p>
    <div class="mt-3">
      <CopyField value={created.token} label="Your API key" ariaLabel="Your API key" copyLabel="Copy" copiedLabel="Copied!" />
    </div>
    <p class="mt-3 font-body text-[12px] font-bold text-text-muted">
      Treat it like a password — it acts as you on your own trips.
    </p>
  {/if}
  {#snippet footer()}
    <Button variant="primary" size="md" onclick={() => (showReveal = false)}>Done</Button>
  {/snippet}
</Modal>
