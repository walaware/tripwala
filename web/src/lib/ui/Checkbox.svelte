<script>
  /**
   * Calm checkbox indicator — intentionally quiet (no emoji). A soft rounded
   * box; when checked it fills leaf-green with a thin stroked check. Presentational
   * for now (packing toggle is wired in a later step).
   * @type {{ checked?: boolean, size?: number }}
   */
  let { checked = false, size = 22 } = $props();
</script>

<span
  class="grid flex-none place-items-center rounded-[7px] border-2 transition-colors duration-200
    {checked ? 'border-leaf-500 bg-leaf-500' : 'border-sand-300 bg-white'}"
  style="width: {size}px; height: {size}px"
  aria-hidden="true"
>
  {#if checked}
    <svg
      width={size * 0.62}
      height={size * 0.62}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      stroke-width="3.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  {/if}
</span>
