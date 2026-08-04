// モード①「一問一答！九九チャレンジ」の進行ロジックと結果画面
// ─────────────────────────────────────────────────────────────
// 1問の流れ
//   問題表示 → タイマー開始 → 数字を入力 →「けってい」
//     正解     ◯を出して 0.8秒後につぎへ
//     まちがい ×と正しいこたえを出す →「正しいこたえを もう一度入力」→「わかった！」でつぎへ
//     じかんぎれ 同上
//   ※ 正しいこたえを自分で入力させるのは、読むだけより定着するため。
//   ※ 九九マスターへの挑戦だけは、まちがえた時点で結果画面へ進む。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';
import * as sounds from './sounds.js';
import * as mastery from './mastery.js';
import { createQuestionTimer } from './timer.js';
import { createKeypad } from './keypad.js';
import { buildQuestions } from './questions.js';
import { confirmDialog } from './dialog.js';
import { CORRECT_PAUSE_MS, MASTER_FAIL_PAUSE_MS, FAST_LATENCY_MS } from './constants.js';

/** ×を出しておく時間（このあと消して、問題の数字を読めるようにする） */
const JUDGE_FLASH_MS = 700;

const $ = (id) => document.getElementById(id);

let el = {};        // DOM参照のまとめ
let keypad = null;
let timer = null;
let cb = {};        // main.js から受けとるコールバック
let st = null;      // 進行中のセッションの状態
let pendingTimer = null; // つぎの問題へ進むための setTimeout

// ── 初期化 ──────────────────────────────────────────────────

/**
 * @param {object} callbacks
 *   showScreen(name) / onHome() / onLevelSelect() / onQuit()
 */
export function initQuiz(callbacks) {
  cb = callbacks;

  el = {
    barWrap: $('time-bar-wrap'),
    bar: $('time-bar'),
    levelLabel: $('play-level'),
    progress: $('play-progress'),
    streak: $('play-streak'),
    quit: $('play-quit'),
    qa: $('q-a'),
    qb: $('q-b'),
    answerBox: $('answer-box'),
    judge: $('judge-mark'),
    retry: $('retry-panel'),
    retryTitle: $('retry-title'),
    retryAnswer: $('retry-answer'),
    retryHint: $('retry-hint'),
    understood: $('btn-understood'),
    // 結果画面
    rTitle: $('result-title'),
    rScore: $('result-score'),
    rTime: $('result-time'),
    rExtra: $('result-extra'),
    rHall: $('result-hall'),
    rAlmostBox: $('result-almost-box'),
    rAlmost: $('result-almost'),
    rWrongBox: $('result-wrong-box'),
    rWrong: $('result-wrong'),
    rAgain: $('btn-again'),
  };

  timer = createQuestionTimer({
    onTick: (ratio) => { el.bar.style.transform = `scaleX(${Math.max(0, ratio)})`; },
    onTimeout: handleTimeout,
  });

  keypad = createKeypad($('keypad'), {
    onDigit: handleDigit,
    onDelete: handleDelete,
    onEnter: handleEnter,
  });

  el.understood.addEventListener('click', () => {
    if (st && st.phase === 'retry-done') nextQuestion();
  });

  el.quit.addEventListener('click', async () => {
    // 計測中に たずねるので、答えるあいだは時間を止めておく
    timer.pause();
    const ok = await confirmDialog({
      title: 'とちゅうで やめる？',
      message: 'いままでの きろくは のこりません',
      okLabel: 'やめる', cancelLabel: 'つづける', danger: true,
    });
    if (ok) {
      abort();
      cb.onQuit();
    } else {
      timer.resume();
    }
  });

  el.rAgain.addEventListener('click', () => {
    if (!st) return;
    startQuiz({ level: st.level, dans: st.dans, profileId: st.profileId, settings: st.settings });
  });
}

// ── セッションの開始 ────────────────────────────────────────

/**
 * @param {object} p
 *   level     LEVELS の要素
 *   dans      選んだ段（全段なら null）
 *   profileId
 *   settings  { timeLimitSec, muted }
 */
