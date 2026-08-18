/* A rogue AI finding a weak spot and leaning on it.
   It never opens a hole. The wall stays intact and the shape of the thing
   behind it comes forward through the strands like a pin-art relief:
   the elements it presses on brighten and swell, everything else holds. */
(function () {
  "use strict";
  const BW = window.BW = window.BW || {};
  const { rnd, clamp, N, smooth } = BW;

  BW.Breach = class Breach {
    constructor() {
      this.active = false;
      this.next = rnd(14, 32);
      this.onOpen = null;
      this.blobs = [];
      this.env = 0;
    }

    open(t, W, H) {
      const cx = rnd(W * 0.18, W * 0.82);
      const cy = rnd(H * 0.3, H * 0.7);
      const scale = Math.min(W, H) * rnd(0.16, 0.3);

      /* a handful of overlapping lobes: a silhouette, not a circle */
      const n = 3 + (Math.random() * 4 | 0);
      this.blobs = [];
      for (let i = 0; i < n; i++) {
        this.blobs.push({
          ox: rnd(-0.7, 0.7) * scale,
          oy: rnd(-0.9, 0.9) * scale,
          r : scale * rnd(0.36, 0.85),
          ph: Math.random() * 900,
          sp: rnd(0.05, 0.16),
          wander: scale * rnd(0.08, 0.26)
        });
      }

      this.cx = cx; this.cy = cy; this.scale = scale;
      this.t0 = t;
      this.dur = rnd(7, 15);
      this.depth = rnd(0.4, 0.8);     /* how far it gets before the wall holds */
      this.active = true;
      this.env = 0;
      if (this.onOpen) this.onOpen();
    }

    /* probe → press → the wall pushes back → gone */
    envelope(k) {
      if (k < 0.3)  return smooth(k / 0.3) * 0.4;
      if (k < 0.62) return 0.4 + smooth((k - 0.3) / 0.32) * 0.6;
      if (k < 0.72) return 1;
      return 1 - smooth(clamp((k - 0.72) / 0.28, 0, 1));
    }

    update(t, W, H) {
      if (!this.active) {
        if (t > this.next) this.open(t, W, H);
        return;
      }
      const k = (t - this.t0) / this.dur;
      if (k >= 1) {
        this.active = false;
        this.env = 0;
        this.next = t + rnd(20, 70);
        return;
      }
      this.env = this.envelope(k) * this.depth;

      /* the lobes keep shifting, so the silhouette is never twice the same */
      for (const b of this.blobs) {
        b.x = this.cx + b.ox + N(t * b.sp, b.ph) * b.wander;
        b.y = this.cy + b.oy + N(t * b.sp * 0.83, b.ph * 1.7) * b.wander;
      }

      /* bounding box, so the wall only pays for columns it touches */
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const b of this.blobs) {
        x0 = Math.min(x0, b.x - b.r * 1.6); x1 = Math.max(x1, b.x + b.r * 1.6);
        y0 = Math.min(y0, b.y - b.r * 1.6); y1 = Math.max(y1, b.y + b.r * 1.6);
      }
      this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1;
    }

    /* how hard the thing is pushing on this point of the wall, 0..1 */
    field(px, py) {
      if (!this.active || this.env <= 0) return 0;
      let f = 0;
      for (let i = 0; i < this.blobs.length; i++) {
        const b = this.blobs[i];
        const dx = px - b.x, dy = py - b.y;
        const d2 = (dx * dx + dy * dy) / (b.r * b.r);
        if (d2 < 6) f += Math.exp(-d2);
      }
      /* a ragged edge — it is a silhouette, not a bubble */
      const edge = 0.06 * N(px * 0.021, py * 0.017) + 0.04 * N(py * 0.038, px * 0.029);
      return clamp(smooth(clamp((f - 0.42 + edge) / 0.46, 0, 1)) * this.env, 0, 1);
    }
  };
})();
