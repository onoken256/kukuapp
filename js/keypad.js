// 数字キーパッド
// ─────────────────────────────────────────────────────────────
// 電卓配列。位置は絶対に固定で、レベルや問題によって変わらない。
// 画面の右がわに置き、左がわに問題を出す（指で問題が隠れないため）。
//
// 押した判定は pointerdown で取る。click（＝指をはなしたとき）だと
// 押している時間が latencyMs に混ざってしまうため。
// ─────────────────────────────────────────────────────────────

// [ラベル, 種類, 値, 横に何マスぶんか, 追加class]
const LAYOUT = [
  ['7', 'digit', 7, 1, ''],
  ['8', 'digit', 8, 1, ''],
  ['9', 'digit', 9, 1, ''],
  ['4', 'digit', 4, 1, ''],
  ['5', 'digit', 5, 1, ''],
  ['6', 'digit', 6, 1, ''],
  ['1', 'digit', 1, 1, ''],
  ['2', 'digit', 2, 1, ''],
  ['3', 'digit', 3, 1, ''],
  ['0', 'digit', 0, 2, ''],
  ['けす', 'delete', null, 1, 'key-delete'],
  ['けってい', 'enter', null, 3, 'key-enter'],
];

/**
 * キーパッドを組み立てる。組み立ては1回だけで、以後 DOM は作り直さない。
 * @param {HTMLElement} container
 * @param {object} handlers onDigit(n) / onDelete() / onEnter()
 */
export function createKeypad(container, { onDigit, onDelete, onEnter }) {
  container.innerHTML = '';
  container.classList.add('keypad');

  const fire = (type, value) => {
    if (container.dataset.disabled === 'true') return;
    if (type === 'digit') onDigit && onDigit(value);
    else if (type === 'delete') onDelete && onDelete();
    else if (type === 'enter') onEnter && onEnter();
  };

  for (const [label, type, value, span, extra] of LAYOUT) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `key ${extra}`.trim();
    btn.textContent = label;
    btn.style.gridColumn = `span ${span}`;
    btn.dataset.type = type;
    if (type === 'enter') btn.dataset.role = 'enter';

    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); // ゴーストクリックと文字選択をふせぐ
      if (btn.disabled) return;
      fire(type, value);
    });
    // pointerdown を preventDefault しているので click は基本とばない。
    // マウス以外の入力手段の保険として、キーボード操作だけ拾う。
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        fire(type, value);
      }
    });

    container.appendChild(btn);
  }

  // パソコンで動作確認するとき用のキーボード操作
  const onKeyDown = (ev) => {
    if (container.dataset.disabled === 'true') return;
    if (container.closest('[hidden]')) return;
    if (ev.key >= '0' && ev.key <= '9') { fire('digit', Number(ev.key)); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { fire('delete'); ev.preventDefault(); }
    else if (ev.key === 'Enter') { fire('enter'); ev.preventDefault(); }
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    /** 入力を受けつけるかどうか */
    setEnabled(enabled) {
      container.dataset.disabled = enabled ? 'false' : 'true';
      container.classList.toggle('is-disabled', !enabled);
    },
    /** 「けってい」ボタンだけを押せなくする（入力が空のとき用） */
    setEnterEnabled(enabled) {
      const btn = container.querySelector('[data-role="enter"]');
      if (btn) btn.disabled = !enabled;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
