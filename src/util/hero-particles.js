// Animate the hero illustration particles via requestAnimationFrame.
// SVG transform attribute writes are universally supported — works on
// every browser without the SMIL animateMotion/Transform quirks.

const PARTICLES = [
  { x0: 92,  y0: 110, xMid: 116, yMid: 88,  x1: 140, y1: 110, delay: 0    },
  { x0: 92,  y0: 110, xMid: 116, yMid: 110, x1: 140, y1: 110, delay: 800  },
  { x0: 92,  y0: 110, xMid: 116, yMid: 132, x1: 140, y1: 110, delay: 1600 },
  { x0: 140, y0: 110, xMid: 164, yMid: 88,  x1: 188, y1: 110, delay: 0    },
  { x0: 140, y0: 110, xMid: 164, yMid: 110, x1: 188, y1: 110, delay: 1000 },
  { x0: 140, y0: 110, xMid: 164, yMid: 132, x1: 188, y1: 110, delay: 1800 },
];

const DURATION = 2400; // ms

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function startHeroParticles() {
  const nodes = document.querySelectorAll('.hero-illust [data-particle]');
  if (nodes.length < PARTICLES.length) return;

  const reduced = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    // Show all particles in their start position at low opacity
    PARTICLES.forEach((p, i) => {
      nodes[i].setAttribute('transform', `translate(${p.x0},${p.y0})`);
      nodes[i].setAttribute('opacity', '0.4');
    });
    return;
  }

  const start = performance.now();
  let running = true;

  // Pause when the tab is hidden (saves battery)
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(tick);
  });

  function tick(now) {
    if (!running) return;
    const elapsed = now - start;
    PARTICLES.forEach((p, i) => {
      const node = nodes[i];
      if (!node) return;
      let phase = ((elapsed - p.delay) % DURATION) / DURATION;
      if (phase < 0) phase = ((phase % 1) + 1) % 1;

      // Position: 3-point easing through start → mid → end
      let x, y;
      if (phase < 0.5) {
        const t = easeInOut(phase * 2);
        x = lerp(p.x0, p.xMid, t);
        y = lerp(p.y0, p.yMid, t);
      } else {
        const t = easeInOut((phase - 0.5) * 2);
        x = lerp(p.xMid, p.x1, t);
        y = lerp(p.yMid, p.y1, t);
      }

      // Opacity: fade in over first 15%, hold, fade out over last 15%
      let opacity;
      if (phase < 0.15)      opacity = phase / 0.15;
      else if (phase > 0.85) opacity = (1 - phase) / 0.15;
      else                   opacity = 1;

      node.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      node.setAttribute('opacity', opacity.toFixed(2));
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
