// モード③「九九ならべ」
// ─────────────────────────────────────────────────────────────
// えらんだ だんの こたえカードが 下に ばらばらに ならぶ。
// それを 正しい じゅんばんに ならべて「けってい」。
//
// カードを タップすると いちばん左の あいている ばしょに 入る。
// 入れたカードを もう一度 タップすると 下に もどる。
// （小さい子でも 1タップで すすめられるようにしている）
//
// 2つのモードがある。
// ・入門：こたえの9まいだけ。カードは なんかいでも つかえる（同じ数字を くり返し入れてもよい）
// ・練習：こたえ9まい＋にせもの（近い数字）9まい＝18まい。カードは 1回きり（入れたら 消え、もどすと また使える）
//
// このモードは「思い出す速さ」が はかれないので、
// 九九表（ヒートマップ）には 反映しない。セッション記録だけ のこす。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';
import * as sounds from './sounds.js';
import { createStopwatch } from './timer.js';
import { shuffle } from './questions.js';
import { confirmDialog } from './dialog.js';

const $ = (id) => document.getElementById(id);

let el = {};
let watch = null;
let cb = {};
let st = null;
let tickTimer = null;

const MODE_LABEL = { nyumon: 'にゅうもん', renshu: 'れんしゅう' };

const HINT_TEXT = {
  nyumon: 'したの カードを タップすると じゅんに 入るよ。おなじ カードを なんかいも つかえるよ。<br>入れた ところを タップすると もどるよ。',
  renshu: 'にた 数字の カードが まざっているよ。よく見て じゅんばんに 入れてね。<br>入れた カードを タップすると もどるよ。',
};

export function initSortMode(callbacks) {
  cb = callbacks;
  el = {
    danChip: $('sort-dan-chip'),
    time: $('sort-time'),
    quit: $('sort-quit'),
    slots: $('sort-slots'),
    tray: $('sort-tray'),
    hint: document.querySelector('.sort-hint'),
    enter: $('sort-enter'),
    result: $('sort-result'),
    again: $('sort-again'),
    toDan: $('sort-to-dan'),
    home: $('sort-home'),
  };

  watch = createStopwatch();

  el.enter.addEventListener('click', judge);
  el.quit.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'とちゅうで やめる？',
      message: 'いままでの きろくは のこりません',
      okLabel: 'やめる', cancelLabel: 'つづける', danger: true,
    });
    if (ok) { abort(); cb.onHome(); }
  });

  el.again.addEventListener('click', () => {
    if (st) startSort({ dan: st.dan, profileId: st.profileId, mode: st.mode });
  });
  el.toDan.addEventListener('click', () => { abort(); cb.onDanSelect(); });
  el.home.addEventListener('click', () => { abort(); cb.onHome(); });
}

// ── ダミーカード（練習モード） ──────────────────────────────
// だんごとに 近い数字を まぜる。九九のこたえと 重複しないように注意。

const DAN9_POOL = [16, 17, 19, 21, 24, 26, 29, 32, 35, 37, 38, 40, 47, 49, 50, 51, 56, 58, 60, 62, 64, 70, 74, 77, 80, 87];
const FORCED_ALL = { 4: [21, 27] };
const FORCED_ONE_OF = { 6: [21, 27], 7: [24, 27], 8: [21, 27] };
const MAX_BY_DAN = { 2: 18, 3: 29, 4: 39, 5: 49, 6: 59, 7: 69, 8: 79 };

function pickDummyValues(dan, realValues) {
  if (dan === 1) return [10, 11, 12, 13, 14, 15, 16, 17, 18];

  const realSet = new Set(realValues);

  if (dan === 9) {
    const pool = DAN9_POOL.filter((v) => !realSet.has(v));
    return shuffle(pool).slice(0, 9);
  }

  const min = dan === 2 ? 1 : 10; // 3のだん以上は 2桁以上の数字にする
  const max = MAX_BY_DAN[dan];
  let pool = [];
  for (let v = min; v <= max; v++) {
    if (!realSet.has(v)) pool.push(v);
  }

  const chosen = [];
  if (FORCED_ALL[dan]) {
    chosen.push(...FORCED_ALL[dan]);
  } else if (FORCED_ONE_OF[dan]) {
    const opts = FORCED_ONE_OF[dan];
    chosen.push(opts[Math.floor(Math.random() * opts.length)]);
  }
  pool = pool.filter((v) => !chosen.includes(v));
  const need = 9 - chosen.length;
  chosen.push(...shuffle(pool).slice(0, need));
  return chosen;
}

// ── 開始 ────────────────────────────────────────────────────

