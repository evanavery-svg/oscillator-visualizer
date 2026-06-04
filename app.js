/* Oscillator Visualizer
 * Client-side psychedelic audio visualizer.
 * Web Audio API drives a Canvas 2D renderer. Nothing is uploaded anywhere —
 * the File is read locally via an object URL.
 */
(() => {
  "use strict";

  // ---- DOM ----
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const dropHint = document.getElementById("dropHint");
  const ui = document.getElementById("ui");
  const fileInput = document.getElementById("fileInput");
  const audio = document.getElementById("audio");
  const playBtn = document.getElementById("playBtn");
  const seek = document.getElementById("seek");
  const timeLabel = document.getElementById("time");
  const nowPlaying = document.getElementById("nowPlaying");
  const modeSel = document.getElementById("mode");
  const sensitivityInput = document.getElementById("sensitivity");
  const trailsInput = document.getElementById("trails");
  const colorSpeedInput = document.getElementById("colorSpeed");
  const newFileBtn = document.getElementById("newFileBtn");
  const fsBtn = document.getElementById("fsBtn");

  // ---- Audio graph (created lazily on first user gesture) ----
  let audioCtx = null;
  let analyser = null;
  let freqData = null; // Uint8Array of frequency magnitudes
  let timeData = null; // Uint8Array of waveform
  let currentUrl = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
  }

  // ---- File loading ----
  function loadFile(file) {
    if (!file) return;
    initAudio();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(file);
    audio.src = currentUrl;
    nowPlaying.textContent = "♪  " + file.name;
    dropHint.classList.add("hidden");
    ui.classList.remove("hidden");
    audio.play().then(() => { if (audioCtx.state === "suspended") audioCtx.resume(); })
      .catch(() => {/* user can press play */});
  }

  fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
  dropHint.addEventListener("click", () => fileInput.click());
  newFileBtn.addEventListener("click", () => fileInput.click());

  // Drag & drop anywhere
  ["dragenter", "dragover"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      e.preventDefault();
      if (!dropHint.classList.contains("hidden")) dropHint.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      e.preventDefault();
      dropHint.classList.remove("dragover");
    })
  );
  window.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // ---- Transport ----
  playBtn.addEventListener("click", () => {
    if (!audio.src) { fileInput.click(); return; }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (audio.paused) audio.play(); else audio.pause();
  });
  audio.addEventListener("play", () => { playBtn.textContent = "❚❚"; });
  audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });

  function fmt(t) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
      if (!seeking) seek.value = String((audio.currentTime / audio.duration) * 1000);
      timeLabel.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
    }
  });
  let seeking = false;
  seek.addEventListener("input", () => { seeking = true; });
  seek.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    seeking = false;
  });

  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Auto-hide UI when idle
  let idleTimer = null;
  function poke() {
    ui.classList.remove("idle");
    document.body.style.cursor = "default";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!audio.paused) {
        ui.classList.add("idle");
        document.body.style.cursor = "none";
      }
    }, 3200);
  }
  window.addEventListener("mousemove", poke);
  window.addEventListener("touchstart", poke, { passive: true });

  // ---- Canvas sizing ----
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.fillStyle = "#05050a";
    ctx.fillRect(0, 0, W, H);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Audio feature extraction ----
  // Smoothed energy in three bands plus an overall beat detector.
  let bass = 0, mid = 0, treble = 0, energy = 0;
  let beat = 0; // decays after each detected onset
  let energyAvg = 0;

  function analyze() {
    if (!analyser) return;
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    const n = freqData.length;
    const bassEnd = Math.floor(n * 0.06);
    const midEnd = Math.floor(n * 0.30);

    let b = 0, m = 0, t = 0;
    for (let i = 0; i < bassEnd; i++) b += freqData[i];
    for (let i = bassEnd; i < midEnd; i++) m += freqData[i];
    for (let i = midEnd; i < n; i++) t += freqData[i];
    b /= (bassEnd * 255);
    m /= ((midEnd - bassEnd) * 255);
    t /= ((n - midEnd) * 255);

    // smooth
    bass += (b - bass) * 0.35;
    mid += (m - mid) * 0.35;
    treble += (t - treble) * 0.4;
    const e = bass * 1.4 + mid + treble * 0.7;
    energy += (e - energy) * 0.3;

    // simple beat detection on bass energy
    energyAvg += (bass - energyAvg) * 0.04;
    if (bass > energyAvg * 1.35 && bass > 0.18) beat = 1;
    beat *= 0.90;
  }

  // ---- Color helpers ----
  function hsl(h, s, l, a) {
    return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a == null ? 1 : a})`;
  }

  // ---- Renderer ----
  let hueBase = 200;
  let t = 0;
  let rot = 0;

  function fade(alpha) {
    // Translucent black overlay -> motion trails
    ctx.fillStyle = `rgba(5, 5, 10, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawKaleido(sens) {
    const cx = W / 2, cy = H / 2;
    const slices = 10;
    const R = Math.min(W, H) * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    const n = freqData.length;
    for (let s = 0; s < slices; s++) {
      ctx.save();
      ctx.rotate((s / slices) * Math.PI * 2 + rot);
      if (s % 2) ctx.scale(1, -1);
      ctx.beginPath();
      for (let i = 0; i < n; i += 6) {
        const v = (freqData[i] / 255) * sens;
        const ang = (i / n) * (Math.PI / slices);
        const rad = (i / n) * R * 0.4 + v * R * 0.5;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.5 + beat * 3;
      ctx.strokeStyle = hsl(hueBase + s * 14 + treble * 120, 90, 55 + beat * 15, 0.55);
      ctx.stroke();
      ctx.restore();
    }
    // pulsing core
    const cr = (0.04 + bass * 0.22) * Math.min(W, H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
    g.addColorStop(0, hsl(hueBase + 60, 100, 70, 0.9));
    g.addColorStop(1, hsl(hueBase + 60, 100, 50, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTunnel(sens) {
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    const rings = 26;
    const maxR = Math.hypot(W, H) * 0.55;
    for (let r = rings; r > 0; r--) {
      const z = ((r + (t * 6) % 1) / rings);
      const radius = z * z * maxR;
      const bandIdx = Math.floor((1 - z) * freqData.length);
      const v = (freqData[bandIdx] / 255) * sens;
      const wob = v * 40;
      ctx.beginPath();
      const seg = 48;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const rr = radius + Math.sin(a * 6 + t * 4 + r) * wob;
        const x = Math.cos(a + rot) * rr;
        const y = Math.sin(a + rot) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = 1 + z * 3 + beat * 2;
      ctx.strokeStyle = hsl(hueBase + r * 8 + z * 120, 85, 30 + z * 45, 0.5 * z + 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBloom(sens) {
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * 0.5);
    ctx.globalCompositeOperation = "lighter";
    const n = freqData.length;
    const petals = 220;
    const base = Math.min(W, H) * 0.10;
    for (let i = 0; i < petals; i++) {
      const idx = Math.floor((i / petals) * n);
      const v = (freqData[idx] / 255) * sens;
      const a = (i / petals) * Math.PI * 2 * 5; // spiral
      const rad = base + i * (Math.min(W, H) * 0.0016) + v * Math.min(W, H) * 0.28;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      const size = 1 + v * 14 + beat * 4;
      ctx.fillStyle = hsl(hueBase + i * 1.5 + v * 90, 95, 45 + v * 40, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWaves(sens) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const layers = 4;
    const n = timeData.length;
    for (let L = 0; L < layers; L++) {
      ctx.beginPath();
      const yBase = H * (0.3 + L * 0.13);
      const amp = (H * 0.12) * sens * (1 + bass);
      for (let i = 0; i < n; i += 2) {
        const x = (i / n) * W;
        const wave = (timeData[i] - 128) / 128;
        const y = yBase + wave * amp + Math.sin(i * 0.01 + t * 2 + L) * 20 * (1 + mid);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2 + beat * 4;
      ctx.strokeStyle = hsl(hueBase + L * 40 + treble * 100, 90, 55, 0.55);
      ctx.shadowBlur = 18;
      ctx.shadowColor = hsl(hueBase + L * 40, 90, 60, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  const renderers = {
    kaleido: drawKaleido,
    tunnel: drawTunnel,
    bloom: drawBloom,
    waves: drawWaves,
  };

  // ---- Main loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    analyze();

    const sens = parseFloat(sensitivityInput.value);
    const trail = parseFloat(trailsInput.value);
    const colorSpeed = parseFloat(colorSpeedInput.value);

    hueBase += (colorSpeed * 12 + treble * 40 + beat * 30) * dt;
    rot += (0.15 + bass * 1.2 + beat * 0.6) * dt;

    fade(trail);
    const fn = renderers[modeSel.value] || drawKaleido;
    fn(sens);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Keyboard: space = play/pause, F = fullscreen
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); playBtn.click(); }
    else if (e.key === "f" || e.key === "F") fsBtn.click();
  });
})();
