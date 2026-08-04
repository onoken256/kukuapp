// プロフィール管理
// ─────────────────────────────────────────────────────────────
// ローカルモード … この端末に名前を保存し、追加・削除もできる（おためし用）
// シートモード   … 名簿はスプレッドシートから読むだけ。
//                  **選んだ子の名前は 端末に一切保存されない。**
//                  追加・削除は スプレッドシート側で行う。
// ─────────────────────────────────────────────────────────────

import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

let el = {};
let cb = {};

export function initProfiles(callbacks) {
  cb = callbacks;
  el = {
    list: $('profile-list'),
    input: $('profile-name'),
    add: $('profile-add'),
    addRow: $('profile-add-row'),
    hint: $('profile-hint'),
    error: $('profile-error'),
    errorText: $('profile-error-text'),
    retry: $('profile-retry'),
  };

  el.add.addEventListener('click', addFromInput);
  el.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') addFromInput();
  });

  el.retry.addEventListener('click', async () => {
    el.errorText.textContent = 'よみこみちゅう…';
    try {
      await storage.reloadRoster();
      el.error.hidden = true;
    } catch (e) {
      el.errorText.textContent = `めいぼを よみこめませんでした\n${e.message || ''}`;
    }
    await renderProfileList();
  });
}

async function addFromInput() {
  const name = el.input.value.trim();
  if (!name) {
    el.hint.textContent = 'なまえを いれてね';
    return;
  }
  const list = await storage.getProfiles();
  if (list.some((p) => p.name === name)) {
    el.hint.textContent = 'おなじ なまえが あります';
    return;
  }
  el.hint.textContent = '';
  el.input.value = '';
  const profile = await storage.addProfile(name);
  await renderProfileList();
  // つくったばかりの子をそのまま選ぶ
  await choose(profile.id);
}

async function choose(id) {
  // シートモードでは、ここで その子の過去記録を よみに行くので少し待つ
  el.list.classList.add('is-busy');
  el.hint.textContent = storage.isSheetMode() ? 'よみこみちゅう…' : '';
  try {
    await storage.setCurrentProfileId(id);
  } finally {
    el.list.classList.remove('is-busy');
    el.hint.textContent = '';
  }
  cb.onChoose(id);
}

/** プロフィール選択画面のリストを描きなおす */
export async function renderProfileList() {
  // 名簿を編集できるのは ローカルモードのときだけ
  el.addRow.hidden = !storage.canEditProfiles();

  const list = await storage.getProfiles();
  const current = await storage.getCurrentProfileId();
  el.list.innerHTML = '';

  if (list.length === 0) {
    const p = document.createElement('p');
    p.className = 'profile-empty';
    p.textContent = storage.canEditProfiles()
      ? 'したの らんに なまえを いれて「ついか」を おしてね'
      : 'めいぼが からっぽです。せんせいに つたえてね';
    el.list.appendChild(p);
    if (!storage.canEditProfiles()) el.error.hidden = false;
    return;
  }

  el.error.hidden = true;
  for (const profile of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-card';
    if (profile.id === current) btn.classList.add('is-current');
    btn.textContent = profile.name;
    btn.addEventListener('click', () => choose(profile.id));
    el.list.appendChild(btn);
  }
}

/** 読みこみに しっぱいしたことを 画面に出す */
export function showProfileError(message) {
  el.error.hidden = false;
  el.errorText.textContent = message;
}

/** いま選ばれている子（いなければ null） */
export async function getCurrentProfile() {
  const id = await storage.getCurrentProfileId();
  if (!id) return null;
  const list = await storage.getProfiles();
  return list.find((p) => p.id === id) || null;
}
