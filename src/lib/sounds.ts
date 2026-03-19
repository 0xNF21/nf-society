// Web Audio API — sons proceduraux pour les ouvertures de lootbox

let _ctx: AudioContext | null = null;
let _muted = false;

export function setSoundMuted(muted: boolean) { _muted = muted; }
export function isSoundMuted() { return _muted; }

function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

function note(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.25
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(ctx: AudioContext, start: number, duration: number, volume = 0.12) {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(start);
}

/** Son de défilement — démarre vite puis ralentit sur ~6s */
export function playRollingSound() {
  if (_muted) return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Whoosh en bruit blanc filtré — naturel, pas robotique
    const whooshDuration = 2.2;
    const whooshSize = Math.ceil(ctx.sampleRate * whooshDuration);
    const whooshBuf = ctx.createBuffer(1, whooshSize, ctx.sampleRate);
    const whooshData = whooshBuf.getChannelData(0);
    for (let i = 0; i < whooshSize; i++) {
      whooshData[i] = Math.random() * 2 - 1;
    }
    const whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = whooshBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + whooshDuration);
    filter.Q.value = 1.5;
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, now);
    whooshGain.gain.linearRampToValueAtTime(0.22, now + 0.1);
    whooshGain.gain.setValueAtTime(0.22, now + 1.4);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + whooshDuration);
    whooshSrc.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(ctx.destination);
    whooshSrc.start(now);
    whooshSrc.stop(now + whooshDuration + 0.05);

    // Clics rapides au début (0→1.5s), qui s'espacent progressivement
    const totalDuration = 6.0;
    let t = 0;
    let interval = 0.04; // intervalle initial très court
    while (t < totalDuration) {
      noise(ctx, now + t, 0.03, Math.max(0.04, 0.09 - t * 0.008));
      // l'intervalle grandit → simulation du ralentissement
      interval = 0.04 + t * 0.06;
      t += interval;
    }
  } catch {}
}

/** Son de révélation selon le tier */
export function playRevealSound(tier: {
  isJackpot: boolean;
  isLegendary: boolean;
  isMega: boolean;
  isRare: boolean;
}) {
  if (_muted) return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    if (tier.isJackpot) {
      // JACKPOT — boom grave + fanfare ascendante + étincelles
      const boom = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boom.connect(boomGain); boomGain.connect(ctx.destination);
      boom.type = "sine";
      boom.frequency.setValueAtTime(70, now);
      boom.frequency.exponentialRampToValueAtTime(30, now + 0.6);
      boomGain.gain.setValueAtTime(0.55, now);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      boom.start(now); boom.stop(now + 0.65);
      // Fanfare
      [261, 329, 392, 523, 659, 784].forEach((f, i) => {
        note(ctx, f, now + 0.05 + i * 0.09, 0.5, "square", 0.13);
      });
      // Étincelles aiguës
      [1046, 1318, 1568, 2093].forEach((f, i) => {
        note(ctx, f, now + 0.6 + i * 0.07, 0.35, "sine", 0.09);
      });
      noise(ctx, now, 0.2, 0.18);

    } else if (tier.isLegendary) {
      // LEGENDARY — arpège dramatique
      [220, 277, 330, 440, 554].forEach((f, i) => {
        note(ctx, f, now + i * 0.11, 0.7, "sine", 0.22);
      });
      note(ctx, 880, now + 0.55, 1.0, "sine", 0.14);
      noise(ctx, now, 0.12, 0.1);

    } else if (tier.isMega) {
      // MEGA — accord montant + reverb court
      [392, 494, 587].forEach((f, i) => {
        note(ctx, f, now + i * 0.09, 0.6, "sine", 0.2);
      });
      note(ctx, 784, now + 0.3, 0.7, "sine", 0.12);

    } else if (tier.isRare) {
      // RARE — deux notes cristallines
      note(ctx, 523, now, 0.5, "sine", 0.2);
      note(ctx, 659, now + 0.12, 0.6, "sine", 0.18);
      note(ctx, 784, now + 0.28, 0.4, "sine", 0.1);

    } else {
      // COMMON — pop sourd
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.18);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now); osc.stop(now + 0.25);
    }
  } catch {}
}
