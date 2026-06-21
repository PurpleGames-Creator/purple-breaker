document.addEventListener('DOMContentLoaded', () => {
  const screenHome    = document.getElementById('screen-home');
  const screenGame    = document.getElementById('screen-game');
  const nicknameInput = document.getElementById('nickname');
  const startButton   = document.getElementById('start-button');
  const gameoverOverlay    = document.getElementById('gameover-overlay');
  const gameoverScoreValue = document.getElementById('gameover-score-value');
  const gameoverBadge      = document.getElementById('gameover-badge');
  const retryButton   = document.getElementById('gameover-retry');
  const homeButton    = document.getElementById('gameover-home');
  const scoreEl       = document.getElementById('score-value');
  const livesEl       = document.getElementById('lives-value');
  const moveHint      = document.getElementById('move-hint');
  const quitButton    = document.getElementById('quit-button');
  const pauseButton   = document.getElementById('pause-button');
  const errorBanner   = document.getElementById('error-banner');

  const BEST_KEY = 'purpleBreakerBest';

  let currentGame = null;
  let lastNickname = null;
  let gameoverAnimId = null;
  let demoGame = null;

  // トップ画面の自動プレイデモ（ノーミス）を起動／停止
  const startDemo = () => {
    const demoCanvas = document.getElementById('demo-canvas');
    if (!demoCanvas || typeof BreakerGame === 'undefined') return;
    if (demoGame) { demoGame.destroy(); demoGame = null; }
    demoGame = new BreakerGame({
      fieldEl: demoCanvas,
      scoreEl: null,
      livesEl: null,
      nickname: '',
      startStage: 1,
      demo: true,
    });
    demoGame.start();
  };
  const stopDemo = () => {
    if (demoGame) { demoGame.destroy(); demoGame = null; }
  };

  // エラー表示
  window.showGameError = (msg) => {
    if (!errorBanner) { console.error(msg); return; }
    errorBanner.textContent = String(msg);
    errorBanner.style.display = 'block';
    setTimeout(() => { if (errorBanner.textContent === msg) errorBanner.style.display = 'none'; }, 5000);
  };

  // ダブルタップズーム防止
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // ランキング（◀ ◯◯ランキング ▶ の矢印切替：Purple Jumper と同じ）
  const rankPrevEl = document.getElementById('rank-prev');
  const rankNextEl = document.getElementById('rank-next');
  rankPrevEl?.addEventListener('click', () => {
    currentRankingModeIndex = (currentRankingModeIndex - 1 + rankingModes.length) % rankingModes.length;
    loadTopRanking();
  });
  rankNextEl?.addEventListener('click', () => {
    currentRankingModeIndex = (currentRankingModeIndex + 1) % rankingModes.length;
    loadTopRanking();
  });

  const gameoverComboEl = document.getElementById('gameover-combo');
  const gameoverStageEl = document.getElementById('gameover-stage');

  // ゲームオーバー処理
  const handleGameOver = async ({ nickname, score, maxCombo = 0, stage = 1, loop = 1 }) => {
    // 最大コンボ・到達ステージの表示
    if (gameoverComboEl) gameoverComboEl.textContent = String(maxCombo);
    if (gameoverStageEl) {
      const inLoopStage = ((stage - 1) % 10) + 1;
      gameoverStageEl.textContent = loop > 1 ? `${inLoopStage}（${loop}周目）` : String(inLoopStage);
    }
    // スコアのカウントアップ演出
    if (gameoverScoreValue) {
      if (gameoverAnimId != null) { cancelAnimationFrame(gameoverAnimId); gameoverAnimId = null; }
      const duration = 700;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        gameoverScoreValue.textContent = Math.floor(score * eased);
        if (t < 1) {
          gameoverAnimId = requestAnimationFrame(tick);
        } else {
          gameoverAnimId = null;
          gameoverScoreValue.textContent = score;
        }
      };
      gameoverScoreValue.textContent = '0';
      gameoverAnimId = requestAnimationFrame(tick);
    }

    // ベストスコア判定
    const prev = Number(localStorage.getItem(BEST_KEY) || '0');
    const isNew = score > prev;
    if (isNew) localStorage.setItem(BEST_KEY, String(score));
    if (gameoverBadge) {
      gameoverBadge.textContent = '🎉 自己ベスト更新！ 🎉';
      gameoverBadge.classList.toggle('gameover-badge--hidden', !isNew);
    }

    if (gameoverOverlay) {
      gameoverOverlay.classList.add('gameover-overlay--visible');
      gameoverOverlay.setAttribute('aria-hidden', 'false');
    }

    // 自己ベスト更新なら祝福ジングル＋少し遅れて再生して演出を強調
    if (isNew && currentGame && typeof currentGame._playRecordJingle === 'function') {
      setTimeout(() => currentGame && currentGame._playRecordJingle(), 250);
    }

    // Supabase スコア投稿
    if (typeof submitScore === 'function') {
      const { error } = await submitScore({ nickname, score });
      if (error) console.error('スコア投稿エラー:', error);
    }
  };

  // ゲーム開始
  const startGame = (nickname) => {
    if (currentGame) { currentGame.destroy(); currentGame = null; }

    lastNickname = nickname;
    scoreEl.textContent = '0';
    if (moveHint) moveHint.style.opacity = '1';

    // テスト用：URLの ?stage=2 または #stage=2 で開始ステージを指定できる
    const startStage =
      new URLSearchParams(location.search).get('stage') ||
      new URLSearchParams(location.hash.replace(/^#/, '')).get('stage');

    currentGame = new BreakerGame({
      fieldEl: document.getElementById('game-field'),
      scoreEl,
      livesEl,
      nickname,
      startStage,
      onGameOver: handleGameOver,
    });
    currentGame.start();
  };

  startButton.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) { alert('ニックネームを入力してください。'); nicknameInput.focus(); return; }

    stopDemo(); // 本編開始時はデモを止める
    screenHome.classList.remove('screen--active');
    screenGame.classList.add('screen--active');
    startGame(nickname);
  });

  const hideGameover = () => {
    if (gameoverOverlay) {
      gameoverOverlay.classList.remove('gameover-overlay--visible');
      gameoverOverlay.setAttribute('aria-hidden', 'true');
    }
  };

  const backToHome = () => {
    hideGameover();
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    screenGame.classList.remove('screen--active');
    screenHome.classList.add('screen--active');
    loadTopRanking();
    startDemo(); // トップに戻ったらデモ再開
  };

  retryButton?.addEventListener('click', () => {
    hideGameover();
    startGame(lastNickname || nicknameInput.value.trim());
  });

  homeButton?.addEventListener('click', backToHome);

  // 家ボタン：誤操作防止に確認ダイアログを出す（その間ゲームを一時停止）
  const confirmOverlay = document.getElementById('confirm-overlay');
  const confirmYes = document.getElementById('confirm-yes');
  const confirmNo = document.getElementById('confirm-no');
  let wasPausedBeforeConfirm = false;

  const showQuitConfirm = () => {
    wasPausedBeforeConfirm = currentGame ? currentGame.isPaused : false;
    if (currentGame && !currentGame.isPaused) currentGame.togglePause();
    confirmOverlay?.classList.add('gameover-overlay--visible');
    confirmOverlay?.setAttribute('aria-hidden', 'false');
  };
  const hideQuitConfirm = (resume) => {
    confirmOverlay?.classList.remove('gameover-overlay--visible');
    confirmOverlay?.setAttribute('aria-hidden', 'true');
    if (resume && currentGame && currentGame.isPaused && !wasPausedBeforeConfirm) {
      currentGame.togglePause();
    }
  };

  quitButton?.addEventListener('click', showQuitConfirm);
  confirmYes?.addEventListener('click', () => { hideQuitConfirm(false); backToHome(); });
  confirmNo?.addEventListener('click', () => hideQuitConfirm(true));

  pauseButton?.addEventListener('click', () => {
    if (!currentGame) return;
    currentGame.togglePause();
    pauseButton.classList.toggle('paused', currentGame.isPaused);
  });

  // Enter キーでホーム開始 / ゲームオーバー時は再挑戦
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (screenHome.classList.contains('screen--active')) {
      startButton.click();
    } else if (gameoverOverlay.classList.contains('gameover-overlay--visible')) {
      retryButton.click();
    }
  });

  // パドルを動かしたら操作ヒントを消す
  document.getElementById('game-field')?.addEventListener('pointerdown', () => {
    if (moveHint) moveHint.style.opacity = '0';
  });

  // 初期ランキング読み込み
  loadTopRanking();

  // トップ画面の自動プレイデモを開始
  startDemo();
});

