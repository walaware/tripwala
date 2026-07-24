// Promise-based in-app confirmation — a robust replacement for window.confirm().
//
// window.confirm() is auto-dismissed to `false` (or blocked) in embedded /
// automated / sandboxed-iframe browsers, which silently no-ops any action gated
// behind it (delete trip, leave, move-to-idea, delete a decision — all "nothing
// happens"). This renders a real in-app dialog (see ui/ConfirmHost.svelte, mounted
// once in the layout) and resolves a Promise<boolean>, so callers keep the same
// `if (!(await confirmAction(...))) return;` shape and it works everywhere.

/**
 * @typedef {{ title: string, message: string, confirmLabel: string, danger: boolean, resolve: (v: boolean) => void }} ConfirmRequest
 */

/**
 * Single in-flight request; the host renders it and settles the promise.
 * @type {{ current: ConfirmRequest | null }}
 */
export const confirmStore = $state({ current: null });

/**
 * Ask the user to confirm. Resolves true if they accept, false otherwise.
 * @param {{ title?: string, message?: string, confirmLabel?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmAction(opts = {}) {
  // A second request supersedes the first (rare) — settle the old one as declined.
  if (confirmStore.current) confirmStore.current.resolve(false);
  return new Promise((resolve) => {
    confirmStore.current = {
      title: opts.title ?? 'Are you sure?',
      message: opts.message ?? '',
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger ?? false,
      resolve
    };
  });
}

/** Settle the current request and clear it. @param {boolean} value */
export function settleConfirm(value) {
  const req = confirmStore.current;
  if (!req) return;
  confirmStore.current = null;
  req.resolve(value);
}
