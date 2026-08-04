// 保存層：ローカルモード（この端末の localStorage に記録する）
// ─────────────────────────────────────────────────────────────
// GAS_URL が空のときに使われる。開発・おためし用。
// 名前も記録も この iPad の中に残るので、学校で運用するときは
// config.js に GAS_URL を入れて シートモードにしてください。
//
// 呼び出し側は storage.js ごしに使うので、このファイルを直接は見ない。
// ─────────────────────────────────────────────────────────────

/** ローカルモードの立ち上げ（とくにやることはない） */
export async function init() { /* なにもしない */ }

/** 名簿をアプリから編集できるか（ローカルモードはできる） */
export const canEditProfiles = true;
/** 記録がこの端末にあるか（CSV書き出し・削除ができるか） */
export const hasLocalRecords = true;

import {
  ATTEMPT_LIMIT,
  SESSION_LIMIT,
  DEFAULT_TIME_LIMIT_SEC,
} from './constants.js';

// ── localStorage のキー ─────────────────────────────────────
const KEY_PROFILES = 'kuku:profiles';
const KEY_CURRENT = 'kuku:currentProfile';
const KEY_SETTINGS = 'kuku:settings';
const keyAttempts = (id) => `kuku:attempts:${id}`;
const keySessions = (id) => `kuku:sessions:${id}`;

// ═══ アダプタ境界 ここから ═══════════════════════════════════
// GAS 化するときは、この3つを fetch ベースの実装に置き換える。
// （呼び出し側はすべて await しているので、非同期のままで問題ない）

async function _read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] よみこみに しっぱい:', key, e);
    return fallback;
  }
}

async function _write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[storage] ほぞんに しっぱい:', key, e);
    return false;
  }
}

async function _remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[storage] さくじょに しっぱい:', key, e);
  }
}

// ═══ アダプタ境界 ここまで ═══════════════════════════════════

/** かんたんな一意ID */
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── プロフィール ────────────────────────────────────────────

/** プロフィール一覧（つくった順） */
export async function getProfiles() {
  const list = await _read(KEY_PROFILES, []);
  return Array.isArray(list) ? list : [];
}

/** プロフィールを追加して、追加したものを返す */
export async function addProfile(name) {
  const trimmed = String(name || '').trim().slice(0, 12);
  if (!trimmed) throw new Error('なまえが からっぽです');
  const list = await getProfiles();
  const profile = { id: makeId('p'), name: trimmed, createdAt: Date.now() };
  list.push(profile);
  await _write(KEY_PROFILES, list);
  return profile;
}

/** プロフィールと、その子の記録をまとめて削除する */
export async function deleteProfile(id) {
  const list = await getProfiles();
  await _write(KEY_PROFILES, list.filter((p) => p.id !== id));
  await _remove(keyAttempts(id));
  await _remove(keySessions(id));
  const current = await getCurrentProfileId();
  if (current === id) await setCurrentProfileId(null);
}

/** いま選ばれているプロフィールID（なければ null） */
export async function getCurrentProfileId() {
  const id = await _read(KEY_CURRENT, null);
  if (!id) return null;
  // 消されたプロフィールが残っていないか確かめる
  const list = await getProfiles();
  return list.some((p) => p.id === id) ? id : null;
}

/** 選択中のプロフィールを切り替える */
export async function setCurrentProfileId(id) {
  if (id === null) await _remove(KEY_CURRENT);
  else await _write(KEY_CURRENT, id);
}

// ── 1問ごとの記録（attempt） ────────────────────────────────

/**
 * 1問ぶんの記録を保存する。
 * 保持件数を超えたら古いものから捨てる。
 */
export async function saveAttempt(profileId, attempt) {
  if (!profileId) return;
  const key = keyAttempts(profileId);
  const list = await _read(key, []);
  list.push(attempt);
  if (list.length > ATTEMPT_LIMIT) list.splice(0, list.length - ATTEMPT_LIMIT);
  const ok = await _write(key, list);
  if (!ok) {
    // 容量あふれのときは半分に減らしてもう一度だけ試す
    list.splice(0, Math.floor(list.length / 2));
    await _write(key, list);
  }
}

