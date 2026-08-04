// かくにんダイアログ
// ─────────────────────────────────────────────────────────────
// ブラウザの confirm() は使わない。
// iPadOS の PWA（ホーム画面に追加した状態）などでは、confirm() が
// 何も表示せずに false を返してしまい、ボタンが効かなくなるため。
// ─────────────────────────────────────────────────────────────

let root = null;
let els = {};
let resolveFn = null;

function build() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'dialog-backdrop';
  root.hidden = true;
  root.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true">
      <p class="dialog-title"></p>
      <p class="dialog-message"></p>
      <div class="dialog-buttons">
        <button type="button" class="btn-ghost btn-big dialog-cancel"></button>
        <button type="button" class="btn-primary btn-big dialog-ok"></button>
      </div>
    </div>`;
  document.body.appendChild(root);

  els = {
    title: root.querySelector('.dialog-title'),
    message: root.querySelector('.dialog-message'),
    ok: root.querySelector('.dialog-ok'),
    cancel: root.querySelector('.dialog-cancel'),
  };

  els.ok.addEventListener('click', () => close(true));
  els.cancel.addEventListener('click', () => close(false));
  // 背景をタップしたら「やめる」あつかい
  root.addEventListener('click', (ev) => { if (ev.target === root) close(false); });
}

function close(result) {
  root.hidden = true;
  const fn = resolveFn;
  resolveFn = null;
  if (fn) fn(result);
}

/**
 * はい／いいえ を たずねる。await で答えが返る。
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = 'かくにん',
  message = '',
  okLabel = 'はい',
  cancelLabel = 'やめる',
  danger = false,
} = {}) {
  build();
  // 二重に開かないよう、前のものは「いいえ」で閉じる
  if (resolveFn) close(false);

  els.title.textContent = title;
  els.message.textContent = message;
  els.message.hidden = !message;
  els.ok.textContent = okLabel;
  els.cancel.textContent = cancelLabel;
  els.ok.className = `${danger ? 'btn-danger' : 'btn-primary'} btn-big dialog-ok`;
  root.hidden = false;

  return new Promise((resolve) => { resolveFn = resolve; });
}

/** いま開いているか（プレイ中の一時停止はんていに使う） */
export function isDialogOpen() {
  return !!resolveFn;
}
