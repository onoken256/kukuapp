// せってい
// ─────────────────────────────────────────────────────────────
// GAS_URL に Google Apps Script のウェブアプリURLを入れると、
// スプレッドシートを データベースとして使う「シートモード」になる。
//
//   空のまま  … ローカルモード。この iPad の中だけに記録が残る。
//               名前もこの端末に保存される（開発・おためし用）。
//   URLあり   … シートモード。名簿はシートから読み、記録はシートに書く。
//               **子どもの名前は この端末に一切保存されない。**
//
// デプロイ手順は `スプレッドシート作成プロンプト.md` を見てください。
// ─────────────────────────────────────────────────────────────

export const GAS_URL = 'https://script.google.com/macros/s/AKfycbzhnBNuLhYckQs3cVgorrx7v6NDygCGORuwCXrftuqr20WVMIRuqJfWzn5LW9py3o9C/exec';

/** 通信をあきらめるまでの時間（ms）。学校のWi-Fiが遅いときの保険 */
export const FETCH_TIMEOUT_MS = 12000;
