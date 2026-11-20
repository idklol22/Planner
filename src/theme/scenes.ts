import type { SceneKind } from "./themes";

/** Background scenes, ported from LetCode (particles.js, clouds.js, uzumaki.js). One fixed canvas behind the
 *  app; each scene paints a static frame when animation is off or reduced motion is set, and animation is paused
 *  while the tab is hidden. Scenes are deliberately dim: text sits on glass tiles above them. */

export interface SceneHandle {
  stop(): void;
  resize(): void;
}

export interface SceneOptions {
  animate: boolean;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function loop(draw: (dt: number) => void, fps: number, animate: boolean): { stop(): void } {
  if (!animate || reducedMotion()) return { stop() {} };
  let raf = 0;
  let last = 0;
  let dead = false;
  const tick = (t: number) => {
    raf = 0;
    if (dead || document.hidden) return;
    if (t - last >= 1000 / fps) {
      draw(Math.min(0.2, last ? (t - last) / 1000 : 0.05));
      last = t;
    }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && !dead && !document.hidden) raf = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", kick);
  kick();
  return {
    stop() {
      dead = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", kick);
    },
  };
}

// ── Midnight / Smoke: drifting dust ─────────────────────────────────────────────────────────────
function particles(cv: HTMLCanvasElement, opts: SceneOptions): SceneHandle {
  const g = cv.getContext("2d")!;
  let W = 0;
  let H = 0;
  type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; tw: number; ts: number; big: boolean };
  let ps: P[] = [];
  const mk = (anyY: boolean): P => {
    const big = Math.random() < 0.08;
    return {
      x: Math.random() * W,
      y: anyY ? Math.random() * H : H + 10,
      r: big ? 1.6 + Math.random() * 1.6 : 0.4 + Math.random() * 1.0,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.05 + Math.random() * 0.22),
      a: big ? 0.05 + Math.random() * 0.07 : 0.15 + Math.random() * 0.4,
      tw: Math.random() * 6.28,
      ts: 0.01 + Math.random() * 0.04,
      big,
    };
  };
  const draw = () => {
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      const a = p.a * (0.55 + 0.45 * Math.sin(p.tw));
      if (p.big) {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        gr.addColorStop(0, `rgba(235,235,235,${a})`);
        gr.addColorStop(1, "rgba(235,235,235,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(p.x, p.y, p.r * 3, 0, 6.283);
        g.fill();
      } else {
        g.fillStyle = `rgba(235,235,235,${a})`;
        g.fillRect(p.x, p.y, p.r, p.r);
      }
    }
  };
  const step = () => {
    const t = performance.now() / 4000;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.x += p.vx + Math.sin(t + p.y * 0.004) * 0.06;
      p.y += p.vy;
      p.tw += p.ts;
      if (p.y < -10 || p.x < -10 || p.x > W + 10) ps[i] = mk(false);
    }
    draw();
  };
  const resize = () => {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
    ps = Array.from({ length: Math.round(Math.min(150, (W * H) / 11000)) }, () => mk(true));
    draw();
  };
  resize();
  const l = loop(step, 30, opts.animate);
  return { stop: l.stop, resize };
}

// ── Nimbus: dithered halftone cumulus over a night sky ──────────────────────────────────────────
function clouds(cv: HTMLCanvasElement, opts: SceneOptions): SceneHandle {
  const g = cv.getContext("2d", { alpha: false })!;
  const DOT = 4; // CSS px per dot; the canvas is small and scaled up crisp
  const INK = [5, 6, 15];
  const PAPER = [96, 94, 86]; // cream, dimmed: the scene is a backdrop, not content
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const R = new Float32Array(256 * 256);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < R.length; i++) R[i] = rnd();
  const sm = (u: number) => u * u * (3 - 2 * u);
  const vnoise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = sm(x - xi);
    const yf = sm(y - yi);
    const a = R[((yi & 255) << 8) | (xi & 255)];
    const b = R[((yi & 255) << 8) | ((xi + 1) & 255)];
    const c = R[(((yi + 1) & 255) << 8) | (xi & 255)];
    const d = R[(((yi + 1) & 255) << 8) | ((xi + 1) & 255)];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  let W = 0;
  let H = 0;
  let img: ImageData;
  let val: Float32Array;
  let puffs: { x: number; y: number; r: number; z: number }[] = [];
  let t = 3;
  const makePuffs = () => {
    puffs = [];
    const banks = Math.max(3, Math.round(W / 70));
    for (let b = 0; b < banks; b++) {
      const cx = ((b + 0.2 + rnd() * 0.5) / banks) * W * 1.4;
      const z = 0.35 + rnd() * 0.65;
      const baseY = H * (0.78 + 0.3 * z);
      const size = H * (0.13 + 0.17 * z);
      const n = 7 + Math.round(rnd() * 5);
      const tall = 0.8 + rnd() * 0.7;
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 0.5;
        const s = Math.sin(Math.PI * k);
        const r = size * (0.32 + 0.4 * s) * (0.8 + rnd() * 0.4);
        puffs.push({ x: cx + (k - 0.5) * size * 2.6 + (rnd() - 0.5) * size * 0.35, y: baseY - size * tall * 1.15 * s * (0.75 + rnd() * 0.3), r, z });
      }
    }
    puffs.sort((p, q) => p.z - q.z || p.y - q.y);
  };
  const frame = () => {
    const d = img.data;
    const span = W * 1.4;
    const sc = 3 / W;
    for (let y = 0; y < H; y++) {
      const fy = y / H;
      for (let x = 0; x < W; x++) val[y * W + x] = fy * fy * 0.07 + (vnoise(x * 0.04 + t * 0.3, y * 0.04) - 0.5) * 0.05;
    }
    for (const p of puffs) {
      const px = ((((p.x - t * W * 0.05 * (0.6 + p.z)) % span) + span) % span) - W * 0.2;
      const r = p.r;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(px - r));
      const x1 = Math.min(W - 1, Math.ceil(px + r));
      const y0 = Math.max(0, Math.floor(p.y - r));
      const y1 = Math.min(H - 1, Math.ceil(p.y + r));
      for (let y = y0; y <= y1; y++) {
        const dy = y - p.y;
        for (let x = x0; x <= x1; x++) {
          const dx = x - px;
          const q = (dx * dx + dy * dy) / r2;
          if (q >= 1) continue;
          const edge = Math.min(1, (1 - q) * 6);
          const down = (dy + r) / (2 * r);
          const fold = vnoise(x * sc * 5 + 40, y * sc * 5 + t * 0.2) * 0.6 + vnoise(x * sc * 11, y * sc * 11) * 0.4;
          const lit = Math.min(1, (1.08 - Math.pow(down, 1.2) * 0.95) * (0.42 + 0.58 * p.z) + (fold - 0.5) * 0.28);
          const i = y * W + x;
          val[i] += (lit - val[i]) * edge;
        }
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = val[i] > BAYER[(x & 3) + ((y & 3) << 2)] ? PAPER : INK;
        const o = i * 4;
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };
  const resize = () => {
    W = cv.width = Math.max(8, Math.round(innerWidth / DOT));
    H = cv.height = Math.max(8, Math.round(innerHeight / DOT));
    img = g.createImageData(W, H);
    val = new Float32Array(W * H);
    makePuffs();
    frame();
  };
  resize();
  const l = loop((dt) => {
    t += dt * 0.05;
    frame();
  }, 8, opts.animate);
  return { stop: l.stop, resize };
}

