/**
 * Purple Breaker - ブロック崩し（アルカノイド系）ゲーム本体
 *
 * キャンバスの内部解像度は 500 x 720 固定。表示はCSSで拡大縮小される。
 * ステージをクリアするたびに難易度（ボール速度）が上がるエンドレス形式。
 *
 * パワーアップ（カプセルを落下→バーでキャッチして発動）：
 *   E … 拡大（バーが伸びる）
 *   D … マルチボール（ボールが分裂）
 *   C … キャッチ（ボールが角にくっつき好きな角度で撃ち直し）
 *   L … レーザー（角からビームを連射）
 * ブロック種別：通常 / 銀（3発で破壊）/ 金（壊れない）
 */

const FIELD_W = 500;
const FIELD_H = 720;

// パドル（バー）
const PADDLE_W = 96;            // 通常幅
const PADDLE_W_STEP = 36;       // 拡大(E)1個ごとに伸びる量
const PADDLE_MAX_LEVEL = 5;     // 拡大の最大段階（96 + 36*5 = 276px）
const PADDLE_H = 16;
const PADDLE_BOTTOM_OFFSET = 48; // フィールド下端からの距離
const PADDLE_KEY_SPEED = 620;    // キーボード操作時の移動速度(px/s)
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180; // パドル端で跳ね返る最大角
// 永久ループ対策：反射後に縦速度が小さすぎる（ほぼ水平）と、金ブロックや壁の間を
// 水平に往復し続けて落ちてこなくなる。速度の大きさは保ったまま、最低この角度ぶんの
// 縦成分を確保して必ず上下動を残す。
const MIN_VY_RATIO = Math.sin((14 * Math.PI) / 180); // 縦速度／全体速度 の下限（≒0.24）
// 壊れない金ブロックに連続でこの回数当たり続けたら、周期軌道に嵌った可能性が高い。
// ランダムに軌道を乱して脱出させる（通常プレイでは連続8回も当たらない）。
const GOLD_STREAK_LIMIT = 8;

// パプ太郎（パドルと一緒に動く。角の上にバーが乗る見た目）
const PAPUTARO_NAT_W = 502;
const PAPUTARO_NAT_H = 572;
const PADDLE_PAPUTARO_W = 152;     // ゲーム中のパプ太郎の表示幅
const PAPUTARO_RAISE_RATIO = 0.18; // 角がバーより上にどれだけ出るか（大きいほど上）

// ボール
const BALL_R = 8;
const BASE_SPEED = 718;          // 初期ボール速度(px/s)。ループ1（ステージ1〜10）の速度
const LOOP_SPEED_GAIN = 1.05;    // 1ループ走破ごとにボール速度+5%。ループ内（10ステージ）は一定
const MAX_SPEED = 1517;          // 速度上限(px/s)。これ以上は速くならない
const MAX_BALLS = 8;             // 同時ボール数の上限
const MULTIBALL_SPREAD = 0.42;   // マルチボール分裂角(rad)

