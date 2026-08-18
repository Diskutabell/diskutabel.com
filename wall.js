/* The wall itself.
   Straight vertical strands with a dot-matrix grain, fixed in place — the
   strands do not travel sideways. What moves is light: slow zones of
   pressure sliding along the wall, individual strands waking and dying,
   and whatever leans on it from the far side. */
(function () {
  "use strict";
  const BW = window.BW = window.BW || {};
  const { N, N01, rnd, clamp, LUT_WARM, LUT_COLD, LEVELS, level } = BW;

  BW.Wall = class Wall {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.buf = document.createElement("canvas");
      this.bx = this.buf.getContext("2d");
      this.g1 = document.createElement("canvas"); this.g1x = this.g1.getContext("2d");
      this.g2 = document.createElement("canvas"); this.g2x = this.g2.getContext("2d");
      this.reduced = !!(opts && opts.reduced);
      this.breach = null;

      this.zones = [];
      for (let i = 0; i < 3; i++)
        this.zones.push({ ph: Math.random() * 900, sp: 0.014 + i * 0.009, w: 0.09 + i * 0.06, amp: 0.34 - i * 0.09 });

      this.glitches = [];
      this.nextGlitch = rnd(5, 16);
      this.resize();
    }

    resize() {
      const W = this.W = window.innerWidth;
      const H = this.H = window.innerHeight;
      const DPR = this.DPR = Math.min(window.devicePixelRatio || 1, W < 620 ? 1.5 : 2);

      this.cv.width  = this.buf.width  = Math.max(2, Math.round(W * DPR));
      this.cv.height = this.buf.height = Math.max(2, Math.round(H * DPR));
      this.cv.style.width = W + "px";
      this.cv.style.height = H + "px";
      this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      this.bx.setTransform(DPR, 0, 0, DPR, 0, 0);

      this.gw1 = Math.max(2, Math.round(W / 5));  this.gh1 = Math.max(2, Math.round(H / 5));
      this.gw2 = Math.max(2, Math.round(W / 20)); this.gh2 = Math.max(2, Math.round(H / 20));
      this.g1.width = this.gw1; this.g1.height = this.gh1;
      this.g2.width = this.gw2; this.g2.height = this.gh2;

      this.buildStrands();
      this.buildSpecks();
      this.buildGrain();
      this.buildVignette();
    }

    buildStrands() {
      const { W } = this;
      const k = W < 620 ? 0.65 : 1;
      const s = [];
      let x = -6;
      while (x < W + 6) {
        /* bundles: a run of tight strands, then a dark lane */
        const span = rnd(40, 210) * k;
        const dens = rnd(0.35, 1);
        const end = x + span;
        while (x < end && x < W + 6) {
          const w = 0.7 + Math.pow(Math.random(), 2.3) * 4.6 * k;
          const cold = Math.random() < 0.17;
          s.push({
            x, w, cold,
            /* the dot-matrix grain: each strand is a column of pins */
            bead: 1.6 + Math.random() * 3.6,
            gapY: 1.2 + Math.random() * 3.4,
            offY: Math.random() * 9,
            base: 0.2 + Math.pow(Math.random(), 1.7) * 0.62,
            ph  : Math.random() * 900,
            freq: 0.018 + Math.random() * 0.14,
            flare: Math.random() * 900
          });
          x += w + (0.8 + Math.pow(Math.random(), 1.7) * 8 * k) * (1.3 - dens * 0.6);
        }
        x += rnd(1, 22) * (1.25 - dens) * k;
      }
      this.strands = s;
    }

    buildSpecks() {
      const n = Math.round((this.W * this.H) / 24000);
      this.specks = [];
      for (let i = 0; i < n; i++)
        this.specks.push({ x: Math.random() * this.W, y: Math.random() * this.H, p: Math.random() * 900 });
    }

    buildGrain() {
      const s = 168;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const g = c.getContext("2d");
      const im = g.createImageData(s, s);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = 110 + Math.random() * 140;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = Math.random() * 40;
      }
      g.putImageData(im, 0, 0);
      this.grain = c;
      this.grainPat = this.ctx.createPattern(c, "repeat");
    }

    buildVignette() {
      const { W, H } = this;
      const c = document.createElement("canvas");
      c.width = Math.max(2, W); c.height = Math.max(2, H);
      const g = c.getContext("2d");
      const r = g.createRadialGradient(W * .5, H * .5, Math.min(W, H) * .12, W * .5, H * .5, Math.max(W, H) * .76);
      r.addColorStop(0, "rgba(3,1,10,0)");
      r.addColorStop(.55, "rgba(3,1,10,.42)");
      r.addColorStop(1, "rgba(3,1,10,.98)");
      g.fillStyle = r; g.fillRect(0, 0, W, H);
      this.vign = c;
    }

    /* slow zones of pressure sliding along the wall */
    zoneBoost(t, x) {
      const { W } = this;
      let v = 0;
      for (const z of this.zones) {
        const zx = W * (0.5 + 0.62 * N(t * z.sp, z.ph));
        const d = (x - zx) / (W * z.w);
        v += z.amp * Math.exp(-d * d * 0.5);
      }
      return v;
    }

    scheduleGlitch(t) {
      const kinds = this.reduced ? ["sort"] : ["sort", "slice", "sort", "mosh"];
      const kind = kinds[Math.random() * kinds.length | 0];
      const g = { kind, t0: t, dur: 0.05 + Math.random() * 0.3 };
      if (kind === "slice") {
        g.strips = [];
        const n = 2 + (Math.random() * 5 | 0);
        for (let i = 0; i < n; i++)
          g.strips.push({ y: Math.random() * this.H, h: 2 + Math.random() * 40, dx: rnd(-50, 50) });
      }
      if (kind === "sort") { g.y = Math.random() * this.H; g.h = 10 + Math.random() * 130; g.dur = 0.1 + Math.random() * 0.7; }
      if (kind === "mosh") { g.dx = rnd(-16, 16); g.dur = 0.06 + Math.random() * 0.28; }
      this.glitches.push(g);
      this.nextGlitch = t + (this.reduced ? rnd(18, 44) : rnd(3, 19));
    }

    draw(t, dt) {
      const { ctx, bx, W, H, DPR, cv, buf } = this;
      const slow = this.reduced ? 0.3 : 1;
      const B = this.breach;

      if (t > this.nextGlitch) this.scheduleGlitch(t);
      this.glitches = this.glitches.filter(g => t - g.t0 < g.dur);

      /* ---------------- void ---------------- */
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#03010a";
      ctx.fillRect(0, 0, W, H);

      /* motes hanging in the dark */
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.specks) {
        const a = 0.03 + 0.22 * Math.pow(N01(t * 0.35 * slow, s.p), 4);
        ctx.fillStyle = "rgba(226,206,232," + a.toFixed(3) + ")";
        ctx.fillRect(s.x, s.y, 1, 1);
      }
      ctx.globalCompositeOperation = "source-over";

      /* ---------------- strands ---------------- */
      bx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bx.clearRect(0, 0, W, H);
      bx.globalCompositeOperation = "lighter";

      const touched = B && B.active && B.env > 0.004;

      for (const s of this.strands) {
        const x = s.x;                                  /* fixed. strands do not drift. */
        let v = s.base * (0.5 + 0.8 * N01(t * s.freq * slow, s.ph));
        v += this.zoneBoost(t, x) * (0.35 + 0.5 * s.base);
        if (!this.reduced && N(t * 0.9 + s.flare, s.ph * 0.7) > 0.955) v += 0.4;

        const inBreach = touched && x > B.x0 - 4 && x < B.x1 + 4;

        if (!inBreach) {
          /* one dashed stroke per strand: the pin grain, almost free */
          const lv = level(v);
          if (lv < 1) continue;
          bx.strokeStyle = s.cold ? LUT_COLD[lv] : LUT_WARM[lv];
          bx.lineWidth = s.w;
          bx.setLineDash([s.bead, s.gapY]);
          bx.lineDashOffset = s.offY;
          bx.beginPath();
          bx.moveTo(x + s.w * 0.5, 0);
          bx.lineTo(x + s.w * 0.5, H);
          bx.stroke();
        } else {
          /* inside the incursion the pins are addressed one at a time:
             the ones being pushed come forward — brighter and fatter —
             and the wall itself is never broken open */
          bx.setLineDash([]);
          const step = s.bead + s.gapY;
          const lut = s.cold ? LUT_COLD : LUT_WARM;
          for (let y = s.offY - step; y < H; y += step) {
            let f = 0;
            if (y > B.y0 - 20 && y < B.y1 + 20) f = B.field(x, y + s.bead * 0.5);
            if (f <= 0.002) {
              const lv = level(v);
              if (lv > 0) { bx.fillStyle = lut[lv]; bx.fillRect(x, y, s.w, s.bead); }
              continue;
            }
            /* the pin comes forward: it lengthens and thickens and picks up
               light, but the gap above it never closes, so the shape stays
               legible as a field of pins rather than a solid hole */
            const lv = level(v + f * 0.2);
            const maxBead = step * 0.88;
            const bead = Math.min(maxBead, s.bead * (1 + f * 1.35));
            const wid = s.w * (1 + f * 0.5);
            bx.fillStyle = lut[lv];
            bx.fillRect(x - (wid - s.w) * 0.5, y - (bead - s.bead) * 0.5, wid, bead);
          }
        }
      }
      bx.setLineDash([]);

      /* no visible top or bottom edge */
      bx.globalCompositeOperation = "destination-in";
      const m = bx.createLinearGradient(0, 0, 0, H);
      m.addColorStop(0, "rgba(0,0,0,0.05)");
      m.addColorStop(.16, "rgba(0,0,0,0.8)");
      m.addColorStop(.5, "rgba(0,0,0,1)");
      m.addColorStop(.86, "rgba(0,0,0,0.78)");
      m.addColorStop(1, "rgba(0,0,0,0.05)");
      bx.fillStyle = m;
      bx.fillRect(0, 0, W, H);
      bx.globalCompositeOperation = "source-over";

      ctx.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, W, H);

      /* ---------------- bloom ---------------- */
      this.g1x.clearRect(0, 0, this.gw1, this.gh1);
      this.g1x.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, this.gw1, this.gh1);
      this.g2x.clearRect(0, 0, this.gw2, this.gh2);
      this.g2x.drawImage(this.g1, 0, 0, this.gw1, this.gh1, 0, 0, this.gw2, this.gh2);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.26;
      ctx.drawImage(this.g1, 0, 0, this.gw1, this.gh1, 0, 0, W, H);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(this.g2, 0, 0, this.gw2, this.gh2, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      /* ---------------- corruption ---------------- */
      for (const g of this.glitches) {
        if (g.kind === "slice") {
          for (const st of g.strips)
            ctx.drawImage(cv, 0, st.y * DPR, cv.width, st.h * DPR, st.dx, st.y, W, st.h);
        } else if (g.kind === "sort") {
          /* pixel sort: one row smeared down a band, the way the game's
             post-process shreds the image near the wall */
          const src = clamp(g.y, 0, H - 1);
          ctx.globalAlpha = 0.85;
          ctx.drawImage(cv, 0, src * DPR, cv.width, 1, 0, src, W, g.h);
          ctx.globalAlpha = 1;
        } else if (g.kind === "mosh") {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.26;
          ctx.drawImage(cv, 0, 0, cv.width, cv.height, g.dx, 0, W, H);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }

      /* the air in front of the wall carries a faint charge; nothing here
         ever sits at pure black */
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(54,14,38,0.07)";
      ctx.fillRect(0, 0, W, H);
      for (const z of this.zones) {
        const zx = W * (0.5 + 0.62 * N(t * z.sp, z.ph));
        const rr = W * (0.34 + z.w * 2.2);
        const gr = ctx.createRadialGradient(zx, H * 0.5, 0, zx, H * 0.5, rr);
        gr.addColorStop(0, "rgba(150,44,96,0.075)");
        gr.addColorStop(0.5, "rgba(96,26,68,0.032)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(zx - rr, 0, rr * 2, H);
      }
      ctx.globalCompositeOperation = "source-over";

      /* ---------------- film ---------------- */
      if (this.grainPat) {
        ctx.globalAlpha = 0.05;
        const gx = -Math.random() * 168, gy = -Math.random() * 168;
        ctx.save(); ctx.translate(gx, gy);
        ctx.fillStyle = this.grainPat;
        ctx.fillRect(-gx, -gy, W, H);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      if (this.vign) ctx.drawImage(this.vign, 0, 0, W, H);
    }
  };
})();
