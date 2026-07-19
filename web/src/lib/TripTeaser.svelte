<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Button } from '@walaware/design';
  import { fmtDateRange } from '$lib/format.js';

  /**
   * @type {{
   *   trip: { name: string, location?: string, start_date?: string, end_date?: string, descriptionPreview?: string, share_token: string },
   *   mode: 'signin' | 'join' | 'pending',
   *   orphans?: Array<{ id: string, display_name: string }>,
   *   canJoin?: boolean,
   *   inviteToken?: string,
   *   form?: any
   * }}
   */
  let { trip, mode, orphans = [], canJoin = false, inviteToken = '', form = null } = $props();

  // Preserve the invite token through sign-in so an invited-but-signed-out guest
  // lands back on the invite link (with join capability), not the view-only page.
  const nextPath = $derived('/' + trip.share_token + (inviteToken ? `?invite=${inviteToken}` : ''));
  const loginHref = $derived(`/login?next=${encodeURIComponent(nextPath)}`);
  let joining = $state(false);
  let claiming = $state('');
</script>

<div class="min-h-full">
  <div class="mx-auto max-w-md px-4 py-12 sm:px-6">
    <div class="rounded-xl bg-white p-[22px] text-center shadow-pop">
      <div class="text-[40px] leading-none">{mode === 'pending' ? '⏳' : '🧭'}</div>
      <p class="mt-2 font-body text-[13px] font-extrabold uppercase tracking-wide text-coral-600">
        {mode === 'pending' ? 'Request pending' : "You're invited"}
      </p>
      <h1 class="mt-1 font-display text-2xl font-bold text-cocoa-900">{trip.name}</h1>

      {#if trip.start_date || trip.location}
        <div class="mt-1 font-body text-sm font-extrabold text-cocoa-500">
          {#if trip.start_date}{fmtDateRange(trip.start_date, trip.end_date)}{/if}{#if trip.start_date && trip.location} · {/if}{trip.location}
        </div>
      {/if}

      {#if trip.descriptionPreview}
        <p class="mt-4 font-body text-[13.5px] leading-relaxed text-cocoa-700">{trip.descriptionPreview}</p>
      {/if}

      <div class="mt-6">
        {#if mode === 'signin'}
          <Button href={loginHref} variant="primary" size="lg" full>Sign in to join →</Button>
          <p class="mt-3 font-body text-xs font-bold text-cocoa-500">
            tripwala uses accounts so only invited guests see the details — photos, who's coming, and more.
          </p>
        {:else if mode === 'pending'}
          <div class="rounded-xl bg-sun-100 px-4 py-3 font-body text-[13.5px] font-bold leading-relaxed text-cocoa-700">
            Your request to join is in — an organizer needs to approve you before the trip details unlock. Check back soon.
          </div>
          <form method="POST" action="?/withdraw" use:enhance class="mt-3">
            <Button variant="ghost" size="md" full type="submit">Withdraw request</Button>
          </form>
          {#if form?.withdrawError}
            <p class="mt-2 font-body text-sm font-bold text-berry-600">{form.withdrawError}</p>
          {/if}
        {:else}
          {#if canJoin}
            <form
              method="POST"
              action="?/join"
              use:enhance={() => {
                joining = true;
                return async ({ result }) => {
                  joining = false;
                  if (result.type === 'success') await invalidateAll();
                };
              }}
            >
              <!-- Carry the invite capability through the POST (the action drops the
                   URL's `?invite=` query, so re-send it as a field). -->
              <input type="hidden" name="invite" value={inviteToken} />
              <Button variant="primary" size="lg" full type="submit" disabled={joining}>
                {joining ? 'Joining…' : 'Join this trip 🙌'}
              </Button>
            </form>
          {:else}
            <div class="rounded-xl bg-sun-100 px-4 py-3 font-body text-[13.5px] font-bold leading-relaxed text-cocoa-700">
              This is a view-only link. To join and see the full details, ask an organizer to send you the trip's <span class="text-coral-600">invite link</span>.
            </div>
          {/if}
          {#if form?.joinError}
            <p class="mt-2 font-body text-sm font-bold text-berry-600">{form.joinError}</p>
          {/if}

          {#if orphans.length}
            <div class="mt-5 border-t border-sand-300 pt-4 text-left">
              <p class="font-body text-[13px] font-extrabold text-cocoa-700">
                Already on this trip under your name? Tap it to claim it:
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                {#each orphans as o (o.id)}
                  <form
                    method="POST"
                    action="?/claim"
                    use:enhance={() => {
                      claiming = o.id;
                      return async ({ result }) => {
                        claiming = '';
                        if (result.type === 'success') await invalidateAll();
                      };
                    }}
                  >
                    <input type="hidden" name="participantId" value={o.id} />
                    <button
                      type="submit"
                      disabled={claiming !== ''}
                      class="rounded-full border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[13px] font-extrabold text-cocoa-700 transition hover:border-coral-400 disabled:opacity-50"
                    >
                      {claiming === o.id ? 'Claiming…' : `I'm ${o.display_name}`}
                    </button>
                  </form>
                {/each}
              </div>
              {#if form?.claimError}
                <p class="mt-2 font-body text-sm font-bold text-berry-600">{form.claimError}</p>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>
