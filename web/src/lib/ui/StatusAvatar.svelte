<script>
  import { Avatar } from '@walaware/design';
  import { STATUS } from '$lib/peopleStatus.js';

  /**
   * An avatar with its trip status as a small corner badge — so a roster of
   * faces reads as "who's actually coming" at a glance instead of needing a
   * legend. `status` is a key from $lib/peopleStatus.js.
   *
   * @type {{
   *   name: string,
   *   src?: string,
   *   size?: number,
   *   status: import('$lib/peopleStatus.js').PersonStatus,
   *   dim?: boolean
   * }}
   */
  let { name, src = '', size = 26, status, dim = false } = $props();

  const meta = $derived(STATUS[status] ?? STATUS.no_answer);
  // Badge scales with the avatar so it stays legible at any size but never eats
  // the face.
  const badge = $derived(Math.max(12, Math.round(size * 0.5)));
</script>

<span class="relative inline-flex shrink-0" class:opacity-50={dim}>
  <Avatar {name} {src} {size} />
  <span
    class="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-white leading-none shadow-soft"
    style="width:{badge}px;height:{badge}px;font-size:{Math.round(badge * 0.62)}px"
    title="{name} — {meta.label}"
    aria-label="{name} — {meta.label}"
  >
    {meta.emoji}
  </span>
</span>
