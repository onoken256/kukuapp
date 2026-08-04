// 九九チャレンジ ─ アプリ全体で使う定数
// しきい値や制限時間の調整は、すべてこのファイルだけを触れば済むようにしてある。

// ── 習得状況（ヒートマップ）の判定 ────────────────────────────
/** 直近なん回の記録で習得状況を判定するか */
export const MASTERY_WINDOW = 3;
/** これ以下の想起時間(latencyMs)なら「すばやく答えられた」とみなす */
export const FAST_LATENCY_MS = 1500;
/** マスをタップしたときに履歴を何回分見せるか */
export const HISTORY_VIEW_COUNT = 5;

// ── 制限時間 ────────────────────────────────────────────────
/** せんせいメニューで選べる制限時間（秒） */
export const TIME_LIMIT_OPTIONS = [3, 4, 5, 7];
/** 既定の制限時間（秒） */
export const DEFAULT_TIME_LIMIT_SEC = 5;

// ── 保存 ────────────────────────────────────────────────────
/** 1プロフィールあたりに保持する attempt の最大件数（古いものから捨てる） */
export const ATTEMPT_LIMIT = 3000;
/** 1プロフィールあたりに保持する session の最大件数 */
export const SESSION_LIMIT = 500;

// ── 画面のふるまい ──────────────────────────────────────────
/** 正解したあと、つぎの問題に進むまでの間（ms） */
export const CORRECT_PAUSE_MS = 800;
/** 九九マスターへの挑戦が終わるとき、正答を見せておく時間（ms） */
export const MASTER_FAIL_PAUSE_MS = 1200;
/** せんせいメニューを開く長押しの時間（ms） */
export const TEACHER_HOLD_MS = 1500;

// ── レベル定義 ──────────────────────────────────────────────
// dansRequired : 段選択画面で選ばせる段の数（0 なら段選択をスキップ）
// order        : 'seq' = 1〜9の順 / 'random' = ランダム
// timed        : 制限時間を使うか
// count        : 出題数
// stopOnFail   : 1回でも失敗したら即終了するか
// streak       : 連続正解数を記録・表示するか
export const LEVELS = [
  {
    id: 1, label: 'レベル1', title: 'ひとつの だん・じゅんばん',
    desc: 'えらんだ だんを 1から9の じゅんに 9もん',
    dansRequired: 1, order: 'seq', timed: false, count: 9,
    stopOnFail: false, streak: false,
  },
  {
    id: 2, label: 'レベル2', title: 'ひとつの だん・じゅんばん・じかん あり',
    desc: 'レベル1に せいげん時間が つく',
    dansRequired: 1, order: 'seq', timed: true, count: 9,
    stopOnFail: false, streak: false,
  },
  {
    id: 3, label: 'レベル3', title: 'ひとつの だん・ばらばら',
    desc: 'えらんだ だんを ばらばらの じゅんに 9もん',
    dansRequired: 1, order: 'random', timed: false, count: 9,
    stopOnFail: false, streak: false,
  },
  {
    id: 4, label: 'レベル4', title: 'みっつの だん・ばらばら',
    desc: 'えらんだ 3つの だんを ばらばらに 27もん',
    dansRequired: 3, order: 'random', timed: false, count: 27,
    stopOnFail: false, streak: false,
  },
  {
    id: 5, label: 'レベル5', title: 'みっつの だん・ばらばら・じかん あり',
    desc: 'レベル4に せいげん時間が つく',
    dansRequired: 3, order: 'random', timed: true, count: 27,
    stopOnFail: false, streak: false,
  },
  {
    id: 99, label: 'レベル99', title: 'ぜんぶの 九九・81もん',
    desc: '81もん ぜんぶ。れんぞく せいかいの きろくが のこる',
    dansRequired: 0, order: 'random', timed: true, count: 81,
    stopOnFail: false, streak: true,
  },
  {
    id: 'master', label: '九九マスター', title: '九九マスターへの ちょうせん',
    desc: '1つでも まちがえたら そこで おわり。どこまで いけるか',
    dansRequired: 0, order: 'random', timed: true, count: 81,
    stopOnFail: true, streak: false,
  },
];

/** レベルIDから定義を引く（モード①） */
export function getLevel(id) {
  return LEVELS.find((lv) => String(lv.id) === String(id)) || null;
}

// ── モード②「九九マス計算」のレベル定義 ────────────────────
// 100マス計算と同じで、外がわの見出しの数がならびかえられる。
//   rowShuffle : ひだりの見出し（かけられる数）を ばらばらにする
//   colShuffle : うえの見出し（かける数）を ばらばらにする
//   hideHeaders: 外がわの見出しを消す（レベルX）
export const GRID_LEVELS = [
  {
    id: 1, label: 'レベル1', title: '九九の じゅんばん',
    desc: 'ひだりも うえも 1から9の じゅん',
    rowShuffle: false, colShuffle: false, hideHeaders: false,
  },
  {
    id: 2, label: 'レベル2', title: 'ひだりが ばらばら',
    desc: 'ひだりの 数が ばらばらの じゅん',
    rowShuffle: true, colShuffle: false, hideHeaders: false,
  },
  {
    id: 3, label: 'レベル3', title: 'うえが ばらばら',
    desc: 'うえの 数が ばらばらの じゅん',
    rowShuffle: false, colShuffle: true, hideHeaders: false,
  },
  {
    id: 4, label: 'レベル4', title: 'どちらも ばらばら',
    desc: 'ひだりも うえも ばらばらの じゅん',
    rowShuffle: true, colShuffle: true, hideHeaders: false,
  },
  {
    id: 'X', label: 'レベルX', title: 'ヒント なし',
    desc: '外がわの 数が きえる。1の だんと 1の れつだけが ヒント',
    rowShuffle: false, colShuffle: false, hideHeaders: true,
  },
];

/** レベルIDから定義を引く（モード②） */
export function getGridLevel(id) {
  return GRID_LEVELS.find((lv) => String(lv.id) === String(id)) || null;
}
