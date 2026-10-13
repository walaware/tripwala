<script>
  // Trip pages: member-supplied HTML views (a Claude artifact, a hand-made
  // schedule, a game) attached to the trip. The HTML never touches this DOM —
  // each page renders inside a sandboxed iframe whose src is the members-only
  // /[share_token]/page/[id] route (CSP sandbox, opaque origin; see
  // $lib/server/pages.js). Add = paste the HTML (or pick an .html file, read
  // client-side into the same textarea).
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Button, EmptyState } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @typedef {{ id: string, title: string, addedBy: string | null, updated: string }} TripPage
   */

  /**
   * @type {{
   *   shareToken: string,
   *   pages: TripPage[],
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, pages, currentParticipantId, ownerMode = false, onHide = null,
    onSettings = null, collapsed = false, onToggle = null } = $props();

  const canManage = (/** @type {TripPage} */ p) => ownerMode || (!!currentParticipantId && p.addedBy === currentParticipantId);
  const pageUrl = (/** @type {string} */ id) => `/${encodeURIComponent(shareToken)}/page/${encodeURIComponent(id)}`;

  let busy = $state(false);
  let errorMsg = $state('');
  /** @param {Record<string, unknown>} body */
  async function run(body) {
    if (busy) return false;
    busy = true;
    errorMsg = '';
    try {
      await tripAction(shareToken, body);
      await invalidateAll();
      return true;
    } catch (/** @type {any} */ e) {
      errorMsg = e?.message || 'That didn’t save — try again.';
      return false;
    } finally {
      busy = false;
    }
  }

  // Add/edit form. editId '' = closed; 'new' = adding; else the page being edited.
  let editId = $state('');
  let fTitle = $state('');
  let fHtml = $state('');
  function openAdd() {
    editId = 'new';
    fTitle = '';
    fHtml = '';
    errorMsg = '';
  }
  /** @param {TripPage} p */
  function openEdit(p) {
    editId = p.id;
    fTitle = p.title;
    fHtml = ''; // blank = keep the stored HTML; paste to replace
    errorMsg = '';
  }
  async function submit() {
    if (!fTitle.trim()) return;
    const ok =
      editId === 'new'
        ? await run({ op: 'page_add', title: fTitle, html: fHtml })
        : await run({ op: 'page_update', pageId: editId, title: fTitle, ...(fHtml.trim() ? { html: fHtml } : {}) });
    if (ok) editId = '';
  }
  /** @param {string} id */
  const remove = (id) => run({ op: 'page_remove', pageId: id });

  /** Read a picked .html file into the paste box. @param {Event} e */
  async function pickFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    if (!file) return;
    fHtml = await file.text();
    if (!fTitle.trim()) fTitle = file.name.replace(/\.html?$/i, '');
    input.value = '';
  }

  // Open a page in the fullscreen viewer: just add ?page=<id> on top of the
  // CURRENT params (TripView renders the viewer whenever that param is set, and
  // closing drops only that param — so you land back exactly where you were).
  /** @param {string} id */
  function openViewer(id) {
    const u = new URL(page.url.href);
    u.searchParams.set('page', id);
    goto(`${u.pathname}${u.search}`, { noScroll: true, keepFocus: true });
  }

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
  const labelClass = 'mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400';
</script>

<SectionHeader emoji="📄" title="Trip pages" subtitle={pages.length ? `${pages.length} embedded` : ''} {onHide} {onSettings} {collapsed} {onToggle} />
<Card>
  {#if !pages.length && editId !== 'new'}
    <EmptyState
      emoji="📄"
      title="No pages yet"
      body="Embed a page on this trip — paste any self-contained HTML (a Claude artifact, a schedule, a game). It opens full-screen for every member, safely sandboxed."
    />
  {/if}

  <div class="flex flex-col gap-2">
    {#each pages as p (p.id)}
      <div class="group flex items-center gap-2 rounded-lg border-2 border-sand-200 bg-white px-3 py-2.5">
        <span class="flex-none text-[15px]" aria-hidden="true">📄</span>
        <button type="button" class="min-w-0 flex-1 truncate text-left font-body text-[14.5px] font-extrabold text-cocoa-900 hover:text-coral-600" onclick={() => openViewer(p.id)}>
          {p.title}
        </button>
        <a href={pageUrl(p.id)} target="_blank" rel="noopener noreferrer" class="flex-none font-body text-[12px] font-bold text-cocoa-400 hover:text-coral-600">new tab ↗</a>
        {#if canManage(p)}
          <span class="flex flex-none items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button type="button" aria-label="Edit" onclick={() => openEdit(p)} class="px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-coral-600">Edit</button>
            <button type="button" aria-label="Remove" onclick={() => remove(p.id)} disabled={busy} class="px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-berry-600">✕</button>
          </span>
        {/if}
      </div>
      {#if editId === p.id}
        {@render form()}
      {/if}
    {/each}
  </div>

  {#if editId === 'new'}
    <div class="mt-2">{@render form()}</div>
  {:else if currentParticipantId}
    <button
      type="button"
      onclick={openAdd}
      class="mt-3 self-start rounded-full px-2.5 py-1 font-body text-[13px] font-extrabold text-coral-600 transition hover:bg-coral-100"
    >＋ Add a page</button>
  {/if}
</Card>

{#snippet form()}
  <div class="mt-2 flex flex-col gap-2 rounded-lg border-2 border-coral-200 bg-sand-100 p-3">
    <div>
      <label class={labelClass} for="pg-title">Title</label>
      <input id="pg-title" bind:value={fTitle} placeholder="Costume workshop 🎭" maxlength="120" class={inputClass} />
    </div>
    <div>
      <label class={labelClass} for="pg-html">
        {editId === 'new' ? 'HTML' : 'HTML (leave blank to keep the current page)'}
      </label>
      <textarea
        id="pg-html"
        bind:value={fHtml}
        rows="6"
        placeholder="<!doctype html>… paste the whole page"
        class="resize-y font-mono {inputClass} text-[12px] font-semibold"
      ></textarea>
      <label class="mt-1 inline-block cursor-pointer font-body text-[12px] font-extrabold text-coral-600 hover:underline">
        …or pick an .html file
        <input type="file" accept=".html,.htm,text/html" class="hidden" onchange={pickFile} />
      </label>
    </div>
    {#if errorMsg}
      <p class="font-body text-[12.5px] font-bold text-berry-600">{errorMsg}</p>
    {/if}
    <div class="flex justify-end gap-2">
      <Button variant="soft" size="sm" onclick={submit} disabled={busy || !fTitle.trim() || (editId === 'new' && !fHtml.trim())}>
        {editId === 'new' ? 'Add' : 'Save'}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (editId = '')} disabled={busy}>Cancel</Button>
    </div>
  </div>
{/snippet}

<!-- The fullscreen viewer itself lives in TripView (PageViewer.svelte),
     driven by the ?page= param — so it opens from the dashboard strip too and
     closing returns wherever you were. -->
