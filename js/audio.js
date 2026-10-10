// 効果音(ファイルを使わず、その場で音を作る)
let ctx = null;
let on = true;
try { on = localStorage.getItem('redline-sound') !== 'off'; } catch { /* 保存できなくても動く */ }

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur, type = 'square', vol = 0.06, delay = 0, slide = 0) {
  const a = ac(); if (!a || !on) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.08, delay = 0, freq = 800) {
  const a = ac(); if (!a || !on) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}

export const sfx = {
  click() { tone(660, 0.05, 'square', 0.03); },
  press() { tone(180, 0.12, 'square', 0.06); tone(120, 0.15, 'square', 0.05, 0.05); },
  fax() { for (let i = 0; i < 6; i++) tone(1200 + (i % 2) * 600, 0.08, 'square', 0.025, i * 0.1); noise(0.6, 0.03, 0.6, 2500); },
  good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)); },
  bad() { tone(220, 0.3, 'sawtooth', 0.06); tone(160, 0.4, 'sawtooth', 0.06, 0.18); },
  card(ok) { tone(ok === 'S' ? 880 : ok === 'm' ? 440 : 160, 0.14, ok === 'M' ? 'sawtooth' : 'triangle', 0.07); },
  launch() { noise(3.0, 0.12, 0, 300); tone(60, 2.5, 'sawtooth', 0.04, 0, 40); },
  boom() { noise(1.2, 0.2, 0, 500); tone(80, 0.8, 'sawtooth', 0.08, 0, -40); },
};
export function soundOn() { return on; }
export function toggleSound() {
  on = !on;
  try { localStorage.setItem('redline-sound', on ? 'on' : 'off'); } catch { /* 無視 */ }
  return on;
}