// ── Uzumaki: faint hand-drawn spirals and wind streaks, drawn once ─────────────────────────────
function uzumaki(cv: HTMLCanvasElement): SceneHandle {
  const g = cv.getContext("2d")!;
  const rng = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const wobble = (r: () => number) => {
    const k = [0, 1, 2].map(() => [0.3 + r() * 1.4, r() * 6.28, 0.3 + r() * 0.7]);
    return (x: number) => k.reduce((s, [f, p, a]) => s + Math.sin(x * f + p) * a, 0) / 1.6;
  };
  const spiral = (r: () => number, cx: number, cy: number, R: number, turns: number, alpha: number, width: number, dir: number) => {
    const n = wobble(r);
    const dry = wobble(r);
    const tMax = turns * Math.PI * 2;
    const steps = Math.round(turns * 220);
    for (let pass = 0; pass < 2; pass++) {
      const off = pass ? 0.012 + r() * 0.01 : 0;
      let px: number | null = null;
      let py = 0;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * tMax;
        const f = Math.pow(t / tMax, 0.92);
        const rad = R * f * (1 + 0.05 * n(t * 0.55) + off);
        const a = dir * t + 0.25 * n(t * 0.13);
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * 0.94;
        if (px !== null) {
          const ink = Math.max(0, 0.55 + 0.45 * dry(t * 0.8));
          g.globalAlpha = alpha * ink * (pass ? 0.45 : 1) * (0.35 + 0.65 * f);
          g.lineWidth = width * (0.6 + 0.6 * f) * (pass ? 0.6 : 1);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(x, y);
          g.stroke();
        }
        px = x;
        py = y;
      }
    }
  };
  const draw = () => {
    const W = (cv.width = Math.min(1800, innerWidth));
    const H = (cv.height = Math.min(1200, innerHeight));
    const r = rng(20261116);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgb(236,228,212)";
    g.lineCap = "round";
    g.lineJoin = "round";
    const m = Math.min(W, H);
    const eyes = [
      { x: W * 0.8, y: H * 0.3, R: m * 0.62, turns: 9, a: 0.2, w: 1.5, dir: 1 },
      { x: W * 0.1, y: H * 0.86, R: m * 0.34, turns: 6, a: 0.15, w: 1.2, dir: -1 },
      { x: W * 0.46, y: H * 0.06, R: m * 0.14, turns: 4, a: 0.13, w: 1, dir: 1 },
    ];
    for (let k = 0; k < 140; k++) {
      let x = r() * W;
      let y = r() * H;
      let best = eyes[0];
      let bd = Infinity;
      for (const e of eyes) {
        const d = Math.hypot(x - e.x, y - e.y) / e.R;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      const len = 30 + r() * 140;
      g.globalAlpha = (0.035 + r() * 0.07) * Math.max(0.25, 1.2 - bd * 0.5);
      g.lineWidth = 0.6 + r() * 1.1;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < len; s += 6) {
        const dx = x - best.x;
        const dy = y - best.y;
        const d = Math.hypot(dx, dy) || 1;
        x += ((-dy / d) * best.dir * 0.93 - (dx / d) * 0.18) * 6;
        y += ((dx / d) * best.dir * 0.93 - (dy / d) * 0.18) * 6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (const e of eyes) spiral(r, e.x, e.y, e.R, e.turns, e.a, e.w, e.dir);
    g.globalAlpha = 1;
  };
  draw();
  let timer = 0;
  return {
    stop() {
      clearTimeout(timer);
    },
    resize() {
      clearTimeout(timer);
      timer = window.setTimeout(draw, 300);
    },
  };
}

export function startScene(kind: SceneKind, cv: HTMLCanvasElement, opts: SceneOptions): SceneHandle {
  if (kind === "clouds") return clouds(cv, opts);
  if (kind === "uzumaki") return uzumaki(cv);
  return particles(cv, opts);
}
