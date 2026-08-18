/* The sound of standing in front of it.
   Nothing here is a sample and nothing is on a timer that repeats: the
   drones sit on a permanent random walk, and every event is scheduled at
   a random distance from the last one. */
(function () {
  "use strict";
  const BW = window.BW = window.BW || {};
  const { rnd } = BW;

  BW.Sound = class Sound {
    constructor() {
      this.ac = null;
      this.started = false;
      this.drones = [];
      this.timers = [];
    }

    get time() { return this.ac.currentTime; }

    async start() {
      if (this.started) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ac = new AC();
      try { await ac.resume(); } catch (e) {}
      if (ac.state !== "running") { try { ac.close(); } catch (e) {} return false; }
      this.ac = ac;
      this.started = true;
      this.build();
      return true;
    }

    impulse(sec, decay) {
      const ac = this.ac, len = Math.floor(ac.sampleRate * sec);
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    noise(sec, brown) {
      const ac = this.ac, len = Math.floor(ac.sampleRate * sec);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      let l = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { l = (l + 0.019 * w) / 1.019; d[i] = l * 3.4; }
        else d[i] = w;
      }
      return buf;
    }

    shaper(amt) {
      const ws = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = i / 512 - 1;
        ws[i] = (1 + amt) * x / (1 + amt * Math.abs(x));
      }
      const n = this.ac.createWaveShaper();
      n.curve = ws; n.oversample = "2x";
      return n;
    }

    build() {
      const ac = this.ac;

      this.master = ac.createGain();
      this.master.gain.value = 0;

      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -24; comp.ratio.value = 8; comp.release.value = 0.45;
      const shelf = ac.createBiquadFilter();
      shelf.type = "highshelf"; shelf.frequency.value = 4600; shelf.gain.value = -18;

      this.master.connect(comp); comp.connect(shelf); shelf.connect(ac.destination);

      /* something enormous, a long way off */
      const verb = ac.createConvolver();
      verb.buffer = this.impulse(9, 2.4);
      this.wet = ac.createGain(); this.wet.gain.value = 0.9;
      this.wet.connect(verb); verb.connect(this.master);

      [[32.7, 0.55, "sine"], [38.9, 0.36, "sine"], [49.0, 0.22, "triangle"], [65.4, 0.1, "sawtooth"]]
        .forEach(([f, g, type], i) => {
          const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
          const lp = ac.createBiquadFilter();
          lp.type = "lowpass"; lp.frequency.value = 150 + i * 80; lp.Q.value = 3;
          const gn = ac.createGain(); gn.gain.value = g;
          o.connect(lp); lp.connect(gn); gn.connect(this.master); gn.connect(this.wet);
          o.start();
          this.drones.push({ o, gn, lp, base: f, baseG: g });
        });

      this.nsrc = ac.createBufferSource();
      this.nsrc.buffer = this.noise(43, true);
      this.nsrc.loop = true;
      this.nfilt = ac.createBiquadFilter();
      this.nfilt.type = "bandpass"; this.nfilt.frequency.value = 320; this.nfilt.Q.value = 0.7;
      const ng = ac.createGain(); ng.gain.value = 0.45;
      this.nsrc.connect(this.nfilt); this.nfilt.connect(ng);
      ng.connect(this.master); ng.connect(this.wet);
      this.nsrc.start();

      this.master.gain.setTargetAtTime(0.27, this.time, 7);
      this.drift();
      this.schedule();
    }

    drift() {
      if (!this.ac) return;
      const now = this.time;
      for (const d of this.drones) {
        d.o.frequency.setTargetAtTime(d.base * rnd(0.986, 1.015), now, rnd(5, 16));
        d.gn.gain.setTargetAtTime(d.baseG * rnd(0.45, 1.2), now, rnd(6, 18));
        d.lp.frequency.setTargetAtTime(rnd(70, 400), now, rnd(7, 20));
      }
      this.nfilt.frequency.setTargetAtTime(rnd(110, 1700), now, rnd(5, 14));
      this.nfilt.Q.setTargetAtTime(rnd(0.4, 5), now, 9);
      this.nsrc.playbackRate.setTargetAtTime(rnd(0.7, 1.15), now, 11);
      this.timers.push(setTimeout(() => this.drift(), rnd(3600, 12000)));
    }

    /* --- one-shot events --- */
    voice() {                       /* human speech, made unsafe */
      const ac = this.ac, now = this.time, dur = rnd(1.8, 6);
      const src = ac.createBufferSource();
      src.buffer = this.noise(7, false);
      src.playbackRate.value = rnd(0.3, 0.85);
      const out = ac.createGain(); out.gain.value = 0;
      const fs = [rnd(260, 780), rnd(880, 2000), rnd(2200, 3100)];
      fs.forEach((f, i) => {
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = rnd(12, 30);
        const g = ac.createGain(); g.gain.value = [1, .5, .22][i];
        src.connect(bp); bp.connect(g); g.connect(out);
        bp.frequency.setTargetAtTime(f * rnd(0.55, 1.7), now + dur * 0.3, dur * 0.5);
      });
      out.connect(this.master); out.connect(this.wet);
      out.gain.linearRampToValueAtTime(rnd(0.04, 0.13), now + rnd(0.4, 1.3));
      out.gain.setTargetAtTime(0.0001, now + dur * 0.55, dur * 0.3);
      src.start(now); src.stop(now + dur + .3);
    }

    screech() {                     /* carrier, corrupted */
      const ac = this.ac, now = this.time, dur = rnd(0.4, 2.4);
      const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain();
      c.type = "sawtooth"; m.type = "square";
      c.frequency.value = rnd(200, 1400);
      m.frequency.value = rnd(18, 300);
      mg.gain.value = rnd(180, 2200);
      m.connect(mg); mg.connect(c.frequency);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = rnd(600, 3200); bp.Q.value = rnd(2, 12);
      const g = ac.createGain(); g.gain.value = 0;
      c.connect(bp); bp.connect(this.shaper(6)).connect(g);
      g.connect(this.master); g.connect(this.wet);
      g.gain.linearRampToValueAtTime(rnd(0.02, 0.1), now + rnd(0.01, 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      c.frequency.setTargetAtTime(rnd(100, 2400), now, dur * 0.6);
      c.start(now); m.start(now); c.stop(now + dur + .1); m.stop(now + dur + .1);
    }

    pulse() {                       /* packets */
      const ac = this.ac, now = this.time, n = 2 + (Math.random() * 8 | 0);
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(); o.type = "square";
        o.frequency.value = rnd(55, 800);
        const g = ac.createGain(); g.gain.value = 0;
        o.connect(this.shaper(28)).connect(g); g.connect(this.master); g.connect(this.wet);
        const s = now + i * rnd(0.03, 0.16);
        g.gain.setValueAtTime(rnd(0.012, 0.05), s);
        g.gain.exponentialRampToValueAtTime(0.0001, s + rnd(0.02, 0.1));
        o.start(s); o.stop(s + 0.2);
      }
    }

    swell() {                       /* pressure from the far side */
      const ac = this.ac, now = this.time, dur = rnd(7, 20);
      const src = ac.createBufferSource();
      src.buffer = this.noise(22, true); src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 55; lp.Q.value = 8;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.wet);
      g.gain.linearRampToValueAtTime(rnd(0.09, 0.26), now + dur * 0.55);
      g.gain.linearRampToValueAtTime(0, now + dur);
      lp.frequency.exponentialRampToValueAtTime(rnd(180, 1400), now + dur * 0.55);
      lp.frequency.exponentialRampToValueAtTime(45, now + dur);
      src.start(now); src.stop(now + dur + .3);
    }

    impact() {
      const ac = this.ac, now = this.time, dur = rnd(2, 5);
      const o = ac.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(rnd(62, 120), now);
      o.frequency.exponentialRampToValueAtTime(rnd(18, 28), now + dur * 0.7);
      const g = ac.createGain(); g.gain.value = 0;
      o.connect(this.shaper(3)).connect(g); g.connect(this.master); g.connect(this.wet);
      g.gain.linearRampToValueAtTime(rnd(0.12, 0.3), now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.start(now); o.stop(now + dur + .1);
    }

    schedule() {
      if (!this.ac) return;
      const pool = ["voice", "voice", "swell", "screech", "pulse", "impact", "swell", "voice"];
      try { this[pool[Math.random() * pool.length | 0]](); } catch (e) {}
      this.timers.push(setTimeout(() => this.schedule(), rnd(3500, 22000)));
    }

    /* called when something starts pushing on the wall */
    breach() {
      if (!this.ac) return;
      try {
        this.impact();
        setTimeout(() => { try { this.voice(); } catch (e) {} }, 400 + Math.random() * 1100);
        setTimeout(() => { try { this.screech(); } catch (e) {} }, 1200 + Math.random() * 2600);
      } catch (e) {}
    }
  };
})();