export function startSort({ dan, profileId, mode }) {
  stopTick();
  const realValues = [];
  for (let b = 1; b <= 9; b++) realValues.push(dan * b);

  const trayValues = mode === 'renshu'
    ? shuffle([...realValues, ...pickDummyValues(dan, realValues)])
    : shuffle(realValues);

  st = {
    dan,
    profileId,
    mode,
    trayValues,
    usedValues: mode === 'renshu' ? new Set() : null, // 練習モード：いま置かれている値
    slots: new Array(9).fill(null),
    finished: false,
  };

  el.danChip.textContent = `${dan} の だん（${MODE_LABEL[mode]}）`;
  el.result.hidden = true;
  el.enter.hidden = false;
  el.hint.hidden = false;
  el.hint.innerHTML = HINT_TEXT[mode];

  render();
  watch.start();
  startTick();
  cb.showScreen('sort');
}

export function abortSort() { abort(); }

function abort() {
  stopTick();
  if (watch) watch.stop();
  st = null;
}

export function pauseSort() { if (st && !st.finished) watch.pause(); }
export function resumeSort() { if (st && !st.finished) watch.resume(); }

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

// ── 画面をつくる ────────────────────────────────────────────

function render() {
  // ならべる ばしょ
  el.slots.innerHTML = '';
  st.slots.forEach((value, i) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'sort-slot';
    slot.dataset.slot = i;

    const num = document.createElement('span');
    num.className = 'slot-no';
    num.textContent = `${i + 1}ばんめ`;
    slot.appendChild(num);

    const face = document.createElement('span');
    face.className = 'slot-face';
    face.textContent = value === null ? '' : value;
    slot.appendChild(face);

    if (value !== null) slot.classList.add('is-filled');
    slot.addEventListener('click', () => takeBack(i));
    el.slots.appendChild(slot);
  });

  // 下の カード
  el.tray.innerHTML = '';
  st.trayValues.forEach((value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-card';
    // 練習モードだけ、いま置かれているカードを消す（入門は くり返し使えるので消さない）
    if (st.mode === 'renshu' && st.usedValues.has(value)) btn.classList.add('is-used');
    btn.textContent = value;
    btn.addEventListener('click', () => placeCard(value));
    el.tray.appendChild(btn);
  });

  const filled = st.slots.every((s) => s !== null);
  el.enter.disabled = !filled;
}

// ── カードの出し入れ ────────────────────────────────────────

function placeCard(value) {
  if (!st || st.finished) return;
  if (st.mode === 'renshu' && st.usedValues.has(value)) return; // もう置いてある
  const empty = st.slots.indexOf(null);                          // いちばん左の あきばしょ
  if (empty < 0) return;
  st.slots[empty] = value;
  if (st.mode === 'renshu') st.usedValues.add(value);
  sounds.playTap();
  render();
}

function takeBack(slotIndex) {
  if (!st || st.finished) return;
  const value = st.slots[slotIndex];
  if (value === null) return;
  st.slots[slotIndex] = null;
  if (st.mode === 'renshu') st.usedValues.delete(value);
  sounds.playTap();
  render();
}

// ── 判定 ────────────────────────────────────────────────────

async function judge() {
  if (!st || st.finished) return;
  if (st.slots.some((s) => s === null)) return;

  st.finished = true;
  stopTick();
  const elapsedMs = Math.round(watch.stop());
  paintTime();
  el.enter.hidden = true;
  el.hint.hidden = true;

  let correctCount = 0;
  st.slots.forEach((value, i) => {
    const want = st.dan * (i + 1);
    const ok = value === want;
    if (ok) correctCount++;
    const slotEl = el.slots.querySelector(`.sort-slot[data-slot="${i}"]`);
    slotEl.classList.add(ok ? 'is-correct' : 'is-wrong');
    if (!ok) {
      // 正しいこたえを 小さく そえる
      const hint = document.createElement('span');
      hint.className = 'slot-hint';
      hint.textContent = want;
      slotEl.appendChild(hint);
    }
  });

  // 九九表には 反映しない（1問ごとの attempt は のこさない）
  await storage.saveSession(st.profileId, {
    ts: Date.now(),
    mode: 'sort',
    level: 1,
    dans: [st.dan],
    total: 9,
    correctCount,
    elapsedMs,
  });

  const total = Math.floor(elapsedMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  el.result.innerHTML = correctCount === 9
    ? `ぜんぶ せいかい！　かかった 時間 <strong>${m > 0 ? `${m}ぷん ` : ''}${s}びょう</strong>`
    : `<strong>${correctCount}</strong> / 9 が せいかい`
      + `　かかった 時間 <strong>${m > 0 ? `${m}ぷん ` : ''}${s}びょう</strong>`;
  el.result.hidden = false;

  if (correctCount === 9) sounds.playFanfare();
  else sounds.playFinish();
}
