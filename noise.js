/* Shared math for the Blackwall.
   Everything time-based is built from sines whose frequency ratios are
   mutually irrational, so no layer ever re-phases with another and the
   wall never returns to a state it has already been in. Nothing loops. */
(function () {
  "use strict";
  const BW = window.BW = window.BW || {};

  BW.N = function (t, p) {
    return Math.sin(t * 0.70000 + p)          * 0.50
         + Math.sin(t * 1.13007 + p * 1.7071) * 0.30
         + Math.sin(t * 2.39207 + p * 0.3131) * 0.13
         + Math.sin(t * 4.66921 + p * 2.2360) * 0.07;
  };
  /* same, normalised to 0..1 */
  BW.N01 = function (t, p) { return 0.5 + 0.5 * BW.N(t, p); };

  BW.rnd   = (a, b) => a + Math.random() * (b - a);
  BW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  BW.smooth = (x) => x * x * (3 - 2 * x);

  /* Colour is a function of how hard a strand is burning, like a blackbody
     ramp: dead strands sit near black, only the hottest reach white. */
  const WARM = [
    [0.00, [ 12,   4,  14]],
    [0.18, [ 62,  16,  34]],
    [0.38, [138,  30,  58]],
    [0.58, [202,  50,  84]],
    [0.78, [244,  88, 124]],
    [0.92, [255, 140, 184]],
    [1.00, [255, 186, 214]]
  ];
  const COLD = [
    [0.00, [  3,   3,  10]],
    [0.22, [ 17,  19,  52]],
    [0.46, [ 40,  46, 124]],
    [0.70, [ 78,  98, 206]],
    [0.88, [140, 172, 246]],
    [1.00, [214, 232, 255]]
  ];

  function sample(stops, v) {
    v = BW.clamp(v, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const k = (v - a[0]) / (b[0] - a[0] || 1);
        return [
          a[1][0] + (b[1][0] - a[1][0]) * k,
          a[1][1] + (b[1][1] - a[1][1]) * k,
          a[1][2] + (b[1][2] - a[1][2]) * k
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  /* Precomputed so the render loop never builds a colour string. */
  BW.LEVELS = 64;
  function lut(stops) {
    const out = new Array(BW.LEVELS);
    for (let i = 0; i < BW.LEVELS; i++) {
      const c = sample(stops, i / (BW.LEVELS - 1));
      out[i] = "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")";
    }
    return out;
  }
  BW.LUT_WARM = lut(WARM);
  BW.LUT_COLD = lut(COLD);

  BW.level = function (v) {
    const i = (BW.clamp(v, 0, 1) * (BW.LEVELS - 1)) | 0;
    return i;
  };
})();
