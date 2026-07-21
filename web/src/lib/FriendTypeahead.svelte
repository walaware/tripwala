<script>
  import { Avatar } from '@walaware/design';

  /**
   * App-local accessible typeahead over accepted friends: type a name to pick a
   * friend (invite them directly, no email), or type a full email to fall back
   * to an email invite. Not a shared primitive yet (rule of three).
   *
   * @type {{
   *   friends: Array<{ id: string, name: string, avatar?: string }>,
   *   placeholder?: string,
   *   emailEnabled?: boolean,
   *   busy?: string,
   *   onPick: (friend: { id: string, name: string }) => void,
   *   onEmail?: (email: string) => void
   * }}
   */
  let { friends, placeholder = 'Name or email…', emailEnabled = false, busy = '', onPick, onEmail } = $props();

  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  const id = `ta-${Math.random().toString(36).slice(2, 8)}`;

  const isEmail = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query.trim()));
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return friends.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  });
  // Total selectable rows: friend matches, plus an email-invite row when the
  // query is an email that matches no friend.
  const emailRow = $derived(isEmail && emailEnabled && matches.length === 0);
  const rowCount = $derived(matches.length + (emailRow ? 1 : 0));

  function reset() {
    query = '';
    open = false;
    active = 0;
  }
  /** @param {{ id: string, name: string }} f */
  function pick(f) {
    onPick(f);
    reset();
  }
  function submitEmail() {
    if (emailRow && onEmail) {
      onEmail(query.trim());
      reset();
    }
  }
  function choose() {
    if (active < matches.length) pick(matches[active]);
    else if (emailRow) submitEmail();
  }
  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      active = Math.min(active + 1, Math.max(0, rowCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose();
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<div class="relative">
  <input
    role="combobox"
    aria-expanded={open && rowCount > 0}
    aria-controls="{id}-list"
    aria-autocomplete="list"
    aria-activedescendant={open && rowCount ? `${id}-opt-${active}` : undefined}
    type="text"
    bind:value={query}
    {placeholder}
    autocomplete="off"
    oninput={() => { open = true; active = 0; }}
    onfocus={() => { if (query) open = true; }}
    onblur={() => setTimeout(() => (open = false), 120)}
    onkeydown={onKeydown}
    class="w-full rounded-md border-2 border-sand-300 bg-white px-3.5 py-2.5 font-body text-[14px] font-bold text-cocoa-900 outline-none transition focus:border-coral-400"
  />

  {#if open && rowCount > 0}
    <ul
      id="{id}-list"
      role="listbox"
      class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border-2 border-sand-200 bg-white p-1 shadow-lg"
    >
      {#each matches as f, i (f.id)}
        <li
          id="{id}-opt-{i}"
          role="option"
          aria-selected={active === i}
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 {active === i ? 'bg-sand-100' : ''}"
          onmousedown={(e) => { e.preventDefault(); pick(f); }}
          onmouseenter={() => (active = i)}
        >
          <Avatar name={f.name} src={f.avatar || null} size={28} />
          <span class="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-cocoa-900">{f.name}</span>
          <span class="font-body text-[12px] font-bold text-coral-600">{busy === f.id ? 'Inviting…' : 'Invite'}</span>
        </li>
      {/each}
      {#if emailRow}
        <li
          id="{id}-opt-{matches.length}"
          role="option"
          aria-selected={active === matches.length}
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 {active === matches.length ? 'bg-sand-100' : ''}"
          onmousedown={(e) => { e.preventDefault(); submitEmail(); }}
          onmouseenter={() => (active = matches.length)}
        >
          <span class="grid h-7 w-7 flex-none place-items-center rounded-full bg-sand-200 text-[14px]">✉️</span>
          <span class="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-cocoa-900">Invite {query.trim()}</span>
          <span class="font-body text-[12px] font-bold text-coral-600">by email</span>
        </li>
      {/if}
    </ul>
  {/if}
</div>

{#if query.trim() && rowCount === 0}
  <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">
    {isEmail && !emailEnabled ? 'Email invites aren’t set up — share the link instead.' : 'No friend by that name — type a full email to invite them.'}
  </p>
{/if}