export async function startQuiz({ level, dans, profileId, settings }) {
  clearPending();
  st = {
    level,
    dans: level.dansRequired === 0 ? null : (dans || []).slice(),
    profileId,
    settings,
    limitMs: level.timed ? settings.timeLimitSec * 1000 : null,
    questions: buildQuestions(level, dans),
    index: 0,
    input: '',
    phase: 'answer',
    results: [],
    correctCount: 0,
    streak: 0,
    maxStreak: 0,
  };

  el.levelLabel.textContent = level.label;
  el.barWrap.hidden = !level.timed;
  el.streak.hidden = !level.streak;

  cb.showScreen('play');
  renderQuestion();
}

/** 途中でやめたとき。記録は残さない */
export function abortQuiz() { abort(); }

function abort() {
  clearPending();
  if (timer) timer.stop();
  st = null;
}

function clearPending() {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
}

// ── 一時停止（画面が縦向きになったとき） ────────────────────

export function pauseQuiz() { if (st && timer) timer.pause(); }
export function resumeQuiz() { if (st && timer) timer.resume(); }

// ── 1問の表示 ───────────────────────────────────────────────

function currentQuestion() { return st.questions[st.index]; }
function correctAnswer() { const q = currentQuestion(); return q.a * q.b; }

function renderQuestion() {
  const q = currentQuestion();
  st.input = '';
  st.phase = 'answer';

  el.qa.textContent = q.a;
  el.qb.textContent = q.b;
  el.progress.textContent = `${st.index + 1} / ${st.questions.length}もん`;
  if (st.level.streak) el.streak.textContent = `れんぞく ${st.streak}もん`;

  el.judge.hidden = true;
  el.judge.className = 'judge-mark';
  el.retry.hidden = true;
  el.understood.hidden = true;
  updateAnswerBox();

  keypad.setEnabled(true);
  el.bar.style.transform = 'scaleX(1)';
  el.bar.classList.toggle('is-running', st.level.timed);

  // 問題が見えた瞬間から計測を始める
  timer.start(st.limitMs);
}

function updateAnswerBox() {
  el.answerBox.textContent = st.input === '' ? '?' : st.input;
  el.answerBox.classList.toggle('is-empty', st.input === '');
  keypad.setEnterEnabled(st.input !== '');
}

// ── 入力 ────────────────────────────────────────────────────

function handleDigit(n) {
  if (!st) return;
  if (st.phase !== 'answer' && st.phase !== 'retry') return;
  if (st.input.length >= 2) return;              // 入力欄は最大2桁
  if (st.input === '' && n === 0) return;        // 先頭の0は入れない
  if (st.phase === 'answer') timer.markInput();  // 最初の1回だけ latency が確定する
  st.input += String(n);
  sounds.playTap();
  updateAnswerBox();
}

function handleDelete() {
  if (!st) return;
  if (st.phase !== 'answer' && st.phase !== 'retry') return;
  st.input = st.input.slice(0, -1);
  updateAnswerBox();
}

function handleEnter() {
  if (!st) return;
  if (st.input === '') return;

  if (st.phase === 'answer') {
    judgeFirstAnswer();
  } else if (st.phase === 'retry') {
    judgeRetryAnswer();
  }
}

// ── 判定 ────────────────────────────────────────────────────

/** 1回目の解答 */
function judgeFirstAnswer() {
  const { latencyMs, totalMs } = timer.stop();
  const given = Number(st.input);
  const correct = given === correctAnswer();

  recordAttempt({ given, correct, timedOut: false, latencyMs, totalMs });

  if (correct) {
    showJudge('correct');
    sounds.playCorrect();
    st.phase = 'reveal';
    keypad.setEnabled(false);
    pendingTimer = setTimeout(nextQuestion, CORRECT_PAUSE_MS);
  } else {
    sounds.playWrong();
    handleFailure('まちがい');
  }
}

/** 時間切れ（タイマーが自分で気づいて呼ぶ） */
function handleTimeout() {
  if (!st || st.phase !== 'answer') return;
  const { latencyMs, totalMs } = timer.stop();
  // 入力とちゅうでも打ち切る。何と答えようとしたかは残さない仕様（given は null）
  recordAttempt({ given: null, correct: false, timedOut: true, latencyMs, totalMs });
  sounds.playTimeUp();
  handleFailure('じかんぎれ');
}

