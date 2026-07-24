<script>
  import { Modal, Button } from '@walaware/design';
  import { confirmStore, settleConfirm } from '$lib/confirm.svelte.js';

  // Mounted once in the layout; renders whatever confirmAction() requested.
  const req = $derived(confirmStore.current);
</script>

<Modal
  open={!!req}
  title={req?.title ?? ''}
  label="Confirmation"
  onClose={() => settleConfirm(false)}
>
  {#if req?.message}
    <p class="font-body text-[14px] font-semibold leading-snug text-text-muted">{req.message}</p>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onclick={() => settleConfirm(false)}>Cancel</Button>
      {#if req?.danger}
        <!-- No `danger` Button variant in the kit — style the destructive action inline. -->
        <button
          type="button"
          onclick={() => settleConfirm(true)}
          class="rounded-full bg-berry-600 px-3.5 py-1.5 font-body text-[13px] font-extrabold text-white transition hover:bg-berry-700"
        >{req?.confirmLabel ?? 'Confirm'}</button>
      {:else}
        <Button variant="primary" size="sm" onclick={() => settleConfirm(true)}>{req?.confirmLabel ?? 'Confirm'}</Button>
      {/if}
    </div>
  {/snippet}
</Modal>
