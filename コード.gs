/**
 * 九九チャレンジ ─ Google Apps Script（スプレッドシート側）
 * ============================================================
 * このファイルの中身を、スプレッドシートの
 *   拡張機能 ▸ Apps Script
 * に貼りつけて、ウェブアプリとしてデプロイしてください。
 *
 * デプロイの設定（ここを間違えると動きません）
 *   種類            : ウェブアプリ
 *   次のユーザーとして実行 : 自分
 *   アクセスできるユーザー : 全員
 *
 * デプロイ後に出る URL（.../exec で終わるもの）を
 * アプリの js/config.js の GAS_URL に貼りつけます。
 *
 * ★ コードを直したときは「新しいバージョン」でデプロイし直してください。
 *   （既存のデプロイを編集 ▸ バージョン「新バージョン」）
 * ============================================================
 */

// ── シート名 ─────────────────────────────────────────────
const SHEET_ROSTER   = '名簿';
const SHEET_ATTEMPTS = 'きろく';
const SHEET_SESSIONS = 'セッション';

// ── 合言葉（任意）────────────────────────────────────────
// 空のままなら 誰でも読み書きできます。
// 値を入れた場合は、アプリ側の config.js にも同じ文字列が必要になるため、
// まずは空のまま運用し、必要になってから設定してください。
const SECRET = '';

// ════════════════════════════════════════════════════════
// 読みこみ（GET）
// ════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (SECRET && p.secret !== SECRET) return json({ error: 'あいことばが ちがいます' });

    if (p.action === 'roster') return json({ profiles: readRoster() });
    if (p.action === 'history') return json(readHistory(String(p.id || '')));
    return json({ error: 'action が ふめいです' });
  } catch (err) {
    return json({ error: String(err && err.message || err) });
  }
}

/** 名簿シートを読む。「つかう」が FALSE の行はとばす */
function readRoster() {
  const sh = mustSheet(SHEET_ROSTER);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const head = values[0].map(String);
  const iId = head.indexOf('ID');
  const iName = head.indexOf('なまえ');
  const iUse = head.indexOf('つかう');
  if (iId < 0 || iName < 0) throw new Error('名簿シートに「ID」「なまえ」の列が必要です');

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(row[iId]).trim();
    const name = String(row[iName]).trim();
    if (!id || !name) continue;
    if (iUse >= 0 && row[iUse] === false) continue;
    out.push({ id: id, name: name });
  }
  return out;
}

/** その子の 過去の記録を読む（古い順で返す） */
function readHistory(id) {
  if (!id) return { attempts: [], sessions: [] };

  const attempts = [];
  const shA = getSheet(SHEET_ATTEMPTS);
  if (shA && shA.getLastRow() > 1) {
    const v = shA.getDataRange().getValues();
    const h = v[0].map(String);
    const c = colIndex(h, ['日時', 'ID', 'モード', 'レベル', 'a', 'b', 'にゅうりょく', 'せいご', 'じかんぎれ', 'そうきじかん', 'ごうけいじかん']);
    for (let r = 1; r < v.length; r++) {
      if (String(v[r][c['ID']]).trim() !== id) continue;
      attempts.push({
        ts: toMillis(v[r][c['日時']]),
        mode: String(v[r][c['モード']]),
        level: normalizeLevel(v[r][c['レベル']]),
        a: Number(v[r][c['a']]),
        b: Number(v[r][c['b']]),
        given: v[r][c['にゅうりょく']] === '' ? null : Number(v[r][c['にゅうりょく']]),
        correct: v[r][c['せいご']] === 1 || v[r][c['せいご']] === true,
        timedOut: v[r][c['じかんぎれ']] === 1 || v[r][c['じかんぎれ']] === true,
        latencyMs: v[r][c['そうきじかん']] === '' ? null : Number(v[r][c['そうきじかん']]),
        totalMs: v[r][c['ごうけいじかん']] === '' ? null : Number(v[r][c['ごうけいじかん']]),
      });
    }
  }

  const sessions = [];
  const shS = getSheet(SHEET_SESSIONS);
  if (shS && shS.getLastRow() > 1) {
    const v = shS.getDataRange().getValues();
    const h = v[0].map(String);
    const c = colIndex(h, ['日時', 'ID', 'モード', 'レベル', 'だん', 'もんすう', 'せいかいすう', 'かかった時間', 'さいだいれんぞく', 'とうたつすう']);
    for (let r = 1; r < v.length; r++) {
      if (String(v[r][c['ID']]).trim() !== id) continue;
      const s = {
        ts: toMillis(v[r][c['日時']]),
        mode: String(v[r][c['モード']]),
        level: normalizeLevel(v[r][c['レベル']]),
        dans: v[r][c['だん']] === '' ? null : String(v[r][c['だん']]).split('・').map(Number),
        total: Number(v[r][c['もんすう']]),
        correctCount: Number(v[r][c['せいかいすう']]),
        elapsedMs: Number(v[r][c['かかった時間']]),
      };
      if (v[r][c['さいだいれんぞく']] !== '') s.maxStreak = Number(v[r][c['さいだいれんぞく']]);
      if (v[r][c['とうたつすう']] !== '') s.reachedCount = Number(v[r][c['とうたつすう']]);
      sessions.push(s);
    }
  }

  return { attempts: attempts, sessions: sessions };
}

