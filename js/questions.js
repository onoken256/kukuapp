// 出題順の生成
// レベル定義と選んだ段から、その回に出す問題の並びをつくる。

/** Fisher-Yates で並べかえる（元の配列は変えない） */
export function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 九九 81通りすべて */
export function allQuestions() {
  const out = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) out.push({ a, b });
  }
  return out;
}

/** ひとつの段（a固定、b が 1〜9） */
export function questionsOfDan(dan) {
  const out = [];
  for (let b = 1; b <= 9; b++) out.push({ a: dan, b });
  return out;
}

/**
 * その回に出す問題の並びをつくる。
 * @param {object} level constants.js の LEVELS の要素
 * @param {number[]|null} dans 選んだ段。全段のときは null
 * @returns {Array<{a:number,b:number}>}
 */
export function buildQuestions(level, dans) {
  let list;
  if (level.dansRequired === 0) {
    // 全81通り
    list = allQuestions();
  } else {
    const chosen = (dans || []).slice(0, level.dansRequired);
    list = chosen.flatMap((d) => questionsOfDan(d));
  }
  if (level.order === 'random') list = shuffle(list);
  // count より多いことは無いはずだが、念のため切りそろえる
  return list.slice(0, level.count);
}
