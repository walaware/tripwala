<script>
  import { Avatar, Button } from '@walaware/design';

  /**
   * The approval queue: people who used the link on an `approval` trip and are
   * waiting on an organizer. Time-sensitive, so it stays on the compact Who's-in
   * card as well as the People page rather than living only behind a link.
   *
   * @type {{
   *   pending: Array<{ id: string, display_name: string, avatar?: string }>,
   *   busy: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let { pending, busy, act } = $props();
</script>

{#if pending.length}
  <div class="rounded-xl bg-sun-100 p-3">
    <div class="mb-1.5 font-display text-[14px] font-bold text-cocoa-900">
      Requests to join ({pending.length})
    </div>
    <div class="flex flex-col">
      {#each pending as p, i (p.id)}
        <div class="flex items-center gap-2 py-1.5 {i !== 0 ? 'border-t border-sun-200' : ''}">
          <Avatar name={p.display_name} src={p.avatar} size={28} />
          <span class="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-cocoa-900">{p.display_name}</span>
          <Button
            variant="primary"
            size="sm"
            disabled={busy === 'ap-' + p.id}
            onclick={() => act('approve_member', { participantId: p.id }, 'ap-' + p.id)}
          >Approve</Button>
          <button
            type="button"
            disabled={busy === 'dn-' + p.id}
            onclick={() => act('deny_member', { participantId: p.id }, 'dn-' + p.id)}
            class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200"
          >Deny</button>
        </div>
      {/each}
    </div>
  </div>
{/if}