/**
 * 記録を取り出す。**新しい順**（先頭がいちばん新しい）で返す。
 * @param {object} opt  { a, b, limit } — a,b を指定するとその問題だけに絞る
 */
export async function getAttempts(profileId, { a, b, limit } = {}) {
  if (!profileId) return [];
  const list = await _read(keyAttempts(profileId), []);
  let out = Array.isArray(list) ? list.slice() : [];
  if (a != null && b != null) out = out.filter((x) => x.a === a && x.b === b);
  out.reverse(); // 保存は古い順 → 新しい順にして返す
  if (limit != null) out = out.slice(0, limit);
  return out;
}

// ── セッションごとの記録（session） ─────────────────────────

export async function saveSession(profileId, session) {
  if (!profileId) return;
  const key = keySessions(profileId);
  const list = await _read(key, []);
  list.push(session);
  if (list.length > SESSION_LIMIT) list.splice(0, list.length - SESSION_LIMIT);
  await _write(key, list);
}

/** セッション記録を**新しい順**で返す */
export async function getSessions(profileId, { limit } = {}) {
  if (!profileId) return [];
  const list = await _read(keySessions(profileId), []);
  let out = Array.isArray(list) ? list.slice() : [];
  out.reverse();
  if (limit != null) out = out.slice(0, limit);
  return out;
}

// ── 設定 ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  timeLimitSec: DEFAULT_TIME_LIMIT_SEC,
  muted: false,
};

/** 設定（足りないキーは既定値でうめて返す） */
export async function getSettings() {
  const saved = await _read(KEY_SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await _write(KEY_SETTINGS, merged);
  return merged;
}

// ── 記録の削除 ──────────────────────────────────────────────

/**
 * 記録だけを消す（プロフィールは残す）。
 * profileId に null を渡すと全員ぶん。
 */
export async function clearRecords(profileId = null) {
  const targets = profileId
    ? [{ id: profileId }]
    : await getProfiles();
  for (const p of targets) {
    await _remove(keyAttempts(p.id));
    await _remove(keySessions(p.id));
  }
}

// ── CSV 書き出し ────────────────────────────────────────────

const CSV_HEADER = [
  '日時', 'なまえ', 'モード', 'レベル', 'しき', 'こたえ',
  'にゅうりょく', 'せいご', 'じかんぎれ', 'そうきじかん(ms)', 'ごうけいじかん(ms)',
];

/** Excel が誤解しないように、必要なときだけ引用符でくくる */
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 2026-08-04 11:02:33 の形式 */
function formatDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const MODE_LABEL = { quiz: '一問一答', grid: 'マス計算', sort: '九九ならべ' };

/**
 * CSV文字列を返す。**先頭に UTF-8 BOM を含む**ので、
 * 呼び出し側はそのまま Blob にして保存すれば Excel で開ける。
 * profileId に null を渡すと全員ぶん。
 */
export async function exportCsv(profileId = null) {
  const profiles = await getProfiles();
  const targets = profileId ? profiles.filter((p) => p.id === profileId) : profiles;

  const rows = [CSV_HEADER.join(',')];
  for (const p of targets) {
    // 古い順（＝時系列順）に並べたいので reverse で戻す
    const attempts = (await getAttempts(p.id)).reverse();
    for (const at of attempts) {
      rows.push([
        formatDateTime(at.ts),
        p.name,
        MODE_LABEL[at.mode] || at.mode,
        at.level,
        `${at.a}×${at.b}`,
        at.a * at.b,
        at.given == null ? '' : at.given,
        at.correct ? 1 : 0,
        at.timedOut ? 1 : 0,
        at.latencyMs == null ? '' : at.latencyMs,
        at.totalMs == null ? '' : at.totalMs,
      ].map(csvCell).join(','));
    }
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // 先頭は UTF-8 BOM
}
