import { getContext, setContext } from 'svelte';

const KEY = Symbol('wala-shell');

/**
 * The contextual-mode payload a record screen (e.g. an open trip) hands up to
 * the layout's AppShell: the section nav + the record's title. When it's `null`
 * the shell stays at app level (global destinations).
 *
 * @typedef {{ title: string, subtitle?: string, emoji?: string, nav: import('@walaware/design').NavItem[] }} TripContext
 * @typedef {{ trip: TripContext | null }} Shell
 *
 * The layout passes `title`/`subtitle`/`emoji` to the AppShell, which (v0.5.0+)
 * collapses the trip page's `[data-appshell-sticky]` header into the mobile top
 * bar and crossfades the brand → this icon + title + subtitle itself.
 */

/**
 * Create the shell holder in the layout and publish it on context. Descendant
 * screens read it with {@link useShell} and set `trip` to flip the AppShell into
 * contextual (section-nav + scrollSpy) mode — a child driving parent chrome.
 *
 * @returns {Shell}
 */
export function createShell() {
  const shell = $state({ trip: null });
  setContext(KEY, shell);
  return shell;
}

/**
 * Read the shell holder from a descendant of the layout.
 * @returns {Shell}
 */
export function useShell() {
  return getContext(KEY);
}