/**
 * まちがい・じかんぎれの共通処理。
 * まず × を ひとめ見せて、そのあとに 正しいこたえを出す。
 */
function handleFailure(titleText) {
  showJudge('wrong');
  st.phase = 'reveal';
  keypad.setEnabled(false);

  pendingTimer = setTimeout(() => {
    if (!st) return;
    el.judge.hidden = true;

    if (st.level.stopOnFail) {
      // 九九マスターへの挑戦は、正しいこたえを見せてから結果画面へ
      showAnswerPanel(titleText, false);
      pendingTimer = setTimeout(() => { finish(); }, MASTER_FAIL_PAUSE_MS);
      return;
    }

    // 正しいこたえを自分で入力してもらう
    st.phase = 'retry';
    st.input = '';
    updateAnswerBox();
    showAnswerPanel(titleText, true);
    keypad.setEnabled(true);
  }, JUDGE_FLASH_MS);
}

/** 再入力の判定。正解するまで先へ進めない */
function judgeRetryAnswer() {
  if (Number(st.input) === correctAnswer()) {
    st.phase = 'retry-done';
    el.retryTitle.textContent = 'そのとおり！';
    el.retryTitle.className = 'retry-title is-ok';
    el.retryHint.textContent = 'おぼえたね';
    el.understood.hidden = false;
    el.judge.hidden = true;
    keypad.setEnabled(false);
    sounds.playCorrect();
  } else {
    // まちがえたら入力を消して、もう一度うながすだけ
    st.input = '';
    updateAnswerBox();
    el.retryHint.textContent = 'もういちど！';
    el.answerBox.classList.remove('is-shaking');
    void el.answerBox.offsetWidth; // アニメーションをやり直させる
    el.answerBox.classList.add('is-shaking');
    sounds.playWrong();
  }
}

/** ◯ / × の表示 */
function showJudge(kind) {
  el.judge.hidden = false;
  el.judge.className = `judge-mark is-${kind}`;
  el.judge.textContent = kind === 'correct' ? '◯' : '×';
}

/** 正しいこたえのパネルを出す */
function showAnswerPanel(titleText, askRetry) {
  const q = currentQuestion();
  const ans = correctAnswer();
  el.retry.hidden = false;
  el.retryTitle.textContent = titleText;
  el.retryTitle.className = 'retry-title is-ng';
  el.retryAnswer.textContent = `${q.a} × ${q.b} ＝ ${ans}`;
  el.retryHint.textContent = askRetry ? `${ans} を もういちど いれてね` : '';
  el.understood.hidden = true;
}

// ── 記録 ────────────────────────────────────────────────────

function recordAttempt({ given, correct, timedOut, latencyMs, totalMs }) {
  const q = currentQuestion();
  const attempt = {
    ts: Date.now(),
    mode: 'quiz',
    level: st.level.id,
    a: q.a,
    b: q.b,
    given,
    correct,
    timedOut,
    latencyMs,
    totalMs,
  };
  st.results.push(attempt);
  // 再入力ぶんは記録しない（1問＝1レコード）
  storage.saveAttempt(st.profileId, attempt);

  if (correct) {
    st.correctCount++;
    st.streak++;
    if (st.streak > st.maxStreak) st.maxStreak = st.streak;
  } else {
    st.streak = 0;
  }
  if (st.level.streak) el.streak.textContent = `れんぞく ${st.streak}もん`;
}

// ── つぎの問題 / 終了 ───────────────────────────────────────

function nextQuestion() {
  clearPending();
  if (!st) return;
  st.index++;
  if (st.index >= st.questions.length) finish();
  else renderQuestion();
}

