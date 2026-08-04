// モード②「九九マス計算」
// ─────────────────────────────────────────────────────────────
// 100マス計算と同じ形。外がわの見出しの数を手がかりに、
// 左上のマスから 右へ、1行おわったら つぎの行の左はしへ すすむ。
// 答えを入れた時点では 正誤を出さず、ぜんぶ終わってから まとめて色をつける。
//   正解＝青 / まちがい＝赤
//
// 1マスごとに latencyMs（そのマスに来てから 最初のボタンまで）を計るので、
// このモードの結果も そのまま 九九表（ヒートマップ）に集まる。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';
import * as sounds from './sounds.js';
import { createStopwatch } from './timer.js';
import { createKeypad } from './keypad.js';
import { shuffle } from './questions.js';
import { confirmDialog } from './dialog.js';

const $ = (id) => document.getElementById(id);

let el = {};
let keypad = null;
let watch = null;
let cb = {};
let st = null;
let tickTimer = null;

export function initGridMode(callbacks) {
  cb = callbacks;
  el = {
    levelChip: $('grid-level-chip'),
    time: $('grid-time'),
    progress: $('grid-progress'),
    quit: $('grid-quit'),
    table: $('grid-table'),
    foot: $('grid-foot'),
    result: $('grid-result'),
    again: $('grid-again'),
    toLevel: $('grid-to-level'),
    home: $('grid-home'),
  };

  watch = createStopwatch();
  keypad = createKeypad($('grid-keypad'), {
    onDigit: handleDigit,
    onDelete: handleDelete,
    onEnter: handleEnter,
  });

  el.quit.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'とちゅうで やめる？',
      message: 'いままでの きろくは のこりません',
      okLabel: 'やめる', cancelLabel: 'つづける', danger: true,
    });
    if (ok) { abort(); cb.onHome(); }
  });

  el.again.addEventListener('click', () => {
    if (st) startGrid({ level: st.level, profileId: st.profileId });
  });
  el.toLevel.addEventListener('click', () => { abort(); cb.onLevelSelect(); });
  el.home.addEventListener('click', () => { abort(); cb.onHome(); });
}

// ── 開始 ────────────────────────────────────────────────────

export function startGrid({ level, profileId }) {
  stopTick();

  // 外がわの見出しの数をつくる
  const rowVals = level.rowShuffle ? shuffle([1,2,3,4,5,6,7,8,9]) : [1,2,3,4,5,6,7,8,9];
  const colVals = level.colShuffle ? shuffle([1,2,3,4,5,6,7,8,9]) : [1,2,3,4,5,6,7,8,9];

  st = {
    level,
    profileId,
    rowVals,
    colVals,
    order: [],      // 答えるマスの順番 [{r,c,a,b}]
    index: 0,
    input: '',
    records: [],    // 1マスごとの記録
    cellStartMs: 0,
    cellFirstInputMs: null,
    finished: false,
  };

  // 左上から 右へ、1行おわったら つぎの行へ
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      // レベルXでは 1の だん（いちばん上の行）と 1の れつ（いちばん左）は
      // はじめから 埋まっているので、答えるマスから のぞく
      if (level.hideHeaders && (r === 0 || c === 0)) continue;
      st.order.push({ r, c, a: rowVals[r], b: colVals[c] });
    }
  }

  el.levelChip.textContent = level.label;
  el.result.hidden = true;
  el.foot.classList.remove('is-done');

  buildTable();
  keypad.setEnabled(true);
  watch.start();
  startTick();
  activateCell();

  cb.showScreen('grid');
}

export function abortGrid() { abort(); }

function abort() {
  stopTick();
  if (watch) watch.stop();
  st = null;
}

export function pauseGrid() { if (st && !st.finished) watch.pause(); }
export function resumeGrid() { if (st && !st.finished) watch.resume(); }

// ── 経過時間の表示 ──────────────────────────────────────────

