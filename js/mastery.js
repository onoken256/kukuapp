// 習得状況の判定
// ─────────────────────────────────────────────────────────────
// attempt の配列（＝どのモードの記録でもよい）から、
// その問題が「みちょうせん／にがて／あとちょっと／できた」の
// どれなのかを決める。描画からは切り離してある。
//
// ・ヒートマップ（heatmap.js）
// ・結果画面の「あとちょっと」判定（quiz.js）
// ・将来の にがて優先出題（Leitner）
// がすべてここを呼ぶ。
// ─────────────────────────────────────────────────────────────

import { MASTERY_WINDOW, FAST_LATENCY_MS } from './constants.js';

/** 習得状況の4状態 */
export const STATE = {
  UNTRIED: 'untried',  // みちょうせん（グレー）
  WEAK: 'weak',        // にがて（赤）
  ALMOST: 'almost',    // あとちょっと（黄）
  GOOD: 'good',        // できた（青）
};

export const STATE_LABEL = {
  [STATE.UNTRIED]: 'みちょうせん',
  [STATE.WEAK]: 'にがて',
  [STATE.ALMOST]: 'あとちょっと',
  [STATE.GOOD]: 'できた',
};

/** 中央値。数値がなければ null */
export function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((p, q) => p - q);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** その1問が「しくじり」だったか（誤答 または 時間切れ） */
export function isFailure(attempt) {
  return !attempt.correct || attempt.timedOut === true;
}

/** 正解はしたが、思い出すのに時間がかかったか */
export function isSlowCorrect(attempt) {
  return attempt.correct
    && !attempt.timedOut
    && typeof attempt.latencyMs === 'number'
    && attempt.latencyMs > FAST_LATENCY_MS;
}

/**
 * ある1問（a×b）の習得状況を判定する。
 * @param {Array} attemptsNewestFirst その問題の記録。**新しい順**であること。
 *   （storage.getAttempts はこの順で返す）
 * @returns {string} STATE のいずれか
 */
export function judge(attemptsNewestFirst) {
  const recent = (attemptsNewestFirst || []).slice(0, MASTERY_WINDOW);
  if (recent.length === 0) return STATE.UNTRIED;

  const failures = recent.filter(isFailure).length;
  if (failures >= 2) return STATE.WEAK;
  if (failures === 1) return STATE.ALMOST;

  // ここまで来たら直近ぶんはすべて正解。あとは想起時間の中央値で分ける。
  const m = median(recent.map((x) => x.latencyMs));
  if (m === null) return STATE.ALMOST; // 時間が取れていない＝速さを保証できない
  return m > FAST_LATENCY_MS ? STATE.ALMOST : STATE.GOOD;
}

/** 問題キー（"6,7"） */
export const keyOf = (a, b) => `${a},${b}`;

/**
 * attempt の配列を 81問ぶんに仕分けする。
 * @param {Array} attemptsNewestFirst すべての記録（新しい順）
 * @returns {Map<string, Array>} "a,b" → その問題の記録（新しい順）
 */
export function groupByQuestion(attemptsNewestFirst) {
  const map = new Map();
  for (const at of attemptsNewestFirst || []) {
    if (!(at.a >= 1 && at.a <= 9 && at.b >= 1 && at.b <= 9)) continue;
    const k = keyOf(at.a, at.b);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(at);
  }
  return map;
}

/**
 * 81問ぶんの習得状況をまとめて出す。
 * @returns {{ states: Map<string,string>, counts: object }}
 */
export function buildMasteryMap(attemptsNewestFirst) {
  const grouped = groupByQuestion(attemptsNewestFirst);
  const states = new Map();
  const counts = { [STATE.UNTRIED]: 0, [STATE.WEAK]: 0, [STATE.ALMOST]: 0, [STATE.GOOD]: 0 };
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      const k = keyOf(a, b);
      const s = judge(grouped.get(k));
      states.set(k, s);
      counts[s]++;
    }
  }
  return { states, counts, grouped };
}
