// Lightweight celebratory effects — confetti (canvas) + chime (Web Audio).
// Both respect the user's mute preference (localStorage 'pa.muted').

const MUTE_KEY = 'pa.muted';

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; }
  catch { return false; }
}

export function setMuted(muted) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {}
}

const PASTEL = [
  '#6366f1', // indigo
  '#8b5cf6', // purple
  '#f472b6', // pink
  '#fbbf24', // amber
  '#34d399', // emerald
  '#60a5fa', // blue
  '#a78bfa', // violet
];

/**
 * Fire a confetti burst from the upper-middle of the viewport.
 * intensity 1 = normal, 2 = personal best.
 */
export function fireConfetti(intensity = 1) {
  if (isMuted() || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0',
    pointerEvents: 'none',
    zIndex: '9999',
  });
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const count = Math.min(180, Math.floor(60 * intensity));
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.4,
      y: H * 0.38 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 14 * intensity,
      vy: -Math.random() * 16 - 6,
      g: 0.45,
      drag: 0.992,
      color: PASTEL[Math.floor(Math.random() * PASTEL.length)],
      size: 5 + Math.random() * 7,
      angle: Math.random() * 360,
      angularV: (Math.random() - 0.5) * 14,
      shape: Math.random() < 0.5 ? 'square' : 'circle',
      life: 1,
    });
  }

  let lastT = performance.now();
  const tick = (t) => {
    const dt = Math.min(34, t - lastT) / 16.67;
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of particles) {
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt);
      p.vy *= Math.pow(p.drag, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularV * dt;
      if (p.y > H * 0.85) p.life -= 0.012 * dt;
      if (p.life > 0 && p.y < H + 60) alive = true;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'square') ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  };
  requestAnimationFrame(tick);
}

/**
 * Play a short chime via Web Audio. type='pass' = major triad,
 * type='best' = brighter rising arpeggio.
 */
export function playChime(type = 'pass') {
  if (isMuted()) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    const ctx = new AC();
    const notes = type === 'best'
      ? [659.25, 880, 1108.73, 1318.51] // E5 A5 C#6 E6
      : [659.25, 880, 1108.73];          // E5 A5 C#6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      osc.start(t0);
      osc.stop(t0 + 0.95);
    });
    // Auto-close to free resources
    setTimeout(() => { try { ctx.close(); } catch {} }, 1500);
  } catch {}
}

export function celebrate({ personalBest = false } = {}) {
  fireConfetti(personalBest ? 2 : 1);
  playChime(personalBest ? 'best' : 'pass');
}
