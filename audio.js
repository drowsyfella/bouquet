// Web Audio chime + rustle. Everything synthesized, no files.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let lastRustle = 0;
let rustleGain = null;

try { muted = sessionStorage.getItem('bouquet-muted') === '1'; } catch {}

export function unlock() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  // 1 s of white noise, reused for every rustle burst
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  rustleGain = ctx.createGain();
  rustleGain.gain.value = 0;
  rustleGain.connect(master);
}

export const isMuted = () => muted;

export function setMuted(m) {
  muted = m;
  try { sessionStorage.setItem('bouquet-muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}

function tone(freq, start, vol, dur) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o2.type = 'sine';
  o.frequency.value = freq;
  o2.frequency.value = freq * 2.01; // faint bell overtone
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(master);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.start(start); o2.start(start);
  o.stop(start + dur + 0.05); o2.stop(start + dur + 0.05);
}

// Soft two-note chime. pitch > 1 shifts higher, vol scales loudness.
export function chime(pitch = 1, vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  tone(659.25 * pitch, t, 0.09 * vol, 1.6);        // E5
  tone(987.77 * pitch, t + 0.16, 0.07 * vol, 2.0); // B5
}

// Called on pointer move while dragging. speed in px/ms.
export function rustle(speed) {
  if (!ctx || muted) return;
  const now = performance.now();
  if (now - lastRustle < 120) return;
  lastRustle = now;

  const t = ctx.currentTime;
  const vol = Math.min(0.05, 0.008 + speed * 0.03);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500 + Math.random() * 2500;
  bp.Q.value = 0.9;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(bp).connect(hp).connect(g).connect(rustleGain);
  src.start(t, Math.random() * 0.7, 0.25);

  rustleGain.gain.cancelScheduledValues(t);
  rustleGain.gain.setTargetAtTime(1, t, 0.01);
}

// Fade rustle out ~150 ms after release.
export function rustleStop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  rustleGain.gain.cancelScheduledValues(t);
  rustleGain.gain.setValueAtTime(rustleGain.gain.value, t);
  rustleGain.gain.linearRampToValueAtTime(0, t + 0.15);
}
