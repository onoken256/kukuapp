// 九九ひょう（ヒートマップ）
// ─────────────────────────────────────────────────────────────
// 81マスを習得状況で色分けする。すべてのモードの記録がここに集まる。
// 色分けの判定そのものは mastery.js が持っている。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';
import * as mastery from './mastery.js';
import { STATE, STATE_LABEL } from './mastery.js';
import { MASTERY_WINDOW, FAST_LATENCY_MS, HISTORY_VIEW_COUNT } from './constants.js';

const $ = (id) => document.getElementById(id);

let el = {};
let built = false;
let currentGrouped = null;

export function initHeatmap() {
  el = {
    grid: $('heat-grid'),
    count: $('heat-count'),
    detail: $('heat-detail'),
    detailTitle: $('heat-detail-title'),
    detailBody: $('heat-detail-body'),
    detailClose: $('heat-detail-close'),
  };

  el.detailClose.addEventListener('click', () => { el.detail.hidden = true; });
  buildGrid();
}

/** 10×10（見出し＋81マス）の枠を1回だけ組み立てる */
function buildGrid() {
  if (built) return;
  const frag = document.createDocumentFragment();

  const corner = document.createElement('div');
  corner.className = 'heat-head heat-corner';
  corner.textContent = '×';
  frag.appendChild(corner);

  for (let b = 1; b <= 9; b++) {
    const h = document.createElement('div');
    h.className = 'heat-head';
    h.textContent = b;
    frag.appendChild(h);
  }

  for (let a = 1; a <= 9; a++) {
    const h = document.createElement('div');
    h.className = 'heat-head';
    h.textContent = a;
    frag.appendChild(h);

    for (let b = 1; b <= 9; b++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'heat-cell';
      cell.dataset.a = a;
      cell.dataset.b = b;
      cell.textContent = a * b;
      cell.addEventListener('click', () => showDetail(a, b));
      frag.appendChild(cell);
    }
  }

  el.grid.appendChild(frag);
  built = true;
}

/** 表示のたびに、いまの記録で塗りなおす */
export async function refreshHeatmap(profileId) {
  el.detail.hidden = true;
  const attempts = await storage.getAttempts(profileId); // 新しい順
  const { states, counts, grouped } = mastery.buildMasteryMap(attempts);
  currentGrouped = grouped;

  for (const cell of el.grid.querySelectorAll('.heat-cell')) {
    const a = Number(cell.dataset.a);
    const b = Number(cell.dataset.b);
    const s = states.get(mastery.keyOf(a, b));
    cell.dataset.state = s;
    cell.setAttribute('aria-label', `${a} かける ${b} は ${a * b}。${STATE_LABEL[s]}`);
  }

  el.count.innerHTML =
    `できた：<strong>${counts[STATE.GOOD]}</strong> ／ 81`
    + `<span class="heat-sub">にがて ${counts[STATE.WEAK]}・`
    + `あとちょっと ${counts[STATE.ALMOST]}・`
    + `みちょうせん ${counts[STATE.UNTRIED]}</span>`;
}

const formatSec = (ms) => (ms == null ? '－' : `${(ms / 1000).toFixed(1)}びょう`);

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** マスをタップしたとき、その問題の直近の履歴を出す */
function showDetail(a, b) {
  const list = (currentGrouped && currentGrouped.get(mastery.keyOf(a, b))) || [];
  const state = mastery.judge(list);
  const recent = list.slice(0, HISTORY_VIEW_COUNT);

  el.detail.hidden = false;
  el.detailTitle.innerHTML =
    `${a} × ${b} ＝ <strong>${a * b}</strong>`
    + ` <span class="state-chip" data-state="${state}">${STATE_LABEL[state]}</span>`;

  if (recent.length === 0) {
    el.detailBody.innerHTML = '<p class="heat-empty">まだ といていません</p>';
    return;
  }

  const rows = recent.map((at) => {
    const mark = at.correct ? '◯' : '×';
    const cls = at.correct ? 'ok' : 'ng';
    const note = at.timedOut ? 'じかんぎれ'
      : (at.correct ? '' : `${at.given} と こたえた`);
    return `<tr>
      <td class="d-date">${formatDate(at.ts)}</td>
      <td class="d-mark ${cls}">${mark}</td>
      <td class="d-lat">${formatSec(at.latencyMs)}</td>
      <td class="d-note">${note}</td>
    </tr>`;
  }).join('');

  el.detailBody.innerHTML = `
    <table class="heat-history">
      <thead><tr><th>ひづけ</th><th>せいご</th><th>そうき時間</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="heat-note">「そうき時間」＝ 問題が出てから さいしょの ボタンを おすまで。
    ちょっきん${MASTERY_WINDOW}かいで はんていします（${FAST_LATENCY_MS}ミリびょう いない なら はやい）。</p>`;
}