async function finish() {
  clearPending();
  if (!st) return;
  keypad.setEnabled(false);
  timer.stop();

  const level = st.level;
  const results = st.results;
  // 「かかった時間」は、こたえるのに使った時間の合計（正答を見ている間は含めない）
  const elapsedMs = results.reduce((sum, r) => sum + (r.totalMs || 0), 0);

  // 今回ぶんを保存する前に、これまでの自己ベストを取っておく
  const past = await storage.getSessions(st.profileId);
  let prevBest = 0;
  if (level.id === 99) {
    prevBest = Math.max(0, ...past
      .filter((s) => s.level === 99 && typeof s.maxStreak === 'number')
      .map((s) => s.maxStreak));
  } else if (level.id === 'master') {
    prevBest = Math.max(0, ...past
      .filter((s) => s.level === 'master' && typeof s.reachedCount === 'number')
      .map((s) => s.reachedCount));
  }

  const session = {
    ts: Date.now(),
    mode: 'quiz',
    level: level.id,
    dans: st.dans,
    total: results.length,
    correctCount: st.correctCount,
    elapsedMs,
  };
  if (level.id === 99) session.maxStreak = st.maxStreak;
  if (level.id === 'master') session.reachedCount = st.correctCount;

  await storage.saveSession(st.profileId, session);

  renderResult({ level, session, results, prevBest });
  cb.showScreen('result');
}

// ── 結果画面 ────────────────────────────────────────────────

/** ミリ秒を「1ぷん 23びょう」の形にする */
function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}ぷん ${s}びょう` : `${s}びょう`;
}

const formatSec = (ms) => `${(ms / 1000).toFixed(1)}びょう`;

function renderResult({ level, session, results, prevBest }) {
  const perfect = session.total > 0 && session.correctCount === session.total;

  el.rTitle.textContent = level.label;
  el.rScore.innerHTML = `<strong>${session.correctCount}</strong> / ${session.total} もん せいかい`;
  el.rTime.textContent = `こたえるのに かかった 時間：${formatDuration(session.elapsedMs)}`;

  // レベルごとの追加表示
  el.rExtra.hidden = true;
  el.rExtra.className = 'result-extra';
  if (level.id === 99) {
    const best = Math.max(prevBest, session.maxStreak);
    const renewed = session.maxStreak > prevBest && session.maxStreak > 0;
    el.rExtra.hidden = false;
    el.rExtra.innerHTML =
      `こんかい：<strong>${session.maxStreak}</strong>もん れんぞく`
      + ` ／ じこベスト：<strong>${best}</strong>もん`
      + (renewed ? ' <span class="badge-new">こうしん！</span>' : '');
  } else if (level.id === 'master') {
    const reached = session.reachedCount;
    const best = Math.max(prevBest, reached);
    const renewed = reached > prevBest && reached > 0;
    el.rExtra.hidden = false;
    el.rExtra.className = 'result-extra is-master';
    const head = perfect
      ? '81もん ぜんぶ せいかい！'
      : `<strong>${reached + 1}</strong>もんめで ざんねん！`;
    el.rExtra.innerHTML =
      `${head}<br>ここまで <strong>${reached}</strong>もん せいかい`
      + ` ／ じこベスト：<strong>${best}</strong>もん`
      + (renewed ? ' <span class="badge-new">こうしん！</span>' : '');
  }

  // 殿堂入り
  const hall = perfect && (level.id === 99 || level.id === 'master');
  el.rHall.hidden = !hall;

  // 「あとちょっと」＝ 正解したが、思い出すのに 1.5秒より かかった問題
  const almost = results.filter(mastery.isSlowCorrect);
  el.rAlmostBox.hidden = almost.length === 0;
  el.rAlmost.innerHTML = almost.map((r) =>
    `<li><span class="q">${r.a} × ${r.b} ＝ ${r.a * r.b}</span>`
    + `<span class="sub">${formatSec(r.latencyMs)}</span></li>`).join('');

  // まちがえた問題（じかんぎれも ここに入れる。データ上は区別して保存ずみ）
  const wrong = results.filter(mastery.isFailure);
  el.rWrongBox.hidden = wrong.length === 0;
  el.rWrong.innerHTML = wrong.map((r) => {
    const sub = r.timedOut ? 'じかんぎれ' : `${r.given} と こたえた`;
    return `<li><span class="q">${r.a} × ${r.b} ＝ ${r.a * r.b}</span>`
      + `<span class="sub">${sub}</span></li>`;
  }).join('');

  if (hall) sounds.playFanfare();
  else sounds.playFinish();
}

/** しきい値を画面に出したいとき用 */
export const SLOW_THRESHOLD_MS = FAST_LATENCY_MS;
