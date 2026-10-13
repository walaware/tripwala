<script>
  // A small, read-only Leaflet map for rail cards: frames the trip's pins (or
  // its pinned location) with the same emoji pin-bubbles as the full map, all
  // interactions off. The whole card stays one click-target — a transparent
  // overlay forwards the click (interactions are disabled, so Leaflet never
  // competes for it). Browser-only, like MapSection: Leaflet loads in onMount.
  import 'leaflet/dist/leaflet.css';
  import { onMount } from 'svelte';
  import { hasCoords } from '$lib/coords.js';
  import { emojiOf } from '$lib/pinCategories.js';

  /**
   * @type {{
   *   pins: Array<{ id: string, label: string, category: string, lat: number, lng: number }>,
   *   trip?: { lat?: number, lng?: number } | null,
   *   height?: number
   * }}
   */
  let { pins = [], trip = null, height = 200 } = $props();

  /** @type {any} */ let L = null;
  /** @type {any} */ let map = null;
  /** @type {any} */ let pinLayer = null;
  /** @type {HTMLDivElement | undefined} */ let mapEl;
  let ready = $state(false);

  onMount(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('leaflet');
      if (cancelled || !mapEl) return;
      L = mod.default ?? mod;
      map = L.map(mapEl, {
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false
      }).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      pinLayer = L.layerGroup().addTo(map);
      ready = true;
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      map = null;
    };
  });

  // Re-draw markers + re-frame whenever the pins refresh (invalidateAll).
  $effect(() => {
    const ps = pins;
    if (!ready || !L || !map) return;
    pinLayer.clearLayers();
    for (const p of ps) {
      L.marker([p.lat, p.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<div class="mini-pin">${emojiOf(p.category)}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26]
        })
      }).addTo(pinLayer);
    }
    if (ps.length) {
      map.fitBounds(L.latLngBounds(ps.map((/** @type {any} */ p) => [p.lat, p.lng])), {
        padding: [26, 26],
        maxZoom: 13
      });
    } else if (trip && hasCoords(trip.lat, trip.lng)) {
      map.setView([trip.lat, trip.lng], 11);
    }
  });
</script>

<div class="relative overflow-hidden rounded-[var(--radius-md,10px)] border-2 border-sand-200" style="height: {height}px">
  <div bind:this={mapEl} class="h-full w-full"></div>
</div>

<style>
  :global(.mini-pin) {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    font-size: 14px;
    line-height: 1;
    background: var(--color-surface-card, #fff);
    border: 2px solid var(--color-sand-300, #ffe0c2);
    border-radius: 9999px;
    box-shadow: 0 2px 6px rgba(43, 30, 28, 0.25);
  }
</style>
