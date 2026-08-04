// 保存層（ファサード）
// ─────────────────────────────────────────────────────────────
// 呼び出し側は「どこに保存されているか」を一切知らない。
// config.js の GAS_URL が
//   空      → storage-local.js （この端末の localStorage）
//   URLあり → storage-remote.js（Google スプレッドシート）
// に つながる。差し替えは この1ファイルの中だけで完結する。
//
// すべて async。将来ほかの保存先を足すときも、
// 同じ関数を持つモジュールを1つ作って ここでつなげばよい。
// ─────────────────────────────────────────────────────────────

import { GAS_URL } from './config.js';
import * as localBackend from './storage-local.js';
import * as remoteBackend from './storage-remote.js';

let impl = localBackend;
let ready = false;

/**
 * アプリ起動時に1回だけ呼ぶ。
 * @returns {Promise<{mode: 'local'|'sheet', error: string|null}>}
 */
export async function initStorage() {
  impl = GAS_URL ? remoteBackend : localBackend;
  let error = null;
  try {
    await impl.init();
  } catch (e) {
    error = e.message || 'よみこみに しっぱいしました';
  }
  ready = true;
  return { mode: GAS_URL ? 'sheet' : 'local', error };
}

/** いまシートモードか */
export const isSheetMode = () => impl === remoteBackend;
/** 名簿をアプリから追加・削除できるか */
export const canEditProfiles = () => impl.canEditProfiles;
/** 記録がこの端末にあるか（CSV書き出し・削除ができるか） */
export const hasLocalRecords = () => impl.hasLocalRecords;
/** まだ送れていない記録の件数（ローカルモードでは 0） */
export const pendingCount = () => (impl.pendingCount ? impl.pendingCount() : 0);
/** たまっている記録をいま送る（ローカルモードでは 0） */
export const flushPending = () => (impl.flushPending ? impl.flushPending() : Promise.resolve(0));
/** 名簿を読みなおす（シートモードのみ） */
export const reloadRoster = () => (impl.reloadRoster ? impl.reloadRoster() : Promise.resolve());

// ── 以下は どちらのモードでも 同じ形で使える ────────────────

export const getProfiles = (...a) => impl.getProfiles(...a);
export const addProfile = (...a) => impl.addProfile(...a);
export const deleteProfile = (...a) => impl.deleteProfile(...a);
export const getCurrentProfileId = (...a) => impl.getCurrentProfileId(...a);
export const setCurrentProfileId = (...a) => impl.setCurrentProfileId(...a);
export const saveAttempt = (...a) => impl.saveAttempt(...a);
export const getAttempts = (...a) => impl.getAttempts(...a);
export const saveSession = (...a) => impl.saveSession(...a);
export const getSessions = (...a) => impl.getSessions(...a);
export const getSettings = (...a) => impl.getSettings(...a);
export const saveSettings = (...a) => impl.saveSettings(...a);
export const clearRecords = (...a) => impl.clearRecords(...a);
export const exportCsv = (...a) => impl.exportCsv(...a);

export const isReady = () => ready;
