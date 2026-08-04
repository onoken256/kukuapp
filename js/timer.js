// 制限時間と時間の計測
// ─────────────────────────────────────────────────────────────
// 1問につき2つの時間を計る。
//   latencyMs : 問題表示 →「最初の数字ボタン」を押すまで（想起時間）
//   totalMs   : 問題表示 →「けってい」を押すまで（制限時間の判定に使う）
// 画面が縦向きになったら pause() で止め、横向きに戻ったら resume()。
// 止まっていた時間は latencyMs / totalMs / 制限時間のすべてから差し引かれる。
// ─────────────────────────────────────────────────────────────

/**
 * ただの ストップウォッチ。
 * 九九マス計算・九九ならべのように、制限時間がなく
 * 「ぜんぶ終わるまで何分かかったか」を計るモードで使う。
 * 縦向き・アプリ切りかえで止まっていた時間は差し引かれる。
 */
export function createStopwatch() {
  let startAt = 0;
  let pausedAt = null;
  let pausedTotal = 0;
  let running = false;
  let frozen = null;

  const now = () => performance.now();

  function elapsed() {
    if (frozen !== null) return frozen;
    if (!running) return 0;
    const base = pausedAt !== null ? pausedAt : now();
    return base - startAt - pausedTotal;
  }

  return {
    start() {
      startAt = now();
      pausedAt = null;
      pausedTotal = 0;
      frozen = null;
      running = true;
    },
    elapsed,
    pause() { if (running && pausedAt === null) pausedAt = now(); },
    resume() {
      if (pausedAt !== null) { pausedTotal += now() - pausedAt; pausedAt = null; }
    },
    stop() { const e = elapsed(); frozen = e; running = false; return e; },
    isRunning() { return running && frozen === null; },
  };
}

/**
 * @param {object} handlers
 *   onTick(ratio)  残り時間の割合 1→0。制限時間なしのときは呼ばれない
 *   onTimeout()    時間切れになったとき
 */
export function createQuestionTimer({ onTick, onTimeout } = {}) {
  let startAt = 0;          // 問題を出した時刻
  let limitMs = null;       // 制限時間（null なら無制限）
  let firstInputAt = null;  // 最初の数字ボタンまでの経過ms
  let pausedAt = null;      // 一時停止を始めた時刻
  let pausedTotal = 0;      // 止まっていた合計
  let frozenElapsed = null; // 時間切れ・停止時に固定した経過ms
  let rafId = null;
  let running = false;

  const now = () => performance.now();

  /** 止まっていた時間を除いた経過ms */
  function elapsed() {
    if (frozenElapsed !== null) return frozenElapsed;
    const base = pausedAt !== null ? pausedAt : now();
    return base - startAt - pausedTotal;
  }

  function loop() {
    if (!running) return;
    const e = elapsed();
    if (limitMs !== null) {
      if (e >= limitMs) {
        // 時間切れ。経過を制限時間ちょうどに固定してから通知する
        frozenElapsed = limitMs;
        running = false;
        rafId = null;
        if (onTick) onTick(0);
        if (onTimeout) onTimeout();
        return;
      }
      if (onTick) onTick(1 - e / limitMs);
    }
    rafId = requestAnimationFrame(loop);
  }

  return {
    /** 計測開始。limit は ms、無制限なら null */
    start(limit = null) {
      limitMs = limit;
      startAt = now();
      firstInputAt = null;
      pausedAt = null;
      pausedTotal = 0;
      frozenElapsed = null;
      running = true;
      if (onTick) onTick(1);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    },

    /** 数字ボタンが押されたとき。最初の1回だけ latency を確定する */
    markInput() {
      if (running && firstInputAt === null && pausedAt === null) {
        firstInputAt = elapsed();
      }
    },

    /** 計測を止めて結果を返す */
    stop() {
      const e = elapsed();
      if (frozenElapsed === null) frozenElapsed = e;
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      return {
        latencyMs: firstInputAt === null ? null : Math.round(firstInputAt),
        totalMs: Math.round(frozenElapsed),
      };
    },

    /** 縦向きになったときなどに止める */
    pause() {
      if (running && pausedAt === null) {
        pausedAt = now();
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      }
    },

    /** 横向きに戻ったら再開する */
    resume() {
      if (pausedAt !== null) {
        pausedTotal += now() - pausedAt;
        pausedAt = null;
        if (running && rafId === null) rafId = requestAnimationFrame(loop);
      }
    },

    isRunning() { return running; },
    hasLimit() { return limitMs !== null; },
  };
}