// ===== ランキング（Purple Jumper と同じトップUI） =====

const rankingModes = [
  { id: 'daily', name: '今日のランキング' },
  { id: 'monthly', name: '月間ランキング' },
  { id: 'all', name: '歴代ランキング' },
];
let currentRankingModeIndex = 0;

function getRankingModeLabel(mode) {
  if (!mode) return '';
  if (mode.id === 'monthly') {
    return (new Date().getMonth() + 1) + '月の月間ランキング';
  }
  return mode.name;
}

function createRankingLi(className, text) {
  const li = document.createElement('li');
  li.className = className;
  li.textContent = text;
  return li;
}

async function loadTopRanking() {
  const listEl = document.getElementById('top-ranking-list');
  const titleEl = document.getElementById('rank-title-text');
  if (!listEl) return;

  const mode = rankingModes[currentRankingModeIndex];
  if (titleEl) titleEl.textContent = getRankingModeLabel(mode);
  listEl.innerHTML = '';

  if (typeof window.waitForSupabaseConnection === 'function') {
    const { connected } = await window.waitForSupabaseConnection(5000);
    if (!connected) {
      listEl.appendChild(createRankingLi('placeholder', 'ランキングを読み込めません'));
      return;
    }
  }
  if (typeof fetchRanking !== 'function') {
    listEl.appendChild(createRankingLi('placeholder', 'Supabase未設定のため表示できません'));
    return;
  }

  const { data, error, skipped } = await fetchRanking(mode.id);
  if (skipped || error) {
    listEl.appendChild(createRankingLi('placeholder', '取得できませんでした'));
    return;
  }

  const rows = (data || []).slice(0, 100);
  if (rows.length === 0) {
    listEl.appendChild(createRankingLi('placeholder', 'まだ記録がありません'));
    return;
  }

  rows.forEach((row, i) => {
    const score = Number(row.score ?? 0);
    const nickname = (row.nickname || '').trim() || 'ななし';
    // 同スコアは同順位（タイ）
    const displayRank = (i > 0 && score === Number(rows[i - 1].score ?? 0))
      ? rows[i - 1]._displayRank
      : i + 1;
    row._displayRank = displayRank;

    const medal = displayRank === 1 ? '🥇' : displayRank === 2 ? '🥈' : displayRank === 3 ? '🥉' : '';
    const cls = displayRank === 1 ? 'rank-1' : displayRank === 2 ? 'rank-2' : displayRank === 3 ? 'rank-3' : 'rank-4plus';
    const text = (medal ? medal + ' ' : '') + displayRank + '位 ' + nickname + ' … ' + score + ' pt';
    listEl.appendChild(createRankingLi(cls, text));
  });
}
