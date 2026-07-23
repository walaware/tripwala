<script>
  // AllTrails-style elevation profile: a filled area chart of elevation vs
  // cumulative distance, rendered as a single SVG path (no chart library).
  // Hovering scrubs a vertical guide + readout and reports the source track
  // index up, so the parent can move a marker along the map polyline.

  /**
   * @type {{
   *   profile: Array<{ distM: number, ele: number, index: number }>,
   *   markers?: Array<{ distM: number, ele: number, emoji: string, label: string, kind: string }>,
   *   metric?: boolean,
   *   onHover?: (index: number | null) => void
   * }}
   */
  let { profile = [], markers = [], metric = false, onHover = () => {} } = $props();

  const W = 1000;
  const H = 220;
  const PAD = { t: 14, r: 8, b: 4, l: 8 };

  const bounds = $derived.by(() => {
    if (profile.length < 2) return null;
    const dist = profile.map((p) => p.distM);
    const eles = profile.map((p) => p.ele);
    const maxD = Math.max(...dist) || 1;
    const minE = Math.min(...eles);
    const maxE = Math.max(...eles);
    // Pad the elevation range a touch so the line isn't flush to the edges.
    const span = Math.max(1, maxE - minE);
    return { maxD, minE: minE - span * 0.08, maxE: maxE + span * 0.08 };
  });

  const sx = (/** @type {number} */ d) =>
    bounds ? PAD.l + (d / bounds.maxD) * (W - PAD.l - PAD.r) : 0;
  const sy = (/** @type {number} */ e) =>
    bounds ? PAD.t + (1 - (e - bounds.minE) / (bounds.maxE - bounds.minE)) * (H - PAD.t - PAD.b) : 0;

  const areaPath = $derived.by(() => {
    if (!bounds) return '';
    const line = profile.map((p) => `${sx(p.distM).toFixed(1)},${sy(p.ele).toFixed(1)}`).join(' L');
    return `M${line} L${sx(bounds.maxD).toFixed(1)},${H} L${sx(0).toFixed(1)},${H} Z`;
  });
  const linePath = $derived.by(() =>
    bounds ? 'M' + profile.map((p) => `${sx(p.distM).toFixed(1)},${sy(p.ele).toFixed(1)}`).join(' L') : ''
  );

  let hoverIdx = $state(-1); // index into `profile`
  const hover = $derived(hoverIdx >= 0 ? profile[hoverIdx] : null);

  /** @param {PointerEvent} e */
  function onMove(e) {
    if (!bounds) return;
    const rect = /** @type {SVGElement} */ (e.currentTarget).getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = frac * bounds.maxD;
    // Nearest sample by distance.
    let lo = 0;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < profile.length; i++) {
      const gap = Math.abs(profile[i].distM - d);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    void lo;
    hoverIdx = best;
    onHover(profile[best].index);
  }
  function onLeave() {
    hoverIdx = -1;
    onHover(null);
  }

  const fmtDist = (/** @type {number} */ m) =>
    metric ? `${(m / 1000).toFixed(1)} km` : `${(m / 1609.344).toFixed(1)} mi`;
  const fmtEle = (/** @type {number} */ m) =>
    metric ? `${Math.round(m)} m` : `${Math.round(m * 3.28084)} ft`;

  // Markers (start/finish/campsites) as an HTML overlay — the SVG uses non-
  // uniform scaling (preserveAspectRatio=none) which would distort emoji, so we
  // position chips over it in %. left/top map viewBox coords → box fraction.
  const placed = $derived.by(() =>
    !bounds
      ? []
      : markers.map((m) => ({
          ...m,
          left: Math.min(97, Math.max(3, (sx(m.distM) / W) * 100)),
          top: (sy(m.ele) / H) * 100
        }))
  );
</script>

{#if bounds}
  <div class="mt-2 rounded-xl bg-white p-2.5">
    <div class="mb-1 flex items-center justify-between font-body text-[11.5px] font-extrabold text-cocoa-400">
      <span>⛰️ Elevation</span>
      {#if hover}
        <span class="text-cocoa-600">{fmtDist(hover.distM)} · {fmtEle(hover.ele)}</span>
      {:else}
        <span>{fmtDist(bounds.maxD)}</span>
      {/if}
    </div>
    <div class="relative h-28 w-full">
      <svg
        viewBox="0 0 {W} {H}" class="h-full w-full touch-none" preserveAspectRatio="none"
        role="img" aria-label="Elevation profile along the route"
        onpointermove={onMove} onpointerleave={onLeave}
      >
        <path d={areaPath} style="fill: var(--color-leaf-100, #dff0d8)" />
        <path d={linePath} fill="none" stroke-width="3" vector-effect="non-scaling-stroke" style="stroke: var(--color-leaf-600, #4a8a3a)" />
        {#each placed as m (m.kind + m.label + m.distM)}
          <line x1={sx(m.distM)} x2={sx(m.distM)} y1={sy(m.ele)} y2={H} stroke-width="1.5" vector-effect="non-scaling-stroke" style="stroke: var(--color-cocoa-300, #d9c3b0)" />
        {/each}
        {#if hover}
          <line x1={sx(hover.distM)} x2={sx(hover.distM)} y1={PAD.t} y2={H} stroke-width="2" vector-effect="non-scaling-stroke" style="stroke: var(--color-coral-500, #ff6b4a)" />
          <circle cx={sx(hover.distM)} cy={sy(hover.ele)} r="5" style="fill: var(--color-coral-500, #ff6b4a)" />
        {/if}
      </svg>
      <!-- Emoji markers overlaid (undistorted) at their along-route position. -->
      {#each placed as m (m.kind + m.label + m.distM)}
        <span
          class="pointer-events-none absolute -translate-x-1/2 -translate-y-full select-none text-[15px] leading-none drop-shadow"
          style="left: {m.left}%; top: {m.top}%"
          title="{m.label} · {fmtDist(m.distM)}"
        >{m.emoji}</span>
      {/each}
    </div>
  </div>
{/if}
