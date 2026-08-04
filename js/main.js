// エントリポイント：画面の切りかえ・ホーム・レベル選択・段選択・横向き案内
import * as storage from './storage.js';
import * as sounds from './sounds.js';
import { initProfiles, renderProfileList, getCurrentProfile, showProfileError } from './profiles.js';
import { initQuiz, startQuiz, abortQuiz, pauseQuiz, resumeQuiz } from './quiz.js';
import { initGridMode, startGrid, abortGrid, pauseGrid, resumeGrid } from './gridmode.js';
import { initSortMode, startSort, abortSort, pauseSort, resumeSort } from './sortmode.js';
import { initHeatmap, refreshHeatmap } from './heatmap.js';
import { initTeacher } from './teacher.js';
import { LEVELS, getLevel, GRID_LEVELS, getGridLevel } from './constants.js';

const $ = (id) => document.getElementById(id);

// ── アプリ全体の状態 ────────────────────────────────────────
let settings = null;      // { timeLimitSec, muted }
let profile = null;       // いま選ばれている子
let pendingLevel = null;  // 段選択中のレベル
let selectedDans = [];    // 段選択中に選ばれている段
let currentScreen = null;

const SCREEN_IDS = {
  profile: 'screen-profile',
  home: 'screen-home',
  level: 'screen-level',
  dan: 'screen-dan',
  play: 'screen-play',
  result: 'screen-result',
  gridLevel: 'screen-grid-level',
  grid: 'screen-grid',
  sortDan: 'screen-sort-dan',
  sort: 'screen-sort',
  heatmap: 'screen-heatmap',
  teacher: 'screen-teacher',
};

/** 画面を切りかえる */
function showScreen(name) {
  // プレイ中に別の画面へ移るときは、進行中のセッションを捨てる
  if (currentScreen === 'play' && name !== 'play' && name !== 'result') abortQuiz();
  if (currentScreen === 'grid' && name !== 'grid') abortGrid();
  if (currentScreen === 'sort' && name !== 'sort') abortSort();
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    $(id).hidden = key !== name;
  }
  currentScreen = name;
}

// ── 起動 ────────────────────────────────────────────────────

async function boot() {
  // どこに保存するか（この端末 or スプレッドシート）を ここで決める
  const { error: storageError } = await storage.initStorage();

  settings = await storage.getSettings();
  sounds.setMuted(settings.muted);

  initProfiles({ onChoose: onProfileChosen });
  initQuiz({
    showScreen,
    onQuit: () => goHome(),
  });
  initGridMode({
    showScreen,
    onHome: () => goHome(),
    onLevelSelect: () => showScreen('gridLevel'),
  });
  initSortMode({
    showScreen,
    onHome: () => goHome(),
    onDanSelect: () => showScreen('sortDan'),
  });
  initHeatmap();
  initTeacher({
    showScreen,
    getSettings: () => settings,
    getProfileId: () => (profile ? profile.id : null),
    onSettingsChanged: (s) => { settings = s; },
    onProfilesChanged: onProfilesChanged,
    onClose: () => goHome(),
  });

  setupHome();
  setupLevelScreen();
  setupDanScreen();
  setupGridLevelScreen();
  setupSortDanScreen();
  setupResultButtons();
  setupHeatmapScreen();
  setupOrientation();
  setupAudioUnlock();
  registerServiceWorker();

  // ローカルモードなら、前回えらんだ子のままホームから始める。
  // シートモードでは 端末に名前を残さないので、毎回 名前えらびから始まる。
  profile = await getCurrentProfile();
  if (profile) {
    updateHomeHeader();
    showScreen('home');
  } else {
    await renderProfileList();
    if (storageError) showProfileError(`めいぼを よみこめませんでした\n${storageError}`);
    showScreen('profile');
  }
}

// ── プロフィール ────────────────────────────────────────────

async function onProfileChosen(id) {
  const list = await storage.getProfiles();
  profile = list.find((p) => p.id === id) || null;
  updateHomeHeader();
  goHome();
}

