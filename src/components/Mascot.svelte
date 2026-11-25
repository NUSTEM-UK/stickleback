<script lang="ts">
  // A three-spined stickleback, drawn as if laser-cut from edge-glow acrylic: the eye is a drilled hole.
  let { size = 40 }: { size?: number } = $props();
</script>

<svg width={size} height={size / 2} viewBox="0 0 64 32" aria-hidden="true" class="fish">
  <g class="spines">
    <path d="M16.5 11.9 19 2.8 21.2 11.2Z" />
    <path d="M23.4 10.9 25.6 4.2 27.4 10.7Z" />
    <path d="M33.2 10.8 34.4 6.6 36 11Z" />
    <path d="M23 22.9 20.6 29.2 26.6 23.1Z" />
  </g>
  <path
    class="body"
    d="M3 17C8 11.2 19.5 9.8 31.5 10.4 39.5 10.9 45.6 13.2 50.6 15L60.5 8.4 57.6 16.5 60.5 24.6 50.6 18.1C45.6 19.9 39.5 22.4 31.5 22.9 19.5 23.6 8 22.4 3 17Z"
  />
  <path class="plates" d="M30 14.2C31.4 15.6 31.4 18 30 19.4M35 14.4C36.3 15.7 36.3 17.9 35 19.2M40 14.8C41.1 15.9 41.1 17.7 40 18.8" />
  <circle class="eye" cx="10.2" cy="15.6" r="1.7" />
</svg>

<style>
  .fish { display: block; overflow: visible; filter: drop-shadow(0 0 2px var(--acrylic)); }
  .body, .spines path {
    fill: color-mix(in srgb, var(--acrylic) 30%, transparent);
    stroke: var(--acrylic);
    stroke-width: 1.1;
    stroke-linejoin: round;
  }
  .plates { fill: none; stroke: var(--acrylic); stroke-width: 0.7; opacity: 0.6; }
  .eye { fill: var(--ink); stroke: var(--acrylic); stroke-width: 0.8; }
</style>