// ════════════════════════════════════════════════════════
// 書きこみ（POST）
// ════════════════════════════════════════════════════════

function doPost(e) {
  // 同時に何台からも来るので、順番待ちをさせる
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ error: 'こんでいます。あとでもう一度おくります' });
  }

  try {
    const body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) return json({ error: 'あいことばが ちがいます' });

    const id = String(body.profileId || '');
    if (!id) return json({ error: 'ID が ありません' });
    const name = nameOf(id);

    // ── 1問ごとの記録 ──
    const attempts = body.attempts || [];
    if (attempts.length > 0) {
      const sh = mustSheet(SHEET_ATTEMPTS);
      const rows = attempts.map(function (at) {
        return [
          new Date(at.ts), id, name,
          at.mode, String(at.level),
          at.a, at.b, at.a * at.b,
          at.given === null || at.given === undefined ? '' : at.given,
          at.correct ? 1 : 0,
          at.timedOut ? 1 : 0,
          at.latencyMs === null || at.latencyMs === undefined ? '' : at.latencyMs,
          at.totalMs === null || at.totalMs === undefined ? '' : at.totalMs,
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    // ── セッションの記録 ──
    const s = body.session;
    if (s) {
      const sh = mustSheet(SHEET_SESSIONS);
      sh.appendRow([
        new Date(s.ts), id, name,
        s.mode, String(s.level),
        s.dans ? s.dans.join('・') : '',
        s.total, s.correctCount, s.elapsedMs,
        s.maxStreak === undefined ? '' : s.maxStreak,
        s.reachedCount === undefined ? '' : s.reachedCount,
      ]);
    }

    return json({ ok: true, saved: attempts.length });
  } catch (err) {
    return json({ error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════════════
// 補助
// ════════════════════════════════════════════════════════

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function mustSheet(name) {
  const sh = getSheet(name);
  if (!sh) throw new Error('シート「' + name + '」が見つかりません');
  return sh;
}

/** ID から なまえを引く（記録シートを人が読めるようにするため） */
function nameOf(id) {
  const list = readRoster();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i].name;
  }
  return '';
}

function colIndex(head, names) {
  const map = {};
  for (let i = 0; i < names.length; i++) {
    map[names[i]] = head.indexOf(names[i]);
  }
  return map;
}

function toMillis(v) {
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

/** レベルは 1〜5・99 は数値、master・X は文字列のまま */
function normalizeLevel(v) {
  const s = String(v);
  return /^[0-9]+$/.test(s) ? Number(s) : s;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════
// 動作チェック用（エディタ上で実行して、ログを見てください）
// ════════════════════════════════════════════════════════

function テスト_名簿を読む() {
  Logger.log(JSON.stringify(readRoster(), null, 2));
}

function テスト_シートがそろっているか() {
  const names = [SHEET_ROSTER, SHEET_ATTEMPTS, SHEET_SESSIONS];
  for (let i = 0; i < names.length; i++) {
    Logger.log(names[i] + ' : ' + (getSheet(names[i]) ? 'OK' : '★ありません★'));
  }
}
