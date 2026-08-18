(function () {
  "use strict";
  const BW = window.BW;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wall   = new BW.Wall(document.getElementById("wall"), { reduced });
  const breach = new BW.Breach();
  const sound  = new BW.Sound();
  wall.breach = breach;
  breach.onOpen = () => sound.breach();

  let last = 0, running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    breach.update(t, wall.W, wall.H);
    wall.draw(t, dt);
  }

  const gate = document.getElementById("gate");
  async function open() {
    const ok = await sound.start();
    if (ok) gate.classList.remove("open");
    return ok;
  }
  gate.addEventListener("click", open);
  gate.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });

  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => wall.resize(), 120);
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = performance.now() / 1000; requestAnimationFrame(frame); }
  });

  requestAnimationFrame(frame);
  open().then(ok => { if (!ok) gate.classList.add("open"); });
})();
