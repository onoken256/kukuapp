// せんせいメニュー
// ─────────────────────────────────────────────────────────────
// ホーム画面のすみの歯車を 1.5秒 長押しで開く（子どもが誤って入らないため）。
// 制限時間の設定・しきい値の確認・CSV書き出し・記録の削除・プロフィール管理。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';
import { confirmDialog } from './dialog.js';
import {
  TIME_LIMIT_OPTIONS, TEACHER_HOLD_MS,
  MASTERY_WINDOW, FAST_LATENCY_MS, ATTEMPT_LIMIT,
} from './constants.js';

const $ = (id) => document.getElementById(id);

let el = {};
let cb = {};
let holdTimer = null;

export function initTeacher(callbacks) {
  cb = callbacks;
  el = {
    gear: $('gear'),
    limitBox: $('teacher-limits'),
    threshold: $('teacher-threshold'),
    csvOne: $('teacher-csv-one'),
    csvAll: $('teacher-csv-all'),
    clearOne: $('teacher-clear-one'),
    clearAll: $('teacher-clear-all'),
    profileList: $('teacher-profiles'),
    newName: $('teacher-new-name'),
    addProfile: $('teacher-add-profile'),
    addRow: $('teacher-add-row'),
    message: $('teacher-message'),
    close: $('teacher-close'),
    sheetBlock: $('teacher-sheet-block'),
    sheetState: $('teacher-sheet-state'),
    flush: $('teacher-flush'),
    reload: $('teacher-reload'),
    csvBlock: $('teacher-csv-block'),
    clearBlock: $('teacher-clear-block'),
  };

  setupLongPress();
  buildLimitButtons();

  el.threshold.innerHTML = `
    <li>「できた」と みなす そうき時間：<strong>${FAST_LATENCY_MS} ms</strong> いか</li>
    <li>はんていに つかう 回数：ちょっきん <strong>${MASTERY_WINDOW}</strong> かい</li>
    <li>1人あたりの きろく ほじ件数：<strong>${ATTEMPT_LIMIT}</strong> 件</li>
    <li class="note">変更するときは js/constants.js を編集してください。</li>`;

  el.csvOne.addEventListener('click', () => downloadCsv(false));
  el.csvAll.addEventListener('click', () => downloadCsv(true));
  el.clearOne.addEventListener('click', () => clearRecords(false));
  el.clearAll.addEventListener('click', () => clearRecords(true));
  el.addProfile.addEventListener('click', addProfile);
  el.newName.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addProfile(); });
  el.close.addEventListener('click', () => cb.onClose());

  el.flush.addEventListener('click', async () => {
    say('送信しています…');
    const sent = await storage.flushPending();
    paintSheetState();
    say(sent > 0 ? `${sent}件を送信しました` : '送信できませんでした（電波を確認してください）');
  });

  el.reload.addEventListener('click', async () => {
    say('名簿を読みなおしています…');
    try {
      await storage.reloadRoster();
      await renderProfiles();
      say('名簿を読みなおしました');
    } catch (e) {
      say(`読みなおせませんでした：${e.message || ''}`);
    }
    paintSheetState();
  });
}

/** シートモードのときだけ出す情報 */
function paintSheetState() {
  const sheet = storage.isSheetMode();
  el.sheetBlock.hidden = !sheet;
  // 記録が端末にないモードでは、CSV書き出しと削除は意味がないので隠す
  el.csvBlock.hidden = !storage.hasLocalRecords();
  el.clearBlock.hidden = !storage.hasLocalRecords();
  el.addRow.hidden = !storage.canEditProfiles();
  if (!sheet) return;

  const n = storage.pendingCount();
  el.flush.disabled = n === 0;
  el.sheetState.textContent = n === 0
    ? '未送信の記録はありません。記録は1回終わるごとにスプレッドシートへ送られます。'
    : `未送信の記録が ${n}件 あります。電波のあるところで「今すぐ送る」を押してください。`;
}

// ── 歯車の長押し ────────────────────────────────────────────

function setupLongPress() {
  const start = (ev) => {
    ev.preventDefault();
    cancel();
    el.gear.classList.add('is-holding');
    holdTimer = setTimeout(async () => {
      el.gear.classList.remove('is-holding');
      holdTimer = null;
      await openTeacher();
    }, TEACHER_HOLD_MS);
  };
  const cancel = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    el.gear.classList.remove('is-holding');
  };

  el.gear.addEventListener('pointerdown', start);
  el.gear.addEventListener('pointerup', cancel);
  el.gear.addEventListener('pointerleave', cancel);
  el.gear.addEventListener('pointercancel', cancel);
}

// ── 画面の中身 ──────────────────────────────────────────────