// ブロック配置（13列の細かめグリッド＝1ステージのブロック数を多めに）
const BRICK_COLS = 13;
const BRICK_MARGIN_X = 16;
const BRICK_TOP = 70;
const BRICK_GAP = 4;
const BRICK_H = 18;
const BRICK_W =
  (FIELD_W - BRICK_MARGIN_X * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;

// 行ごとの色（上＝濃い紫＝高得点、下＝淡い紫）
const ROW_COLORS = ['#6d28d9', '#7c3aed', '#9333ea', '#a855f7', '#c084fc'];
const SILVER_POINTS = 50;        // 銀ブロック破壊時の得点

/**
 * ステージごとのブロック配置。各文字＝1マス（横13マス）。
 * '.'=なし / 'N'=通常 / 'S'=銀(3発) / 'G'=金(壊れない)。
 * stage が進むごとに順番に切り替わり、ひと巡りしたら最初に戻る。
 * 銀・金はここで指定した位置に固定（ランダム配置はしない）。
 */
const STAGE_PATTERNS = [
  // 1: 階段状（左が高く右へ下る）。最下段はほぼ銀＋右端だけ通常、他は通常
  [
    'N............',
    'NN...........',
    'NNN..........',
    'NNNN.........',
    'NNNNN........',
    'NNNNNN.......',
    'NNNNNNN......',
    'NNNNNNNN.....',
    'NNNNNNNNN....',
    'NNNNNNNNNN...',
    'NNNNNNNNNNN..',
    'NNNNNNNNNNNN.',
    'SSSSSSSSSSSSN',
  ],
  // 2: スマイル（笑顔）。目=銀。下に銀1列（中央9ブロック）
  [
    '...NNNNNNN...',
    '..NNNNNNNNN..',
    '.NNNNNNNNNNN.',
    '.NNSSNNNSSNN.',
    '.NNSSNNNSSNN.',
    '.NNNNNNNNNNN.',
    '.NN.NNNNN.NN.',
    '.NNN.....NNN.',
    '..NNNNNNNNN..',
    '...NNNNNNN...',
    '.............',
    '..SSSSSSSSS..',
  ],
  // 3: ハート。両端(0,12列)を空けて玉が入れる。形は通常、下に銀1列（中央9ブロック）
  [
    '..NNN...NNN..',
    '.NNNNN.NNNNN.',
    '.NNNNNNNNNNN.',
    '.NNNNNNNNNNN.',
    '..NNNNNNNNN..',
    '...NNNNNNN...',
    '....NNNNN....',
    '.....NNN.....',
    '......N......',
    '.............',
    '..SSSSSSSSS..',
  ],
  // 4: 上下2ブロック。中央に横の隙間。両端(0,12列)を空けて玉が横から入れる。銀を斜めに散りばめた配置
  [
    '.SNNSNNSNNSN.',
    '.NNSNNSNNSNN.',
    '.NSNNSNNSNNS.',
    '.SNNSNNSNNSN.',
    '.............',
    '.............',
    '.SNNSNNSNNSN.',
    '.NNSNNSNNSNN.',
    '.NSNNSNNSNNS.',
    '.SNNSNNSNNSN.',
  ],
  // 5: 左右2ブロック。両端・中央に玉が入る隙間（.）をあける。銀を散りばめた配置がポイント
  [
    '.NSNNS.NSNNS.',
    '.NNNSN.NNNSN.',
    '.SNNNS.SNNNS.',
    '.NNSNN.NNSNN.',
    '.NSNNS.NSNNS.',
    '.NNNSN.NNNSN.',
    '.SNNNS.SNNNS.',
    '.NNSNN.NNSNN.',
    '.NSNNS.NSNNS.',
    '.NNNSN.NNNSN.',
    '.SNNNS.SNNNS.',
    '.NNSNN.NNSNN.',
    '.NSNNS.NSNNS.',
  ],
  // 6: 大きなかさ（傘）。てっぺん・棒・縁・J字の取っ手=銀(S)、その他=通常。両端(0,12列)を空けて玉が横から入れる
  [
    '......S......',
    '....NNNNN....',
    '..NNNNNNNNN..',
    '.NNNNNNNNNNN.',
    '.NNNNNNNNNNN.',
    '.NNNNNNNNNNN.',
    '.S.S.S.S.S.S.',
    '......S......',
    '......S......',
    '......S......',
    '......S......',
    '......S......',
    '......S......',
    '....S.S......',
    '....SSS......',
  ],
  // 7: ねこ（猫の顔）。大きめ。両端(0,12列)を空けて玉が入れる。目・鼻=銀。下に独立した両手（全部銀）
  [
    '..N.......N..',
    '..NN.....NN..',
    '.NNNN...NNNN.',
    '.NNNNNNNNNNN.',
    '.NNNNNNNNNNN.',
    '.NSSNNNNNSSN.',
    '.NNNNNNNNNNN.',
    '.NNNNNSNNNNN.',
    '.NNNNNNNNNNN.',
    '..NNNNNNNNN..',
    '...NNNNNNN...',
    '.............',
    '.SSS.....SSS.',
    '.SSS.....SSS.',
  ],
  // 8: 渦巻き（入れ子の四角＋中央バー）。すべて銀。両端(0,12列)を空けて玉が横から入れる
  [
    '.SSSSSSSSSSS.',
    '.S.........S.',
    '.S.SSSSSSS.S.',
    '.S.S.....S.S.',
    '.S.S.SSS.S.S.',
    '.S.S.....S.S.',
    '.S.SSSSSSS.S.',
    '.S.........S.',
    '.SSSSSSSSSSS.',
  ],
  // 9: 金（G）を左右交互に並べたジグザグ。各ブロック行の間に空行を入れて玉が通れる隙間を作る
  [
    'NNNNNNNNNNNNN',
    '.............',
    'GGGGGGGGNNNNN',
    '.............',
    'NNNNNNNNNNNNN',
    '.............',
    'NNNNNGGGGGGGG',
    '.............',
    'NNNNNNNNNNNNN',
    '.............',
    'GGGGGGGGNNNNN',
    '.............',
    'NNNNNNNNNNNNN',
    '.............',
    'NNNNNGGGGGGGG',
  ],
  // 10: ロケット（縦長・リアル）。先端コーン＋胴体＋四角い窓=銀(3x3)2つ＋太いフィン＋中央ノズル=銀
  [
    '......N......',
    '......N......',
    '.....NNN.....',
    '.....NNN.....',
    '....NNNNN....',
    '...NNNNNNN...',
    '...NNSSSNN...',
    '...NNSSSNN...',
    '...NNSSSNN...',
    '...NNNNNNN...',
    '...NNSSSNN...',
    '...NNSSSNN...',
    '...NNSSSNN...',
    '..NNNNNNNNN..',
    '.NNNNNNNNNNN.',
    'NNNNNNNNNNNNN',
    'NN..SSSSS..NN',
    'NN..SSSSS..NN',
  ],
];

// カプセル（パワーアップ）
const CAPSULE_DROP_CHANCE = 0.08; // ブロック破壊時にアイテムが落ちる確率（全体）
const CAPSULE_W = 30;
const CAPSULE_H = 16;
const CAPSULE_SPEED = 170;        // 落下速度(px/s)
const CAPSULE_TYPES = {
  E: { color: '#38bdf8', label: 'E' }, // 拡大（段階式）
  D: { color: '#f472b6', label: 'D' }, // マルチボール
  L: { color: '#f87171', label: 'L' }, // レーザー
  T: { color: '#f97316', label: 'T' }, // 貫通ボール（Through）
  P: { color: '#22c55e', label: 'P' }, // 1UP（残機+1）
};
// 出現比率：1UP(P)が最も出にくい（E=4/D=5/L=4/T=4/P=1 → P≒5.6%・他≒22〜28%）
const CAPSULE_KEYS = ['E', 'E', 'E', 'E', 'D', 'D', 'D', 'D', 'D', 'L', 'L', 'L', 'L', 'T', 'T', 'T', 'T', 'P'];

// ステージ（パターンの0始まりインデックス）ごとに出さないアイテム。
// 全体の落下率(CAPSULE_DROP_CHANCE)は変えず、除外した種類の分は残りに振り分けられる。
const STAGE_EXCLUDED_CAPSULES = {
  8: ['L'], // ステージ9（金ジグザグ）はレーザーを出さない（index=8）
};

// レーザー
const LASER_INTERVAL = 0.40; // 連射間隔(s)
const LASER_SPEED = 760;     // 上昇速度(px/s)
const LASER_W = 4;
const LASER_H = 16;
const LASER_DURATION = 10;   // L取得から撃てる秒数
const THROUGH_DURATION = 5; // 貫通ボールの継続秒数

// デモ（トップ画面の自動プレイ）用：自動パドルの追従速度
const AUTO_PADDLE_SPEED = 700;

const START_LIVES = 3;

// ▼テスト用：開始ステージ。通常公開時は 1 に戻すこと（URLの ?stage= が優先される）
const DEBUG_START_STAGE = 1;

class BreakerGame {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.fieldEl - 描画先キャンバス
   * @param {HTMLElement} opts.scoreEl - スコア表示要素
   * @param {HTMLElement} [opts.livesEl] - 残機表示要素
   * @param {string} opts.nickname
   * @param {(score:number)=>void} [opts.onScore]
   * @param {(result:{nickname:string,score:number})=>void} [opts.onGameOver]
   */
  constructor(opts) {
    this.canvas = opts.fieldEl;
    this.ctx = this.canvas.getContext('2d');
    this.scoreEl = opts.scoreEl;
    this.livesEl = opts.livesEl || null;
    this.stageEl = opts.stageEl || null;
    this.nickname = opts.nickname;
    this.onScore = opts.onScore || (() => {});
    this.onGameOver = opts.onGameOver || (() => {});
    // デモモード（トップ画面の自動プレイ。自動操作・ノーミス・ゲームオーバーなし）
    this.demo = !!opts.demo;
    this._demoAimSign = Math.random() < 0.5 ? -1 : 1; // デモの打ち返し方向

    this.canvas.width = FIELD_W;
    this.canvas.height = FIELD_H;

    this.score = 0;
    this.scoreDisplay = 0; // 表示用（実スコアへ滑らかに追従）
    this.scorePop = 0;     // 加算時のポップ演出（1→0に減衰）
    this.lives = START_LIVES;
    // 開始ステージ（?stage= が指定されていればそれを、無ければ DEBUG_START_STAGE を使う）
    this.stage = Math.max(1, parseInt(opts.startStage, 10) || DEBUG_START_STAGE);
    this.isPaused = false;
    this.isOver = false;

    this.rafId = null;
    this.lastTs = 0;

    // 入力状態
    this.keyLeft = false;
    this.keyRight = false;

    // パワーアップ状態（独立。2個以上取れば全部同時に有効）
    this.extendLevel = 0;   // 拡大の段階（取るほどバーが伸びる）
    this.laser = false;     // レーザー
    this.laserTimer = 0;    // 連射間隔のタイマー
    this.laserTime = 0;     // レーザーの残り有効時間(s)
    this.through = false;   // 貫通ボール
    this.throughTime = 0;   // 貫通の残り有効時間(s)

    // コンボ＆ボーナス用
    this.combo = 0;             // 現在の連鎖（ミス／クリアまで継続）
    this.comboPop = 0;          // コンボ加算時の「ぴょん」演出(1→0)
    this.maxCombo = 0;          // 最大コンボ
    this.missedThisStage = false; // このステージでミスしたか（ノーミスボーナス判定）
    this.stageTime = 0;         // このステージの経過秒（タイムボーナス判定）

    // ステージ開始時の演出メッセージ（残り表示秒数）
    this.flashText = '';
    this.flashTimer = 0;

    this.audioContext = null;

    // パプ太郎の画像
    this.paputaroImg = new Image();
    this.paputaroLoaded = false;
    this.paputaroImg.onload = () => { this.paputaroLoaded = true; };
    this.paputaroImg.src = './paputaro.png';

    this._initEntities();
    this._bindInput();
  }

  // ===== 初期化 =====

  _initEntities() {
    this.paddle = {
      x: FIELD_W / 2,
      y: FIELD_H - PADDLE_BOTTOM_OFFSET,
      w: PADDLE_W,
      h: PADDLE_H,
    };

    this.balls = [];
    this.capsules = [];
    this.lasers = [];
    this._spawnStuckBall();

    // 開始ステージに応じた速度（ループ単位で加速）
    this.baseSpeed = this._speedForStage(this.stage);
    this._buildBricks();
  }

  /** そのステージのボール速度を返す。ループ（全ステージ走破）ごとに+5%。ループ内は一定。 */
  _speedForStage(stage) {
    const loopIndex = Math.floor((stage - 1) / STAGE_PATTERNS.length);
    return Math.min(BASE_SPEED * Math.pow(LOOP_SPEED_GAIN, loopIndex), MAX_SPEED);
  }

  _makeBall(x, y, vx, vy, stuck) {
    return { x, y, vx, vy, r: BALL_R, stuck: !!stuck, stuckOffset: 0, _fell: false, goldStreak: 0 };
  }

  _spawnStuckBall() {
    this.balls = [this._makeBall(this.paddle.x, this.paddle.y - BALL_R - 2, 0, 0, true)];
  }

  _buildBricks() {
    this.bricks = [];
    let breakable = 0;

    // ステージごとに形を変える（ひと巡りしたら最初に戻る）。銀・金は固定配置（ランダムにしない）
    const pattern = STAGE_PATTERNS[(this.stage - 1) % STAGE_PATTERNS.length];
    const rows = pattern.length;

    for (let row = 0; row < rows; row++) {
      const line = pattern[row] || '';
      for (let col = 0; col < BRICK_COLS; col++) {
        const ch = line[col] || '.';
        if (ch === '.') continue;

        let type = 'normal';
        let hp = 1;
        let points = (rows - row) * 10; // 上の行ほど高得点
        if (ch === 'S') {
          type = 'silver'; hp = 3; points = SILVER_POINTS;
        } else if (ch === 'G') {
          type = 'gold'; hp = Infinity; points = 0;
        }

        const brick = {
          x: BRICK_MARGIN_X + col * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          type,
          hp,
          maxHp: hp,
          points,
          color: ROW_COLORS[row % ROW_COLORS.length],
          alive: true,
        };
        this.bricks.push(brick);
        if (type !== 'gold') breakable++;
      }
    }
    this.bricksLeft = breakable;
  }

  /** パワーアップを全リセットして発射待ちに戻す（ミス時・ステージクリア時の両方） */
  _resetField() {
    this.capsules = [];
    this.lasers = [];
    this.extendLevel = 0;
    this.laser = false;
    this.paddle.w = PADDLE_W;
    this.laserTimer = 0;
    this.laserTime = 0;
    this.through = false;
    this.throughTime = 0;
    this.combo = 0; // 連鎖はリセット
    this.comboPop = 0;
    this._spawnStuckBall();
    this._stageJustReset = true; // このフレームの残処理（ボール/レーザー）を中断させる
  }

  _launchBalls() {
    if (this.isPaused || this.isOver) return;
    const speed = Math.min(this.baseSpeed, MAX_SPEED);
    let launched = false;
    for (const ball of this.balls) {
      if (!ball.stuck) continue;
      ball.stuck = false;
      const rel = Math.max(-1, Math.min(1, ball.stuckOffset / (this.paddle.w / 2)));
      const angle = rel * MAX_BOUNCE_ANGLE + (Math.random() * 0.1 - 0.05);
      ball.vx = speed * Math.sin(angle);
      ball.vy = -speed * Math.cos(angle);
      ball.stuckOffset = 0;
      launched = true;
    }
    if (launched) this._metalHit(720, 0.06, 0.1);
  }

  // ===== 入力 =====

  _bindInput() {
    if (this.demo) return; // デモは自動操作。ユーザー入力は受け付けない
    this._onPointerMove = (e) => {
      if (this.isOver) return;
      const point = e.touches ? e.touches[0] : e;
      if (!point) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const x = (point.clientX - rect.left) * scaleX;
      this._setPaddleCenter(x);
    };
    this._onPointerDown = (e) => {
      this._onPointerMove(e);
      this._launchBalls();
    };

    // 入力はゲーム画面エリア全体で受ける（パプ太郎より下の余白でも発射・操作できる）
    this._inputTarget = this.canvas.closest('.game-section') || this.canvas;
    this._inputTarget.addEventListener('mousemove', this._onPointerMove);
    this._inputTarget.addEventListener('mousedown', this._onPointerDown);
    this._inputTarget.addEventListener('touchstart', this._onPointerDown, { passive: true });
    this._inputTarget.addEventListener('touchmove', this._onPointerMove, { passive: true });

    this._onKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { this.keyLeft = true; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { this.keyRight = true; e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'ArrowUp') { this._launchBalls(); e.preventDefault(); }
    };
    this._onKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.keyLeft = false;
      else if (e.key === 'ArrowRight' || e.key === 'd') this.keyRight = false;
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  _unbindInput() {
    if (this.demo) return;
    const t = this._inputTarget || this.canvas;
    t.removeEventListener('mousemove', this._onPointerMove);
    t.removeEventListener('mousedown', this._onPointerDown);
    t.removeEventListener('touchstart', this._onPointerDown);
    t.removeEventListener('touchmove', this._onPointerMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }

  _setPaddleCenter(x) {
    // クランプは「基本幅」基準。拡大して長くなった分は左右の端からはみ出せる
    // → 中央付近のレーザー発射点が壁際まで届き、端のブロックも撃てる
    const half = PADDLE_W / 2;
    this.paddle.x = Math.max(half, Math.min(FIELD_W - half, x));
  }

  // ===== ループ =====

  start() {
    this.combo = 0;
    this.missedThisStage = false;
    this.stageTime = 0;
    this._showFlash('STAGE ' + this.stage, 1.2);
    this._playStageJingle(); // 開始ファンファーレ
    this.lastTs = performance.now();
    this._updateHud();
    this._updateStageLabel();
    if (this.demo) this._launchBalls(); // デモは自動で発射
    const loop = (ts) => {
      this.rafId = requestAnimationFrame(loop);
      let dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.05) dt = 0.05; // タブ復帰などの巨大dtを抑制
      if (!this.isPaused && !this.isOver) this._update(dt);
      this._updateScoreDisplay(dt); // スコアの滑らかなカウントアップ（常時）
      this._draw();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) this.lastTs = performance.now();
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this._unbindInput();
  }

  // ===== 更新 =====

  _update(dt) {
    // ステージ遷移（クリア/ミス）がこのフレームで起きたら残りの処理を中断するためのフラグ
    this._stageJustReset = false;

    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (!this.demo) this.stageTime += dt; // タイムボーナス用の経過時間

    // コンボはミス／クリアまで継続（時間切れ無し）。加算演出だけ減衰
    if (this.comboPop > 0) this.comboPop = Math.max(0, this.comboPop - dt * 6);

    // 貫通ボール（取得から THROUGH_DURATION 秒だけ）
    if (this.through) {
      this.throughTime -= dt;
      if (this.throughTime <= 0) this.through = false;
    }

    if (this.demo) {
      // デモ：自動パドル（一番下のボールを追う）
      this._autoPaddle(dt);
    } else {
      // キーボードでのパドル移動
      if (this.keyLeft && !this.keyRight) this._setPaddleCenter(this.paddle.x - PADDLE_KEY_SPEED * dt);
      else if (this.keyRight && !this.keyLeft) this._setPaddleCenter(this.paddle.x + PADDLE_KEY_SPEED * dt);
    }

    // レーザー（取得から LASER_DURATION 秒だけ撃てる）
    if (this.laser) {
      this.laserTime -= dt;
      if (this.laserTime <= 0) {
        this.laser = false; // 時間切れで通常バーに戻る
      } else {
        this.laserTimer -= dt;
        if (this.laserTimer <= 0) {
          this._fireLasers();
          this.laserTimer = LASER_INTERVAL;
        }
      }
    }

    this._updateBalls(dt);
    if (this._stageJustReset) return; // ボールが最終ブロックを壊した場合
    this._updateCapsules(dt);
    this._updateLasers(dt);
  }

  _updateBalls(dt) {
    const half = this.paddle.w / 2;
    for (const ball of this.balls) {
      if (ball.stuck) {
        // パドルに追従
        ball.stuckOffset = Math.max(-(half - ball.r), Math.min(half - ball.r, ball.stuckOffset));
        ball.x = this.paddle.x + ball.stuckOffset;
        ball.y = this.paddle.y - ball.r - 2;
        continue;
      }
      const speed = Math.hypot(ball.vx, ball.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / (BALL_R * 0.9)));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) {
        if (this._stepBall(ball, sub)) break;
      }
      // 最終ブロック破壊でステージが切り替わったら、古いボール配列には触れない
      if (this._stageJustReset) return;
    }

    if (this.demo) {
      // デモ：拾えなかった玉は落として消す。ただし最後の1個だけは消さず打ち上げ直す
      const survivors = this.balls.filter((b) => !b._fell);
      if (survivors.length === 0 && this.balls.length > 0) {
        const rescue = this.balls[0];
        rescue._fell = false;
        rescue.y = this.paddle.y - rescue.r - 1;
        const speed = Math.min(Math.hypot(rescue.vx, rescue.vy) || this.baseSpeed, MAX_SPEED);
        const angle = Math.random() * 0.7 - 0.35;
        rescue.vx = speed * Math.sin(angle);
        rescue.vy = -Math.abs(speed * Math.cos(angle));
        this.balls = [rescue];
      } else {
        this.balls = survivors;
      }
      return;
    }

    // 落下したボールを除去
    const before = this.balls.length;
    this.balls = this.balls.filter((b) => !b._fell);
    if (this.balls.length === 0 && before > 0 && !this.isOver) {
      this._loseLife();
    }
  }

  /** デモ用：一番早くパドルに到達する下降ボールの落下地点を予測し、先回りして追いかける */
  _autoPaddle(dt) {
    const targetY = this.paddle.y - this.paddle.h / 2 - BALL_R;
    let chosen = null;
    let bestT = Infinity;
    for (const b of this.balls) {
      if (b.stuck || b.vy <= 0) continue;
      const t = (targetY - b.y) / b.vy;
      if (t >= 0 && t < bestT) { bestT = t; chosen = b; }
    }

    let target;
    if (chosen) {
      target = this._predictX(chosen, targetY);
    } else {
      // 下降中のボールが無ければ一番下のボールのxへ寄せておく
      let lowest = -Infinity;
      target = this.paddle.x;
      for (const b of this.balls) {
        if (!b.stuck && b.y > lowest) { lowest = b.y; target = b.x; }
      }
    }

    const max = AUTO_PADDLE_SPEED * dt;
    const dx = Math.max(-max, Math.min(max, target - this.paddle.x));
    this._setPaddleCenter(this.paddle.x + dx);
  }

  /** 壁反射を考慮して、ボールが targetY に到達するときの x を予測する */
  _predictX(ball, targetY) {
    if (ball.vy <= 0) return ball.x;
    const t = (targetY - ball.y) / ball.vy;
    const x = ball.x + ball.vx * t;
    const r = ball.r;
    const span = FIELD_W - 2 * r;
    if (span <= 0) return FIELD_W / 2;
    // [r, FIELD_W-r] の範囲で三角波状に折り返す
    let m = (x - r) % (2 * span);
    if (m < 0) m += 2 * span;
    return m <= span ? r + m : r + (2 * span - m);
  }

  /** ボールを微小時間進める。落下したら true */
  _stepBall(ball, dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); this._metalHit(1200, 0.04, 0.05); }
    else if (ball.x + ball.r > FIELD_W) { ball.x = FIELD_W - ball.r; ball.vx = -Math.abs(ball.vx); this._metalHit(1200, 0.04, 0.05); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); this._metalHit(1200, 0.04, 0.05); }

    if (ball.y - ball.r > FIELD_H) {
      ball._fell = true; // デモでも本番でも、拾えなかった玉は落として消す
      return true;
    }

    this._collidePaddle(ball);
    this._collideBricks(ball);
    this._antiHorizontalGuard(ball);
    return false;
  }

  /**
   * 反射後の軌道がほぼ水平になっていたら、速度の大きさは保ったまま縦成分を
   * 最低 MIN_VY_RATIO ぶん確保する。水平の永久ループ（壁や金ブロックの間を
   * 往復し続けて落ちてこない）を防ぐ。
   */
  _antiHorizontalGuard(ball) {
    if (ball.stuck) return;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 1e-3) return;
    const minVy = speed * MIN_VY_RATIO;
    if (Math.abs(ball.vy) >= minVy) return;
    const signY = ball.vy >= 0 ? 1 : -1; // vy≈0 のときは下向き(+)に倒して落下を促す
    const signX = ball.vx >= 0 ? 1 : -1;
    ball.vy = signY * minVy;
    ball.vx = signX * Math.sqrt(Math.max(0, speed * speed - minVy * minVy));
  }

  /**
   * 壊れない金ブロックに連続で当たり続けて周期軌道に嵌ったとき、速度の大きさは
   * 保ったまま進行方向をランダムに回転させて軌道を崩し、ループから脱出させる。
   */
  _breakGoldLoop(ball) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 1e-3) return;
    let ang = Math.atan2(ball.vy, ball.vx);
    const kick = ((12 + Math.random() * 16) * Math.PI) / 180; // ±12〜28°
    ang += (Math.random() < 0.5 ? -1 : 1) * kick;
    ball.vx = speed * Math.cos(ang);
    ball.vy = speed * Math.sin(ang);
    // 画面上側に張り付いている場合は確実に落下方向へ向ける
    if (ball.y < FIELD_H * 0.5 && ball.vy < 0) ball.vy = Math.abs(ball.vy);
    ball.goldStreak = 0;
  }

  _collidePaddle(ball) {
    const p = this.paddle;
    if (ball.vy <= 0) return; // 上昇中は無視
    const top = p.y - p.h / 2;
    if (ball.y + ball.r < top || ball.y - ball.r > p.y + p.h / 2) return;
    if (ball.x < p.x - p.w / 2 - ball.r || ball.x > p.x + p.w / 2 + ball.r) return;

    const speed = Math.min(Math.hypot(ball.vx, ball.vy), MAX_SPEED);
    let angle;
    if (this.demo) {
      // デモ：左右にしっかり角度をつけ、ときどき逆方向へ振って本当にラリーしているように見せる
      if (Math.random() < 0.4) this._demoAimSign *= -1;
      const mag = 0.4 + Math.random() * 0.4; // 角度の強さ（0.4〜0.8）
      angle = this._demoAimSign * mag * MAX_BOUNCE_ANGLE;
    } else {
      // 当たった位置で反射角を決める（クラシックなアルカノイド方式）
      const rel = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.w / 2)));
      angle = rel * MAX_BOUNCE_ANGLE;
    }
    ball.vx = speed * Math.sin(angle);
    ball.vy = -Math.abs(speed * Math.cos(angle));
    ball.y = top - ball.r - 0.1;
    ball.goldStreak = 0; // パドルに戻ったらループ判定リセット
    this.combo = 0; // パドルで弾いたらコンボ（連鎖）リセット
    this._sndPaddle();
    this._vibrate(12); // スマホで一瞬バイブ
  }

  _collideBricks(ball) {
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      // 貫通ボール：金以外は反射せず壊して進む（1ステップで複数ブロックを貫通）
      if (this.through && b.type !== 'gold') {
        this._damageBrick(b);
        if (this._stageJustReset) return;
        continue;
      }

      // 反射軸を最小めり込み量で決める（金ブロックでも反射する）
      const overlapL = ball.x + ball.r - b.x;
      const overlapR = b.x + b.w - (ball.x - ball.r);
      const overlapT = ball.y + ball.r - b.y;
      const overlapB = b.y + b.h - (ball.y - ball.r);
      const minX = Math.min(overlapL, overlapR);
      const minY = Math.min(overlapT, overlapB);
      // 反射すると同時にボールをブロックの外側へ押し戻す。
      // （金・銀など壊れずに残るブロックでは、押し戻さないとめり込んだまま
      //   反射しきれず“すり抜け”が起こるため）
      if (minX < minY) {
        if (overlapL < overlapR) { ball.vx = -Math.abs(ball.vx); ball.x = b.x - ball.r; }
        else { ball.vx = Math.abs(ball.vx); ball.x = b.x + b.w + ball.r; }
      } else {
        if (overlapT < overlapB) { ball.vy = -Math.abs(ball.vy); ball.y = b.y - ball.r; }
        else { ball.vy = Math.abs(ball.vy); ball.y = b.y + b.h + ball.r; }
      }

      this._damageBrick(b);
      // 壊れない金に連続で当たり続けたらループ脱出。壊せるブロックに当たったらリセット。
      if (b.type === 'gold') {
        ball.goldStreak++;
        if (ball.goldStreak >= GOLD_STREAK_LIMIT) this._breakGoldLoop(ball);
      } else {
        ball.goldStreak = 0;
      }
      break; // 1ステップで1ブロックのみ（貫通でない場合）
    }
  }

  /** ブロックにダメージ。破壊したら true。byLaser=true のときはコンボに数えない */
  _damageBrick(b, byLaser = false) {
    if (b.type === 'gold') {
      this._sndHard(3600, 0.5, 0.08); // 金：とても高い金属音＋残響（壊れない）
      return false;
    }
    b.hp--;
    if (b.hp <= 0) {
      b.alive = false;
      this.bricksLeft--;
      if (byLaser) {
        // レーザー破壊はコンボ対象外（素点のみ）
        this._addScore(b.points);
      } else {
        // ボールでの破壊はコンボ加算＆倍率を反映
        this.combo++;
        this.comboPop = 1; // 「ぴょん」演出をトリガー
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this._addScore(Math.round(b.points * this._comboMult()));
      }
      this._maybeDropCapsule(b);
      if (b.type === 'silver') {
        this._sndHard(3300, 0.5, 0.09); // 銀の破壊：超高音メタル＋残響
      } else {
        this._metalHit(1500, 0.1, 0.13); // 通常ブロック破壊
      }
      if (this.bricksLeft <= 0) this._nextStage();
      return true;
    }
    this._sndHard(2900, 0.4, 0.08); // 銀の途中ヒット：超高音メタル＋残響
    return false;
  }

  _maybeDropCapsule(b) {
    if (Math.random() >= CAPSULE_DROP_CHANCE) return; // 全体の落下率はステージ問わず一定
    // このステージで出さない種類を除外（除外分は残りの種類に振り分けられる）
    const patternIdx = (this.stage - 1) % STAGE_PATTERNS.length;
    const excludedBase = STAGE_EXCLUDED_CAPSULES[patternIdx] || [];
    // 貫通ボール中は新たな貫通(T)を出さない
    const excluded = this.through ? excludedBase.concat('T') : excludedBase;
    const pool = excluded.length ? CAPSULE_KEYS.filter((k) => !excluded.includes(k)) : CAPSULE_KEYS;
    if (pool.length === 0) return;
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.capsules.push({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
      type: key,
    });
  }

  // ===== カプセル =====

  _updateCapsules(dt) {
    const p = this.paddle;
    // 判定幅は「バー」と「パプ太郎の体(幅152)」の広い方。パプ太郎の体に触れても獲得
    const halfW = Math.max(p.w / 2, PADDLE_PAPUTARO_W / 2);
    const remaining = [];
    for (const cap of this.capsules) {
      cap.y += CAPSULE_SPEED * dt;
      // パドル上端まで落ちてきて、バー/パプ太郎の横幅内ならキャッチ（体は下端まであるので下限は不要）
      const reachedPaddle = cap.y + CAPSULE_H / 2 >= p.y - p.h / 2;
      const withinX = cap.x >= p.x - halfW - CAPSULE_W / 2 && cap.x <= p.x + halfW + CAPSULE_W / 2;
      if (reachedPaddle && withinX) {
        this._applyPowerUp(cap.type);
        continue;
      }
      if (cap.y - CAPSULE_H / 2 > FIELD_H) continue; // 画面外で消滅
      remaining.push(cap);
    }
    this.capsules = remaining;
  }

  _applyPowerUp(type) {
    switch (type) {
      case 'E': // 拡大：取るたびに1段階ずつバーが伸びる
        this.extendLevel = Math.min(this.extendLevel + 1, PADDLE_MAX_LEVEL);
        this.paddle.w = PADDLE_W + this.extendLevel * PADDLE_W_STEP;
        this._setPaddleCenter(this.paddle.x); // 端からはみ出さないよう補正
        this._sndExtend(); // 低音ビヨーン
        break;
      case 'L': // レーザー（取得から10秒だけ。再取得で10秒に戻る）
        if (!this.laser) this.laserTimer = 0;
        this.laser = true;
        this.laserTime = LASER_DURATION;
        this._metalHit(1320, 0.14, 0.1); // 取得の明るい確認音
        break;
      case 'D': // マルチボール
        this._applyMultiball();
        this._metalHit(880, 0.1, 0.1);
        this._metalHit(1320, 0.14, 0.09); // 明るい上昇2音
        break;
      case 'T': // 貫通ボール（10秒。その間ボールは赤グラデになり、金以外を貫通）
        this.through = true;
        this.throughTime = THROUGH_DURATION;
        this._metalHit(520, 0.12, 0.1);
        this._metalHit(1040, 0.18, 0.1); // パワーアップ音
        break;
      case 'P': // 1UP（残機+1。最大10まで）
        this.lives = Math.min(this.lives + 1, 10);
        this._updateHud();
        this._snd1Up(); // スーパーマリオ風1UP音
        break;
    }
  }

  _applyMultiball() {
    const speedDefault = Math.min(this.baseSpeed, MAX_SPEED);
    const current = this.balls.slice();
    for (const ball of current) {
      if (this.balls.length >= MAX_BALLS) break;
      // 発射前のボールはまず発射方向を与える
      if (ball.stuck) {
        ball.stuck = false;
        ball.vx = 0;
        ball.vy = -speedDefault;
        ball.stuckOffset = 0;
      }
      const speed = Math.hypot(ball.vx, ball.vy) || speedDefault;
      const baseAngle = Math.atan2(ball.vy, ball.vx);
      for (const da of [MULTIBALL_SPREAD, -MULTIBALL_SPREAD]) {
        if (this.balls.length >= MAX_BALLS) break;
        const a = baseAngle + da;
        this.balls.push(this._makeBall(ball.x, ball.y, Math.cos(a) * speed, Math.sin(a) * speed, false));
      }
    }
  }

  // ===== レーザー =====

  _fireLasers() {
    const p = this.paddle;
    const y = p.y - p.h / 2;
    // 2発が1ブロック幅に収まる狭い間隔（同じブロックに2発当たる）
    const offset = BRICK_W * 0.25;
    this.lasers.push({ x: p.x - offset, y });
    this.lasers.push({ x: p.x + offset, y });
    this._sndLaser(); // バズーカ音
  }

  _updateLasers(dt) {
    const remaining = [];
    for (const laser of this.lasers) {
      laser.y -= LASER_SPEED * dt;
      if (laser.y + LASER_H < 0) continue;
      // ブロック衝突
      let hit = false;
      for (const b of this.bricks) {
        if (!b.alive) continue;
        // x判定をブロック間の隙間の半分ずつ広げ、隙間をすり抜けず必ずどちらかに当てる
        if (laser.x >= b.x - BRICK_GAP / 2 && laser.x <= b.x + b.w + BRICK_GAP / 2 &&
            laser.y <= b.y + b.h && laser.y + LASER_H >= b.y) {
          this._damageBrick(b, true); // レーザーはコンボに数えない
          hit = true;
          break;
        }
      }
      // 最終ブロック破壊でステージが切り替わったら、飛行中レーザーを書き戻さず終了
      if (this._stageJustReset) return; // this.lasers は既に空
      if (!hit) remaining.push(laser);
    }
    this.lasers = remaining;
  }

  // ===== 進行 =====

  _loseLife() {
    this.lives--;
    this.combo = 0;
    this.missedThisStage = true; // ノーミスボーナスを無効化
    this._metalHit(180, 0.22, 0.14);
    this._updateHud();
    if (this.lives <= 0) {
      this._gameOver();
    } else {
      this._resetField();
    }
  }

  _nextStage() {
    // 直前ステージのクリアボーナス
    let bonus = 100;                                   // 基本クリア
    if (!this.missedThisStage) bonus += 300;           // ノーミス
    const timeBonus = Math.max(0, Math.round((25 - this.stageTime) * 8)); // 早クリア
    bonus += timeBonus;
    this._addScore(bonus);

    this.stage++;
    this.baseSpeed = this._speedForStage(this.stage);
    // 1ループ（全ステージ）走破ボーナス
    if ((this.stage - 1) % STAGE_PATTERNS.length === 0) {
      const loop = Math.floor((this.stage - 1) / STAGE_PATTERNS.length); // 2周目=1...
      this._addScore(1000 * loop);
    }

    this._buildBricks();
    this._resetField(); // クリア時はパワーアップを全リセット
    // 次ステージ用カウンタ初期化
    this.missedThisStage = false;
    this.stageTime = 0;
    this._updateStageLabel();
    this._showFlash('STAGE ' + this.stage, 1.2);
    this._playStageJingle(); // 次ステージ開始のファンファーレ
  }

  /** コンボの段階（倍率と文字色）。2→1.2白 / 5→1.4青 / 10→1.6黄 / 15→1.8緑 / 20→2.0赤 */
  _comboTier() {
    const c = this.combo;
    if (c >= 20) return { mult: 2.0, color: '#f87171' }; // 赤
    if (c >= 15) return { mult: 1.8, color: '#4ade80' }; // 緑
    if (c >= 10) return { mult: 1.6, color: '#fde047' }; // 黄
    if (c >= 5)  return { mult: 1.4, color: '#60a5fa' }; // 青
    if (c >= 2)  return { mult: 1.2, color: '#ffffff' }; // 白
    return { mult: 1.0, color: '#ffffff' };
  }

  _comboMult() {
    return this._comboTier().mult;
  }

  /** スマホの軽い振動（対応端末のみ／デモ無効） */
  _vibrate(ms) {
    if (this.demo) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 無視 */ }
  }

  _gameOver() {
    if (this.isOver) return;
    this.isOver = true;
    this.onGameOver({
      nickname: this.nickname,
      score: this.score,
      maxCombo: this.maxCombo,
      stage: this.stage,
      loop: Math.floor((this.stage - 1) / STAGE_PATTERNS.length) + 1,
    });
  }

  _addScore(points) {
    this.score += points;
    this.onScore(this.score);
    this.scorePop = 1; // カウントアップのポップ演出をトリガー
  }

  /** 右上スコアを実スコアへ滑らかにカウントアップ＋加算時にポンッと拡大＆金色フラッシュ */
  _updateScoreDisplay(dt) {
    if (!this.scoreEl) return;
    const diff = this.score - this.scoreDisplay;
    if (Math.abs(diff) < 1) this.scoreDisplay = this.score;
    else this.scoreDisplay += diff * Math.min(1, dt * 12);
    this.scoreEl.textContent = Math.round(this.scoreDisplay).toLocaleString();

    if (this.scorePop > 0) this.scorePop = Math.max(0, this.scorePop - dt * 4);
    const pop = this.scorePop;
    this.scoreEl.style.transform = 'scale(' + (1 + 0.3 * pop) + ')';
    this.scoreEl.style.color = 'rgb(255,' + Math.round(255 - 31 * pop) + ',' + Math.round(255 - 184 * pop) + ')';
  }

  _updateHud() {
    // 表示は「予備の残機」（いまプレイ中の1球は含めない）。3回ミスでゲームオーバー＝開始時パプ太郎2つ
    if (this.livesEl) {
      const n = Math.max(0, this.lives - 1);
      this.livesEl.innerHTML = '<img src="./paputaro.png" class="life-icon" alt="">'.repeat(n);
    }
  }

  _updateStageLabel() {
    if (this.stageEl) this.stageEl.textContent = 'STAGE ' + this.stage;
  }

  _showFlash(text, sec) {
    this.flashText = text;
    this.flashTimer = sec;
  }

  // ===== 描画 =====

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    bg.addColorStop(0, '#150826');
    bg.addColorStop(1, '#08010f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    this._drawBricks(ctx);
    this._drawLasers(ctx);
    this._drawPaddle(ctx);
    this._drawFloorPlate(ctx); // パプ太郎の切れ目を隠す銀の板
    this._drawBalls(ctx);
    this._drawCapsules(ctx);
    this._drawOverlays(ctx);
  }

  /** 画面下端に銀の板を横一直線に引く（パプ太郎の下半身の切れ目を自然に隠す） */
  _drawFloorPlate(ctx) {
    const ph = 18;
    const py = FIELD_H - ph;
    const g = ctx.createLinearGradient(0, py, 0, FIELD_H);
    g.addColorStop(0, '#e2e8f0');
    g.addColorStop(0.5, '#94a3b8');
    g.addColorStop(1, '#5b626d');
    ctx.fillStyle = g;
    ctx.fillRect(0, py, FIELD_W, ph);
    // 上端の照りハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, py, FIELD_W, 2);
  }

  _drawBricks(ctx) {
    for (const b of this.bricks) {
      if (!b.alive) continue;

      // 銀：金属的な縦グラデーションで「銀色」の光沢を出す
      if (b.type === 'silver') {
        const sets = [
          ['#dfe3ea', '#aeb6c2', '#848d9b', '#5b626d'], // hp3（明るい銀）
          ['#bcc2cc', '#959daa', '#6f7783', '#4c525b'], // hp2
          ['#9aa1ad', '#7c838f', '#5c626c', '#3d424a'], // hp1
        ][b.hp >= 3 ? 0 : b.hp === 2 ? 1 : 2];
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, sets[0]);
        g.addColorStop(0.46, sets[1]);
        g.addColorStop(0.54, sets[2]);
        g.addColorStop(1, sets[3]);
        ctx.fillStyle = g;
        this._roundRect(ctx, b.x, b.y, b.w, b.h, 5);
        ctx.fill();
        // 上端の細い鋭いハイライト（金属の照り）
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        this._roundRect(ctx, b.x + 2, b.y + 1.5, b.w - 4, 2, 1.5);
        ctx.fill();
        // 下端の影で立体感
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        this._roundRect(ctx, b.x + 2, b.y + b.h - 3, b.w - 4, 2, 1.5);
        ctx.fill();
        continue;
      }

      ctx.fillStyle = this._brickColor(b);
      this._roundRect(ctx, b.x, b.y, b.w, b.h, 5);
      ctx.fill();
      // 上面のハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      this._roundRect(ctx, b.x, b.y, b.w, b.h * 0.4, 5);
      ctx.fill();
      // 金は枠線で強調
      if (b.type === 'gold') {
        ctx.strokeStyle = 'rgba(120,53,15,0.9)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 4);
        ctx.stroke();
      }
    }
  }

  _brickColor(b) {
    if (b.type === 'gold') return '#fbbf24';
    return b.color;
  }

  _drawPaddle(ctx) {
    const p = this.paddle;
    // パプ太郎（角の上にバーが乗る。下半身は画面外でもよい）
    if (this.paputaroLoaded) {
      const pw = PADDLE_PAPUTARO_W;
      const ph = pw * (PAPUTARO_NAT_H / PAPUTARO_NAT_W);
      const px = p.x - pw / 2;
      const py = p.y + p.h / 2 - ph * PAPUTARO_RAISE_RATIO;
      ctx.drawImage(this.paputaroImg, px, py, pw, ph);
    }

    // バー（レーザー中は赤、通常は紫）
    const grad = ctx.createLinearGradient(0, p.y - p.h / 2, 0, p.y + p.h / 2);
    if (this.laser) { grad.addColorStop(0, '#fecaca'); grad.addColorStop(1, '#ef4444'); }
    else { grad.addColorStop(0, '#e9d5ff'); grad.addColorStop(1, '#7c3aed'); }
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(168,85,247,0.8)';
    ctx.shadowBlur = 16;
    this._roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawBalls(ctx) {
    for (const ball of this.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      if (this.through) {
        // 貫通中は赤いグラデーションのボール
        const g = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
        g.addColorStop(0, '#fee2e2');
        g.addColorStop(0.5, '#ef4444');
        g.addColorStop(1, '#991b1b');
        ctx.fillStyle = g;
        ctx.shadowColor = 'rgba(239,68,68,0.95)';
      } else {
        ctx.fillStyle = '#fdf4ff';
        ctx.shadowColor = 'rgba(192,132,252,0.9)';
      }
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _drawCapsules(ctx) {
    const iw = 36;
    const ih = iw * (PAPUTARO_NAT_H / PAPUTARO_NAT_W);
    for (const cap of this.capsules) {
      const def = CAPSULE_TYPES[cap.type];

      if (cap.type === 'P') {
        // 1UP だけパプ太郎の見た目（緑のグロー＋小さな緑バッジ）
        if (this.paputaroLoaded) {
          ctx.shadowColor = def.color;
          ctx.shadowBlur = 14;
          ctx.drawImage(this.paputaroImg, cap.x - iw / 2, cap.y - ih / 2, iw, ih);
          ctx.shadowBlur = 0;
        }
        const by = cap.y + ih * 0.18;
        ctx.beginPath();
        ctx.arc(cap.x, by, 8, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();
        ctx.fillStyle = '#0b0014';
        ctx.font = '700 11px "Orbitron", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', cap.x, by + 0.5);
        ctx.textBaseline = 'alphabetic';
        continue;
      }

      // その他（E/D/L/T）はカプセル（色つき＋文字）
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      this._roundRect(ctx, cap.x - CAPSULE_W / 2, cap.y - CAPSULE_H / 2, CAPSULE_W, CAPSULE_H, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0014';
      ctx.font = '700 12px "Orbitron", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, cap.x, cap.y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
  }

  _drawLasers(ctx) {
    ctx.fillStyle = '#fca5a5';
    ctx.shadowColor = 'rgba(239,68,68,0.9)';
    ctx.shadowBlur = 10;
    for (const laser of this.lasers) {
      ctx.fillRect(laser.x - LASER_W / 2, laser.y, LASER_W, LASER_H);
    }
    ctx.shadowBlur = 0;
  }

  _drawOverlays(ctx) {
    // コンボ表示（2連鎖以上の間ずっと表示。加算のたびに「ぴょん」と跳ねる。段階で色変化）
    if (this.combo >= 2 && !this.isOver) {
      const tier = this._comboTier();
      const pop = this.comboPop;
      const hop = Math.sin(pop * Math.PI) * 10; // 上にホップして戻る
      const scale = 1 + 0.22 * pop;
      ctx.save();
      ctx.translate(FIELD_W / 2, 46 - hop);
      ctx.scale(scale, scale);
      ctx.fillStyle = tier.color;
      ctx.font = '800 24px "Orbitron", system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 4;

      // 「×1.2」の小数点が「×12」に見えないよう、点を大きな丸で明示的に描く
      const m = tier.mult.toFixed(1);            // 例 "1.2"
      const dot = m.indexOf('.');
      const intPart = m.slice(0, dot);           // "1"
      const decPart = m.slice(dot + 1);          // "2"
      const left = this.combo + ' COMBO  ×' + intPart;
      const dotGap = 11;
      const wLeft = ctx.measureText(left).width;
      const wDec = ctx.measureText(decPart).width;
      const total = wLeft + dotGap + wDec;
      let x = -total / 2;
      ctx.textAlign = 'left';
      ctx.fillText(left, x, 0);
      x += wLeft;
      ctx.beginPath();
      ctx.arc(x + dotGap / 2, -2, 3.2, 0, Math.PI * 2); // はっきりした小数点
      ctx.fill();
      x += dotGap;
      ctx.fillText(decPart, x, 0);

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    const anyStuck = this.balls.some((b) => b.stuck);
    if (anyStuck && !this.isOver) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 18px "Orbitron", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('タップで発射', FIELD_W / 2, FIELD_H - 110);
    }

    if (this.flashTimer > 0) {
      ctx.globalAlpha = Math.min(1, this.flashTimer * 1.5);
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '900 44px "Orbitron", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.flashText, FIELD_W / 2, FIELD_H / 2);
      ctx.globalAlpha = 1;
    }

    if (this.isPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.fillStyle = '#fff';
      ctx.font = '900 40px "Orbitron", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', FIELD_W / 2, FIELD_H / 2);
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ===== サウンド（厚みのある上質な金属チャイム） =====

  /** マスター出力（ローパス＋ディレイ残響）を一度だけ構築する */
  _ensureAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = this.audioContext;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this._audioReady) return ctx;

    // マスター → ローパス（角を取って上質に）→ 出力
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    lp.Q.value = 0.4;
    master.connect(lp);
    lp.connect(ctx.destination);

    // 軽い残響（ステレオ感のあるフィードバックディレイ）
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.12;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wetIn = ctx.createGain();   // 各音からの送り先
    wetIn.gain.value = 0.5;
    wetIn.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(master);

    this._audioMaster = master;
    this._audioWet = wetIn;
    this._audioReady = true;
    return ctx;
  }

  /**
   * 厚みのある金属チャイムを鳴らす。
   * ベル風の倍音＋きらめきトランジェント＋残響で、チープにならない豪華な音にする。
   */
  _metalHit(freq, dur, vol = 0.1) {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const now = ctx.currentTime;

      // 明るく安定した整数倍音（メジャー感。不協和なデチューンは使わない）
      const partials = [
        { ratio: 1, type: 'triangle', gain: 1.0 },
        { ratio: 2, type: 'sine', gain: 0.5 },
        { ratio: 3, type: 'sine', gain: 0.26 },
        { ratio: 4, type: 'sine', gain: 0.12 },
      ];
      partials.forEach((pt) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = pt.type;
        osc.frequency.setValueAtTime(freq * pt.ratio, now);
        const peak = vol * pt.gain;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + dur);
        osc.connect(gain);
        gain.connect(this._audioMaster); // ドライ
        gain.connect(this._audioWet);    // 残響へ送る
        osc.start(now);
        osc.stop(now + dur + 0.05);
      });

      // きらめき（高音の短いトランジェント）で抜けの良さを足す
      const spark = ctx.createOscillator();
      const sg = ctx.createGain();
      spark.type = 'sine';
      spark.frequency.setValueAtTime(freq * 5, now);
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.exponentialRampToValueAtTime(vol * 0.22, now + 0.004);
      sg.gain.exponentialRampToValueAtTime(0.0004, now + Math.min(dur, 0.09));
      spark.connect(sg);
      sg.connect(this._audioMaster);
      spark.start(now);
      spark.stop(now + 0.12);
    } catch (e) {
      // 無音で続行
    }
  }

  /** 銀・金ブロック用：とても高い金属音＋たっぷりの残響 */
  _sndHard(freq = 3200, dur = 0.45, vol = 0.09) {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const now = ctx.currentTime;
      const partials = [
        { ratio: 1, type: 'sine', gain: 1.0 },
        { ratio: 2, type: 'sine', gain: 0.55 },
        { ratio: 3, type: 'sine', gain: 0.3 },
      ];
      partials.forEach((pt) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = pt.type;
        osc.frequency.setValueAtTime(freq * pt.ratio, now);
        const peak = vol * pt.gain;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);
        osc.connect(gain);
        gain.connect(this._audioMaster);
        // 残響を強めに送る（2回つないで深い余韻に）
        gain.connect(this._audioWet);
        gain.connect(this._audioWet);
        osc.start(now);
        osc.stop(now + dur + 0.08);
      });
    } catch (e) { /* 無音で続行 */ }
  }

  /** レーザー発射：重厚で迫力のあるバズーカ音（深い低音ブーム＋歪みボディ＋爆風ノイズ＋着弾クラック） */
  _sndLaser() {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const now = ctx.currentTime;

      // 1) 深いサブベースのブーム（ドゥゥン…）。サイン波でクリーンな重低音
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(210, now);
      sub.frequency.exponentialRampToValueAtTime(36, now + 0.34);
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
      sg.gain.exponentialRampToValueAtTime(0.0006, now + 0.42);
      sub.connect(sg);
      sg.connect(this._audioMaster);
      sg.connect(this._audioWet); // 残響で重厚感
      sub.start(now);
      sub.stop(now + 0.46);

      // 2) 歪んだボディ（迫力の芯）。ノコギリ波＋ローパスで轟き
      const body = ctx.createOscillator();
      const bodyLp = ctx.createBiquadFilter();
      const byg = ctx.createGain();
      body.type = 'sawtooth';
      body.frequency.setValueAtTime(150, now);
      body.frequency.exponentialRampToValueAtTime(44, now + 0.3);
      bodyLp.type = 'lowpass';
      bodyLp.frequency.setValueAtTime(900, now);
      bodyLp.frequency.exponentialRampToValueAtTime(140, now + 0.3);
      byg.gain.setValueAtTime(0.0001, now);
      byg.gain.exponentialRampToValueAtTime(0.3, now + 0.008);
      byg.gain.exponentialRampToValueAtTime(0.0006, now + 0.34);
      body.connect(bodyLp);
      bodyLp.connect(byg);
      byg.connect(this._audioMaster);
      byg.connect(this._audioWet);
      body.start(now);
      body.stop(now + 0.36);

      // 3) 爆風ノイズ（ドシャッ）。ローパスを急降下させて空気の塊感
      const dur = 0.26;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.setValueAtTime(2600, now);
      nf.frequency.exponentialRampToValueAtTime(180, now + dur);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.42, now + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0005, now + dur);
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(this._audioMaster);
      ng.connect(this._audioWet);
      noise.start(now);
      noise.stop(now + dur + 0.02);

      // 4) 着弾クラック（バチッ）。ごく短い高域ノイズで発射の鋭さを足す
      const cdur = 0.05;
      const cbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * cdur), ctx.sampleRate);
      const cd = cbuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
      const crack = ctx.createBufferSource();
      crack.buffer = cbuf;
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.setValueAtTime(1800, now);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.3, now);
      cg.gain.exponentialRampToValueAtTime(0.0004, now + cdur);
      crack.connect(cf);
      cf.connect(cg);
      cg.connect(this._audioMaster);
      crack.start(now);
      crack.stop(now + cdur + 0.01);
    } catch (e) { /* 無音で続行 */ }
  }

  /** 拡大(E)取得：低音の「ビヨーン」（ピッチが上がって下がるバネ音） */
  _sndExtend() {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.12); // ビヨ↑
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.45); // ーン↓
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.5);
      osc.connect(gain);
      gain.connect(this._audioMaster);
      gain.connect(this._audioWet);
      osc.start(now);
      osc.stop(now + 0.55);
    } catch (e) { /* 無音で続行 */ }
  }

  /** 玉をバーで弾く音：明るく弾むポップ（上にしゃくる＋きらめき倍音） */
  _sndPaddle() {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const now = ctx.currentTime;
      // 本体：軽く上にしゃくって明るい「ポンッ」
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05); // 上昇で明るく
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.13, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 0.12);
      osc.connect(g);
      g.connect(this._audioMaster);
      g.connect(this._audioWet);
      osc.start(now);
      osc.stop(now + 0.15);
      // きらめき：高い倍音を少し足して抜けの良さを出す
      const s = ctx.createOscillator();
      const sg = ctx.createGain();
      s.type = 'sine';
      s.frequency.setValueAtTime(1760, now);
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.exponentialRampToValueAtTime(0.06, now + 0.004);
      sg.gain.exponentialRampToValueAtTime(0.0004, now + 0.08);
      s.connect(sg);
      sg.connect(this._audioMaster);
      s.start(now);
      s.stop(now + 0.1);
    } catch (e) { /* 無音で続行 */ }
  }

  /** 1UP取得音：スーパーマリオ風（矩形波で軽快に駆け上がるアルペジオ） */
  _snd1Up() {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const t0 = ctx.currentTime;
      const note = (freq, at, dur) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0006, t0 + at + dur);
        osc.connect(g);
        g.connect(this._audioMaster);
        g.connect(this._audioWet);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.03);
      };
      // マリオの1UP風：E5 G5 E6 C6 D6 G6 を素早く
      const seq = [659, 784, 1319, 1047, 1175, 1568];
      const step = 0.13;
      seq.forEach((f, i) => note(f, i * step, 0.15));
    } catch (e) { /* 無音で続行 */ }
  }

  /** ステージ開始のファンファーレ（約3秒。「出動するぞ！」とわくわくする上昇＋締めの和音） */
  _playStageJingle() {
    if (this.demo) return; // デモは無音
    try {
      const ctx = this._ensureAudio();
      const t0 = ctx.currentTime;
      const note = (freq, at, dur, vol, type = 'square') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0006, t0 + at + dur);
        osc.connect(g);
        g.connect(this._audioMaster);
        g.connect(this._audioWet);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.05);
      };
      // 低音ベース（迫力の土台）
      note(98, 0.0, 1.5, 0.12, 'triangle');   // G2
      // ファンファーレ（駆け上がり）C major
      note(392, 0.00, 0.16, 0.14); // G4
      note(523, 0.16, 0.16, 0.14); // C5
      note(659, 0.32, 0.16, 0.14); // E5
      note(784, 0.48, 0.30, 0.16); // G5
      note(659, 0.82, 0.14, 0.13); // E5
      note(784, 0.98, 0.50, 0.16); // G5
      // ※締めの「ジャーン」和音は不要のため削除
    } catch (e) { /* 無音で続行 */ }
  }

  /** 自己ベスト更新の祝福ジングル（キラキラ上昇＋締め） */
  _playRecordJingle() {
    if (this.demo) return;
    try {
      const ctx = this._ensureAudio();
      const t0 = ctx.currentTime;
      const note = (freq, at, dur, vol, type = 'triangle') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, t0 + at + dur);
        osc.connect(g);
        g.connect(this._audioMaster);
        g.connect(this._audioWet);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.05);
      };
      // 軽快な上昇アルペジオ＋キラキラ
      const seq = [523, 659, 784, 1046, 1319];
      seq.forEach((f, i) => note(f, i * 0.09, 0.18, 0.13, 'square'));
      // 締めの和音
      [784, 1046, 1319].forEach((f) => note(f, 0.5, 0.9, 0.11, 'triangle'));
      // キラキラ高音
      note(2093, 0.55, 0.5, 0.05, 'sine');
    } catch (e) { /* 無音で続行 */ }
  }
}

if (typeof window !== 'undefined') {
  window.BreakerGame = BreakerGame;
}