/** せんせいメニューでプロフィールが増減したとき */
async function onProfilesChanged() {
  profile = await getCurrentProfile();
  updateHomeHeader();
}

function updateHomeHeader() {
  $('home-name').textContent = profile ? profile.name : '（だれ？）';
}

async function goHome() {
  if (!profile) {
    await renderProfileList();
    showScreen('profile');
    return;
  }
  updateHomeHeader();
  showScreen('home');
}

// ── ホーム ──────────────────────────────────────────────────

function setupHome() {
  $('home-name-btn').addEventListener('click', async () => {
    await renderProfileList();
    showScreen('profile');
  });

  $('home-start').addEventListener('click', () => showScreen('level'));
  $('home-grid').addEventListener('click', () => showScreen('gridLevel'));
  $('home-sort').addEventListener('click', () => showScreen('sortDan'));

  $('home-heatmap').addEventListener('click', async () => {
    await refreshHeatmap(profile.id);
    showScreen('heatmap');
  });

  const mute = $('mute-btn');
  const paintMute = () => {
    mute.textContent = settings.muted ? '🔇 おと なし' : '🔊 おと あり';
    mute.classList.toggle('is-muted', settings.muted);
  };
  mute.addEventListener('click', async () => {
    settings = await storage.saveSettings({ ...settings, muted: !settings.muted });
    sounds.setMuted(settings.muted);
    paintMute();
    if (!settings.muted) sounds.playTap();
  });
  paintMute();
}

// ── レベル選択 ──────────────────────────────────────────────

function setupLevelScreen() {
  const box = $('level-list');
  box.innerHTML = '';
  for (const lv of LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-card';
    if (lv.id === 'master') btn.classList.add('is-master');
    if (lv.id === 99) btn.classList.add('is-99');
    btn.dataset.level = lv.id;
    btn.innerHTML =
      `<span class="lv-label">${lv.label}</span>`
      + `<span class="lv-title">${lv.title}</span>`
      + `<span class="lv-desc">${lv.desc}</span>`
      + `<span class="lv-meta">${lv.count}もん・${lv.timed ? 'せいげん時間 あり' : 'せいげん時間 なし'}</span>`;
    btn.addEventListener('click', () => chooseLevel(lv.id));
    box.appendChild(btn);
  }
  $('level-back').addEventListener('click', () => goHome());
}

function chooseLevel(id) {
  const level = getLevel(id);
  if (!level) return;
  if (level.dansRequired === 0) {
    // レベル99・九九マスターは段をえらばず、そのまま始める
    startQuiz({ level, dans: null, profileId: profile.id, settings });
    return;
  }
  pendingLevel = level;
  selectedDans = [];
  renderDanScreen();
  showScreen('dan');
}

// ── 段の選択 ────────────────────────────────────────────────

function setupDanScreen() {
  const box = $('dan-list');
  box.innerHTML = '';
  for (let d = 1; d <= 9; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dan-btn';
    btn.dataset.dan = d;
    btn.innerHTML = `<span class="dan-num">${d}</span><span class="dan-unit">の だん</span>`;
    btn.addEventListener('click', () => toggleDan(d));
    box.appendChild(btn);
  }
  $('dan-start').addEventListener('click', () => {
    if (selectedDans.length !== pendingLevel.dansRequired) return;
    startQuiz({ level: pendingLevel, dans: selectedDans, profileId: profile.id, settings });
  });
  $('dan-back').addEventListener('click', () => showScreen('level'));
}

function toggleDan(d) {
  const need = pendingLevel.dansRequired;
  const at = selectedDans.indexOf(d);
  if (at >= 0) {
    selectedDans.splice(at, 1);
  } else if (need === 1) {
    selectedDans = [d];              // 1つだけのときは 選びなおし
  } else if (selectedDans.length < need) {
    selectedDans.push(d);
  } else {
    return;                          // もう必要な数だけ選ばれている
  }
  renderDanScreen();
  sounds.playTap();
}

