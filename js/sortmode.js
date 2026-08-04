// モード③「九九ならべ」
// ─────────────────────────────────────────────────────────────
// えらんだ だんの こたえカードが 下に ばらばらに ならぶ。
// それを 正しい じゅんばんに ならべて「けってい」。
//
// カードを タップすると いちばん左の あいている ばしょに 入る。
// 入れたカードを もう一度 タップすると 下に もどる。
// （小さい子でも 1タップで すすめられるようにしている）
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
    if (st) startSort({ dan: st.dan, profileId: st.profileId });
  });
  el.toDan.addEventListener('click', () => { abort(); cb.onDanSelect(); });
  el.home.addEventListener('click', () => { abort(); cb.onHome(); });
}

// ── 開始 ────────────────────────────────────────────────────

export function startSort({ dan, profileId }) {
  stopTick();
  const values = [];
  for (let b = 1; b <= 9; b++) values.push(dan * b);

  st = {
    dan,
    profileId,
    // 下にならぶカード。ばしょは動かさず、入れたら あなが あくようにする
    cards: shuffle(values).map((v) => ({ value: v, slot: null })),
    slots: new Array(9).fill(null), // それぞれ cards の番号 or null
    finished: false,
  };

  el.danChip.textContent = `${dan} の だん`;
  el.result.hidden = true;
  el.enter.hidden = false;
  el.hint.hidden = false;

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
  st.slots.forEach((cardIndex, i) => {
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
    face.textContent = cardIndex === null ? '' : st.cards[cardIndex].value;
    slot.appendChild(face);

    if (cardIndex !== null) slot.classList.add('is-filled');
    slot.addEventListener('click', () => takeBack(i));
    el.slots.appendChild(slot);
  });

  // 下の カード
  el.tray.innerHTML = '';
  st.cards.forEach((card, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-card';
    btn.textContent = card.value;
    if (card.slot !== null) btn.classList.add('is-used'); // ばしょだけ のこす
    btn.addEventListener('click', () => placeCard(i));
    el.tray.appendChild(btn);
  });

  const filled = st.slots.every((s) => s !== null);
  el.enter.disabled = !filled;
}

// ── カードの出し入れ ────────────────────────────────────────

function placeCard(cardIndex) {
  if (!st || st.finished) return;
  const card = st.cards[cardIndex];
  if (card.slot !== null) return;              // もう入っている
  const empty = st.slots.indexOf(null);        // いちばん左の あきばしょ
  if (empty < 0) return;
  st.slots[empty] = cardIndex;
  card.slot = empty;
  sounds.playTap();
  render();
}

function takeBack(slotIndex) {
  if (!st || st.finished) return;
  const cardIndex = st.slots[slotIndex];
  if (cardIndex === null) return;
  st.cards[cardIndex].slot = null;
  st.slots[slotIndex] = null;
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
  st.slots.forEach((cardIndex, i) => {
    const want = st.dan * (i + 1);
    const got = st.cards[cardIndex].value;
    const ok = got === want;
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