function buildLimitButtons() {
  el.limitBox.innerHTML = '';
  for (const sec of TIME_LIMIT_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.sec = sec;
    btn.textContent = `${sec}びょう`;
    btn.addEventListener('click', async () => {
      const settings = await storage.saveSettings({ ...cb.getSettings(), timeLimitSec: sec });
      cb.onSettingsChanged(settings);
      markLimit(sec);
      say(`せいげん時間を ${sec}びょう に しました`);
    });
    el.limitBox.appendChild(btn);
  }
}

function markLimit(sec) {
  for (const btn of el.limitBox.querySelectorAll('.chip')) {
    btn.classList.toggle('is-on', Number(btn.dataset.sec) === sec);
  }
}

/** せんせいメニューを開く */
export async function openTeacher() {
  const settings = cb.getSettings();
  markLimit(settings.timeLimitSec);
  say('');
  paintSheetState();
  await renderProfiles();
  cb.showScreen('teacher');
}

async function renderProfiles() {
  const list = await storage.getProfiles();
  const currentId = cb.getProfileId();
  el.profileList.innerHTML = '';

  if (list.length === 0) {
    el.profileList.innerHTML = '<li class="note">まだ だれも いません</li>';
    return;
  }

  const editable = storage.canEditProfiles();
  for (const p of list) {
    // シートモードでは、ほかの子の記録は端末に無いので件数は出さない
    const attempts = editable ? await storage.getAttempts(p.id) : [];
    const li = document.createElement('li');
    li.className = 'teacher-profile';
    if (p.id === currentId) li.classList.add('is-current');

    const label = document.createElement('span');
    label.className = 'tp-name';
    label.textContent = p.name;

    const count = document.createElement('span');
    count.className = 'tp-count';
    count.textContent = editable ? `${attempts.length} 件` : 'スプレッドシートで管理';

    if (!editable) {
      li.append(label, count);
      el.profileList.appendChild(li);
      continue;
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-danger btn-small';
    del.textContent = 'さくじょ';
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `「${p.name}」を削除しますか？`,
        message: `記録 ${attempts.length}件も いっしょに削除されます。元に戻せません。`,
        okLabel: '削除する', cancelLabel: 'やめる', danger: true,
      });
      if (!ok) return;
      await storage.deleteProfile(p.id);
      await renderProfiles();
      say(`「${p.name}」を 削除しました`);
      cb.onProfilesChanged();
    });

    li.append(label, count, del);
    el.profileList.appendChild(li);
  }
}

async function addProfile() {
  const name = el.newName.value.trim();
  if (!name) { say('なまえを 入力してください'); return; }
  const list = await storage.getProfiles();
  if (list.some((p) => p.name === name)) { say('おなじ なまえが あります'); return; }
  await storage.addProfile(name);
  el.newName.value = '';
  await renderProfiles();
  say(`「${name}」を ついかしました`);
  cb.onProfilesChanged();
}

// ── CSV ─────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function downloadCsv(all) {
  const profileId = all ? null : cb.getProfileId();
  if (!all && !profileId) { say('先に プロフィールを えらんでください'); return; }

  const csv = await storage.exportCsv(profileId);
  // 行数から、ヘッダーを除いたデータ件数をかぞえる
  const lines = csv.trim().split('\r\n').length - 1;
  if (lines <= 0) { say('書き出す きろくが ありません'); return; }

  let name = 'ぜんいん';
  if (!all) {
    const list = await storage.getProfiles();
    const p = list.find((x) => x.id === profileId);
    name = p ? p.name : 'きろく';
  }

  // exportCsv が返す文字列には BOM が含まれているので、そのまま Blob にする
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kuku_${name}_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(`${lines}件を 書き出しました`);
}

// ── 記録の削除 ──────────────────────────────────────────────

async function clearRecords(all) {
  const profileId = all ? null : cb.getProfileId();
  if (!all && !profileId) { say('先に プロフィールを えらんでください'); return; }

  let who = 'ぜんいん';
  if (!all) {
    const list = await storage.getProfiles();
    const p = list.find((x) => x.id === profileId);
    who = p ? `「${p.name}」` : 'この子';
  }
  const ok1 = await confirmDialog({
    title: `${who}の記録を削除しますか？`,
    message: '元に戻せません。',
    okLabel: '削除する', cancelLabel: 'やめる', danger: true,
  });
  if (!ok1) return;
  const ok2 = await confirmDialog({
    title: '本当によろしいですか？',
    message: 'この操作は取り消せません。',
    okLabel: '削除を実行', cancelLabel: 'やめる', danger: true,
  });
  if (!ok2) return;

  await storage.clearRecords(profileId);
  await renderProfiles();
  say(`${who}の きろくを 削除しました`);
}

function say(text) {
  el.message.textContent = text;
  el.message.hidden = !text;
}
