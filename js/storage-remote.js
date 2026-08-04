// 保存層：シートモード（Google スプレッドシートを データベースにする）
// ─────────────────────────────────────────────────────────────
// 通信は 3回だけ。
//   ① 起動時          名簿を読む            GET  ?action=roster
//   ② 名前を えらんだ時 その子の過去記録を読む  GET  ?action=history&id=…
//   ③ 1回 終わった時   その回の記録を書きこむ   POST（本文はJSON文字列）
//
// **子どもの名前を この端末に保存しない**のが このモードの目的。
//   ・名簿は メモリにだけ持ち、アプリを閉じれば消える
//   ・選んでいる子も メモリだけ（localStorage には書かない）
//   ・送信に失敗した分だけ 端末に退避するが、そこに入るのは
//     名前ではなく 名簿の ID だけ
// ─────────────────────────────────────────────────────────────

import { GAS_URL, FETCH_TIMEOUT_MS } from './config.js';
import * as local from './storage-local.js';

/** 名簿はアプリから編集できない（シート側で管理する） */
export const canEditProfiles = false;
/** 記録は端末に残らない（CSVはシートから出す） */
export const hasLocalRecords = false;

const KEY_PENDING = 'kuku:pending'; // 送れなかった記録の退避先

// ── メモリだけに持つもの（アプリを閉じたら消える） ──────────
let roster = [];          // [{id, name}]
let currentId = null;
let history = [];         // いま選ばれている子の attempt（新しい順）
let sessionsMem = [];     // いま選ばれている子の session（新しい順）
let batch = [];           // まだ送っていない attempt
let lastError = null;

// ── 通信 ────────────────────────────────────────────────────

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(params) {
  const url = `${GAS_URL}?${new URLSearchParams(params).toString()}`;
  const res = await withTimeout(
    (signal) => fetch(url, { method: 'GET', signal, redirect: 'follow' }),
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`つうしんエラー (${res.status})`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

/**
 * 書きこみ。Content-Type を text/plain にして、
 * ブラウザの事前確認（プリフライト）が飛ばないようにする。
 */
async function postJson(payload) {
  const res = await withTimeout(
    (signal) => fetch(GAS_URL, {
      method: 'POST',
      signal,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }),
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`そうしんエラー (${res.status})`);
  const data = await res.json().catch(() => ({}));
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ── 退避キュー ──────────────────────────────────────────────

function readPending() {
  try {
    const raw = localStorage.getItem(KEY_PENDING);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writePending(list) {
  try { localStorage.setItem(KEY_PENDING, JSON.stringify(list)); } catch { /* あふれたらあきらめる */ }
}

function enqueue(payload) {
  const list = readPending();
  list.push(payload);
  writePending(list);
}

/** 退避してあるものを ぜんぶ送る。送れた件数を返す */
export async function flushPending() {
  const list = readPending();
  if (list.length === 0) return 0;
  let sent = 0;
  const rest = [];
  for (const payload of list) {
    if (rest.length > 0) { rest.push(payload); continue; } // 1つ失敗したら以降は次回へ
    try {
      await postJson(payload);
      sent++;
    } catch {
      rest.push(payload);
    }
  }
  writePending(rest);
  return sent;
}

/** まだ送れていない件数 */
export function pendingCount() {
  return readPending().length;
}

export function getLastError() { return lastError; }

// ── 立ち上げ ────────────────────────────────────────────────

export async function init() {
  lastError = null;
  // 前回 送れなかったぶんを、まず片づける
  flushPending().catch(() => { /* 起動をとめない */ });
  await reloadRoster();
}

/** 名簿を読みなおす */
export async function reloadRoster() {
  try {
    const data = await getJson({ action: 'roster' });
    roster = (data.profiles || []).map((p) => ({ id: String(p.id), name: String(p.name) }));
    lastError = null;
  } catch (e) {
    roster = [];
    lastError = e.message || 'めいぼを よみこめませんでした';
    throw e;
  }
}

// ── プロフィール（名簿） ────────────────────────────────────

export async function getProfiles() { return roster.slice(); }

export async function addProfile() {
  throw new Error('シートモードでは、名簿はスプレッドシート側で管理します');
}

export async function deleteProfile() {
  throw new Error('シートモードでは、名簿はスプレッドシート側で管理します');
}

/** 端末には保存しない。メモリだけ */
export async function getCurrentProfileId() {
  return currentId && roster.some((p) => p.id === currentId) ? currentId : null;
}

/** 子どもを えらんだタイミングで、その子の過去記録を読みこむ */
export async function setCurrentProfileId(id) {
  currentId = id;
  history = [];
  sessionsMem = [];
  batch = [];
  if (!id) return;
  try {
    const data = await getJson({ action: 'history', id });
    // シートからは 古い順で来る想定。新しい順にそろえる
    history = (data.attempts || []).slice().reverse();
    sessionsMem = (data.sessions || []).slice().reverse();
    lastError = null;
  } catch (e) {
    // 履歴が読めなくても 練習はできるようにする（九九表が空になるだけ）
    lastError = e.message || 'きろくを よみこめませんでした';
  }
}

// ── 1問ごとの記録 ──────────────────────────────────────────

export async function saveAttempt(profileId, attempt) {
  if (!profileId || profileId !== currentId) return;
  history.unshift(attempt); // 画面（九九表）はすぐ新しい状態になる
  batch.push(attempt);      // 送信は セッションが終わったときに まとめて
}

export async function getAttempts(profileId, { a, b, limit } = {}) {
  if (!profileId || profileId !== currentId) return [];
  let out = history.slice();
  if (a != null && b != null) out = out.filter((x) => x.a === a && x.b === b);
  if (limit != null) out = out.slice(0, limit);
  return out;
}

// ── セッション記録＝ここで まとめて 書きこむ ────────────────

export async function saveSession(profileId, session) {
  if (!profileId || profileId !== currentId) return;
  sessionsMem.unshift(session);

  const payload = {
    profileId,
    attempts: batch.slice(),
    session,
    sentAt: Date.now(),
  };
  batch = [];

  try {
    await postJson(payload);
    // ついでに、たまっていたぶんも 送ってしまう
    flushPending().catch(() => {});
  } catch (e) {
    // 送れなかったら 端末に退避する（入るのは名前ではなく ID）
    lastError = e.message || 'きろくを おくれませんでした';
    enqueue(payload);
  }
}

export async function getSessions(profileId, { limit } = {}) {
  if (!profileId || profileId !== currentId) return [];
  return limit != null ? sessionsMem.slice(0, limit) : sessionsMem.slice();
}

// ── 設定は 個人情報ではないので 端末に置く ──────────────────

export const getSettings = local.getSettings;
export const saveSettings = local.saveSettings;

// ── シートモードでは使わないもの ────────────────────────────

export async function clearRecords() {
  throw new Error('シートモードでは、記録の削除はスプレッドシート側で行います');
}

export async function exportCsv() {
  throw new Error('シートモードでは、記録はスプレッドシートから書き出してください');
}
