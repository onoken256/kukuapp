// 効果音
// ─────────────────────────────────────────────────────────────
// Web Audio API で短い音をその場で作る。音声ファイルは使わない。
// iOS では最初のユーザー操作まで音が出せないので、
// AudioContext は最初のタップのときに初期化する（initAudio）。
// ─────────────────────────────────────────────────────────────

let ctx = null;
let muted = false;

/** 最初のタップで呼ぶ。2回目以降は何もしない（止まっていたら再開する） */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {
    console.warn('[sounds] おとを つかえません', e);
  }
}

export function setMuted(value) { muted = !!value; }
export function isMuted() { return muted; }

/**
 * 単音をならす
 * @param {number} freq  高さ(Hz)
 * @param {number} at    いまから何秒後
 * @param {number} dur   長さ(秒)
 * @param {string} type  波形
 * @param {number} peak  音量
 */
function tone(freq, at, dur, type = 'sine', peak = 0.18) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // プツッというノイズが出ないように、音量をなめらかに上げ下げする
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 正解：明るく2音 */
export function playCorrect() {
  tone(880, 0, 0.12, 'sine', 0.2);
  tone(1318.5, 0.09, 0.18, 'sine', 0.18);
}

/** 誤答：低くにぶい音 */
export function playWrong() {
  tone(207.65, 0, 0.18, 'square', 0.1);
  tone(155.56, 0.1, 0.22, 'square', 0.09);
}

/** 時間切れ：下がっていく2音 */
export function playTimeUp() {
  tone(523.25, 0, 0.14, 'triangle', 0.14);
  tone(349.23, 0.12, 0.26, 'triangle', 0.13);
}

/** 数字ボタンを押したときの小さな音 */
export function playTap() {
  tone(1046.5, 0, 0.035, 'sine', 0.06);
}

/** 全問正解などのお祝い */
export function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.16));
  tone(1318.5, 0.46, 0.5, 'triangle', 0.16);
}

/** セッションの終わり（ふつう） */
export function playFinish() {
  tone(659.25, 0, 0.14, 'sine', 0.15);
  tone(880, 0.12, 0.24, 'sine', 0.15);
}