function renderDanScreen() {
  const need = pendingLevel.dansRequired;
  $('dan-title').textContent = need === 1 ? 'だんを 1つ えらんでね' : 'だんを 3つ えらんでね';
  $('dan-level').textContent = pendingLevel.label;
  $('dan-count').textContent = `${selectedDans.length} / ${need}`;

  for (const btn of $('dan-list').querySelectorAll('.dan-btn')) {
    btn.classList.toggle('is-on', selectedDans.includes(Number(btn.dataset.dan)));
  }
  // 必要な数だけ選ぶまで「はじめる」は押せない
  $('dan-start').disabled = selectedDans.length !== need;
}

// ── モード② 九九マス計算：レベル選択 ──────────────────────

function setupGridLevelScreen() {
  const box = $('grid-level-list');
  box.innerHTML = '';
  for (const lv of GRID_LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-card';
    if (lv.id === 'X') btn.classList.add('is-master');
    btn.dataset.level = lv.id;
    btn.innerHTML =
      `<span class="lv-label">${lv.label}</span>`
      + `<span class="lv-title">${lv.title}</span>`
      + `<span class="lv-desc">${lv.desc}</span>`
      + `<span class="lv-meta">${lv.hideHeaders ? '64' : '81'}マス</span>`;
    btn.addEventListener('click', () => {
      const level = getGridLevel(lv.id);
      if (level) startGrid({ level, profileId: profile.id });
    });
    box.appendChild(btn);
  }
  $('grid-level-back').addEventListener('click', () => goHome());
}

// ── モード③ 九九ならべ：段の選択 ──────────────────────────

function setupSortDanScreen() {
  const box = $('sort-dan-list');
  box.innerHTML = '';
  for (let d = 1; d <= 9; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dan-btn';
    btn.innerHTML = `<span class="dan-num">${d}</span><span class="dan-unit">の だん</span>`;
    btn.addEventListener('click', () => startSort({ dan: d, profileId: profile.id }));
    box.appendChild(btn);
  }
  $('sort-dan-back').addEventListener('click', () => goHome());
}

// ── 結果画面のボタン ────────────────────────────────────────

function setupResultButtons() {
  $('btn-level').addEventListener('click', () => showScreen('level'));
  $('btn-home').addEventListener('click', () => goHome());
}

// ── 九九ひょう ──────────────────────────────────────────────

function setupHeatmapScreen() {
  $('heat-back').addEventListener('click', () => goHome());
}

// ── 計測の一時停止 ──────────────────────────────────────────
// 「縦向きになった」「アプリが うしろに かくれた」など、
// 止める理由が1つでも あるあいだは タイマーを止めておく。
const pauseReasons = new Set();

function setPause(reason, on) {
  if (on) pauseReasons.add(reason);
  else pauseReasons.delete(reason);
  // どのモードが動いていても止まるように、まとめて呼ぶ
  // （それぞれ、進行中でなければ何もしない）
  if (pauseReasons.size > 0) { pauseQuiz(); pauseGrid(); pauseSort(); }
  else { resumeQuiz(); resumeGrid(); resumeSort(); }
}

// ── 横向き案内 ──────────────────────────────────────────────

function setupOrientation() {
  const overlay = $('orientation-overlay');
  const check = () => {
    const portrait = window.innerHeight > window.innerWidth;
    overlay.hidden = !portrait;
    // プレイ中に縦になったら計測を止める
    setPause('portrait', portrait);
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 100));
  check();

  // ほかのアプリに切りかえられたときも止める。
  // （止めないと、もどってきたしゅんかんに時間切れになってしまう）
  document.addEventListener('visibilitychange', () => {
    setPause('hidden', document.hidden);
  });
}

// ── iOS で音を出せるようにする ──────────────────────────────

function setupAudioUnlock() {
  const unlock = () => {
    sounds.initAudio();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: false });
}

// ── Service Worker ──────────────────────────────────────────

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // ローカルでファイルを直接ひらいた場合
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('[sw] とうろくに しっぱい', e);
    });
  });
}

boot();