function startTick() {
  stopTick();
  paintTime();
  tickTimer = setInterval(paintTime, 200);
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function paintTime() {
  const total = Math.floor(watch.elapsed() / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  el.time.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

// ── 表の組み立て ────────────────────────────────────────────

function buildTable() {
  const { level, rowVals, colVals } = st;
  el.table.innerHTML = '';
  el.table.classList.toggle('is-no-head', level.hideHeaders);
  const frag = document.createDocumentFragment();

  const head = (text, extra = '') => {
    const d = document.createElement('div');
    d.className = `grid-head ${extra}`.trim();
    d.textContent = text;
    return d;
  };

  frag.appendChild(head(level.hideHeaders ? '' : '×', 'grid-corner'));
  for (let c = 0; c < 9; c++) frag.appendChild(head(level.hideHeaders ? '' : colVals[c]));

  for (let r = 0; r < 9; r++) {
    frag.appendChild(head(level.hideHeaders ? '' : rowVals[r]));
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      // レベルXは 1の だんと 1の れつが さいしょから 入っている
      if (level.hideHeaders && (r === 0 || c === 0)) {
        cell.classList.add('is-given');
        cell.textContent = rowVals[r] * colVals[c];
      }
      frag.appendChild(cell);
    }
  }
  el.table.appendChild(frag);
}

function cellEl(r, c) {
  return el.table.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
}

// ── マスの進行 ──────────────────────────────────────────────

function currentSpot() { return st.order[st.index]; }

function activateCell() {
  const spot = currentSpot();
  st.input = '';
  st.cellStartMs = watch.elapsed();
  st.cellFirstInputMs = null;

  for (const c of el.table.querySelectorAll('.is-current')) c.classList.remove('is-current');
  const cell = cellEl(spot.r, spot.c);
  cell.classList.add('is-current');
  cell.textContent = '';

  el.progress.textContent = `${st.index + 1} / ${st.order.length}もん`;
  keypad.setEnterEnabled(false);
}

function handleDigit(n) {
  if (!st || st.finished) return;
  if (st.input.length >= 2) return;
  if (st.input === '' && n === 0) return;
  if (st.cellFirstInputMs === null) st.cellFirstInputMs = watch.elapsed();
  st.input += String(n);
  paintCurrentCell();
  sounds.playTap();
}

function handleDelete() {
  if (!st || st.finished) return;
  // 「けす」は いま入力中のマスだけを消す
  st.input = st.input.slice(0, -1);
  paintCurrentCell();
}

function paintCurrentCell() {
  const spot = currentSpot();
  cellEl(spot.r, spot.c).textContent = st.input;
  keypad.setEnterEnabled(st.input !== '');
}

function handleEnter() {
  if (!st || st.finished || st.input === '') return;

  const spot = currentSpot();
  const nowMs = watch.elapsed();
  st.records.push({
    ts: Date.now(),
    mode: 'grid',
    level: st.level.id,
    a: spot.a,
    b: spot.b,
    given: Number(st.input),
    correct: Number(st.input) === spot.a * spot.b,
    timedOut: false,
    latencyMs: st.cellFirstInputMs === null ? null : Math.round(st.cellFirstInputMs - st.cellStartMs),
    totalMs: Math.round(nowMs - st.cellStartMs),
    r: spot.r,
    c: spot.c,
  });

  st.index++;
  if (st.index >= st.order.length) finish();
  else activateCell();
}

// ── 終わり ──────────────────────────────────────────────────

async function finish() {
  st.finished = true;
  stopTick();
  const elapsedMs = Math.round(watch.stop());
  paintTime();
  keypad.setEnabled(false);

  for (const c of el.table.querySelectorAll('.is-current')) c.classList.remove('is-current');

  // ここではじめて 正誤の色をつける
  let correctCount = 0;
  for (const rec of st.records) {
    const cell = cellEl(rec.r, rec.c);
    cell.classList.add(rec.correct ? 'is-correct' : 'is-wrong');
    if (rec.correct) correctCount++;
    // 表には 正しいこたえを のこす（まちがえた分は 小さく 入力を そえる）
    if (!rec.correct) {
      cell.innerHTML = `<span class="cell-answer">${rec.a * rec.b}</span>`
        + `<span class="cell-given">${rec.given}</span>`;
    }
  }

  // 記録を保存する（rとcは 画面のための情報なので のぞく）
  for (const rec of st.records) {
    const { r, c, ...attempt } = rec;
    await storage.saveAttempt(st.profileId, attempt);
  }
  await storage.saveSession(st.profileId, {
    ts: Date.now(),
    mode: 'grid',
    level: st.level.id,
    dans: null,
    total: st.records.length,
    correctCount,
    elapsedMs,
  });

  const total = Math.floor(elapsedMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  el.result.innerHTML =
    `<strong>${correctCount}</strong> / ${st.records.length} もん せいかい`
    + `　かかった 時間 <strong>${m > 0 ? `${m}ぷん ` : ''}${s}びょう</strong>`;
  el.result.hidden = false;
  el.foot.classList.add('is-done');

  if (correctCount === st.records.length) sounds.playFanfare();
  else sounds.playFinish();
}
