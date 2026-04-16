const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Increase canvas for a wider city view
canvas.width = 800;
canvas.height = 350;

const GROUND_Y = 290;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const INITIAL_SPEED = 5;
const MAX_SPEED = 14;

// Difficulty milestones – mechanics unlock before speed ramps up
const TUNNEL_SCORE = 400;         // Score to start spawning underground tunnels
const ADVANCED_PHASE_SCORE = 800; // Score threshold to unlock double jump + firewalls
const JETPACK_SCORE = 1200;       // Score to unlock jetpack hover

// Speed / intensity milestones (kick in after all mechanics are available)
const SPEED_TIER_SCORE = 1500;
const FAST_DRONE_SCORE = 2000;
const COMBO_OBSTACLE_SCORE = 2500;

// ── Shooting / projectile constants ──
const BULLET_SPEED = 10;
const BULLET_WIDTH = 12;
const BULLET_HEIGHT = 3;
const SHOOT_COOLDOWN = 12; // frames between shots (~0.2s)
const DRONE_KILL_SCORE = 50;

// ── Time-of-day cycle ──
// Each "period" lasts a score range. The cycle loops.
const TIME_PERIODS = [
  { name: "DUSK",         scoreLen: 300,  sky: ["#1a0825","#2e1248","#441868"], starAlpha: 0.15, moonAlpha: 0.06, haze: "rgba(120,30,80,0.08)", roadGlow: "#ff00ff" },
  { name: "NIGHT",        scoreLen: 350,  sky: ["#020208","#060614","#0c0c24"], starAlpha: 0.6,  moonAlpha: 0.15, haze: null,                   roadGlow: "#ff00ff" },
  { name: "ACID RAIN",    scoreLen: 350,  sky: ["#061010","#0c1820","#142830"], starAlpha: 0.05, moonAlpha: 0.03, haze: "rgba(0,255,80,0.07)",  roadGlow: "#00ff66" },
  { name: "MIDNIGHT",     scoreLen: 400,  sky: ["#000004","#030310","#08081c"], starAlpha: 0.8,  moonAlpha: 0.20, haze: null,                   roadGlow: "#cc00ff" },
  { name: "NEON FOG",     scoreLen: 350,  sky: ["#100818","#1e1030","#2c1848"], starAlpha: 0.1,  moonAlpha: 0.05, haze: "rgba(180,0,255,0.08)", roadGlow: "#ff00cc" },
  { name: "STORM",        scoreLen: 400,  sky: ["#080818","#101028","#181838"], starAlpha: 0.02, moonAlpha: 0.02, haze: "rgba(100,100,180,0.06)", roadGlow: "#6666ff" },
  { name: "LATE NIGHT",   scoreLen: 350,  sky: ["#020206","#060612","#0a0a20"], starAlpha: 0.7,  moonAlpha: 0.18, haze: null,                   roadGlow: "#ff00ff" },
  { name: "PRE-DAWN",     scoreLen: 300,  sky: ["#140820","#201038","#301850"], starAlpha: 0.35, moonAlpha: 0.10, haze: "rgba(100,40,80,0.06)", roadGlow: "#ff44aa" },
];
const TIME_CYCLE_LEN = TIME_PERIODS.reduce((s, p) => s + p.scoreLen, 0);

function getCurrentTimePeriod() {
  let cycleScore = score % TIME_CYCLE_LEN;
  for (const period of TIME_PERIODS) {
    if (cycleScore < period.scoreLen) return period;
    cycleScore -= period.scoreLen;
  }
  return TIME_PERIODS[0];
}

// Get blend factor (0-1) of how far into the current period we are
function getTimePeriodProgress() {
  let cycleScore = score % TIME_CYCLE_LEN;
  for (const period of TIME_PERIODS) {
    if (cycleScore < period.scoreLen) return cycleScore / period.scoreLen;
    cycleScore -= period.scoreLen;
  }
  return 0;
}

// ── Weather state ──
let weatherParticles = [];
let lightningTimer = 0;
let lightningFlash = 0;

const PLAYER_WIDTH = 36;
const PLAYER_HEIGHT = 50;
const DUCK_HEIGHT = 25;
const DOUBLE_JUMP_FORCE = -11;

// Underground tunnel constants
const UNDERGROUND_Y = 340;        // Ground level inside tunnel (50px below GROUND_Y)
const TUNNEL_CEILING_Y = 40;      // Top of tunnel visual ceiling for immersive mode

// Jetpack constants
const JETPACK_MAX_FUEL = 100;
const JETPACK_BURN_RATE = 1.2;    // per frame (~83 frames = ~1.4 sec)
const JETPACK_RECHARGE_RATE = 0.8; // per frame on ground

// Mobile / touch detection
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// Leaderboard helpers (localStorage with in-memory cache)
let _leaderboardCache = null;
function loadLeaderboard() {
  if (_leaderboardCache) return _leaderboardCache;
  try {
    _leaderboardCache = JSON.parse(localStorage.getItem("neonSprintLeaderboard")) || [];
  } catch { _leaderboardCache = []; }
  return _leaderboardCache;
}
function saveLeaderboard(board) {
  _leaderboardCache = board;
  try { localStorage.setItem("neonSprintLeaderboard", JSON.stringify(board)); } catch {}
}
function isHighScore(s) {
  const board = loadLeaderboard();
  return board.length < 5 || s > board[board.length - 1].score;
}
function insertScore(initials, s) {
  const board = loadLeaderboard();
  board.push({ initials, score: s });
  board.sort((a, b) => b.score - a.score);
  saveLeaderboard(board.slice(0, 5));
}
function renderLeaderboardHTML(containerId) {
  const container = document.getElementById(containerId);
  const board = loadLeaderboard();
  if (board.length === 0) { container.innerHTML = '<div class="leaderboard-title">TOP RUNNERS</div><p class="lb-empty">NO SCORES YET</p>'; return; }
  let html = '<div class="leaderboard-title">TOP RUNNERS</div><table class="leaderboard-table">';
  board.forEach((entry, i) => {
    html += `<tr><td class="lb-rank">${i + 1}.</td><td class="lb-initials">${entry.initials}</td><td class="lb-score">${String(entry.score).padStart(6, "0")}</td></tr>`;
  });
  html += "</table>";
  container.innerHTML = html;
}

// Game state: start | playing | paused | gameover | entering_initials
let state = "start";
let score = 0;
let highScore = (loadLeaderboard()[0] || {}).score || 0;
let gameSpeed = INITIAL_SPEED;
let frameCount = 0;
let obstacles = [];
let particles = [];
let groundOffset = 0;
let tunnelUnlocked = false;     // tracks if we've shown the tunnel unlock notification
let tunnelFlashTimer = 0;
let doubleJumpUnlocked = false; // tracks if we've shown the unlock notification
let unlockFlashTimer = 0;
let gameOverTime = 0; // timestamp to prevent instant restart
let difficultyTier = ""; // current difficulty tier label
let initialsEntry = { chars: [65, 65, 65], pos: 0 }; // for arcade initials input
let resumeGraceFrames = 0; // brief collision immunity after unpausing
let touchHintTimer = 0; // frames to show touch zone hints after game start
let isFirstStart = true; // true only for the very first game after page load

// Jetpack state
let jetpackUnlocked = false;
let jetpackFuel = JETPACK_MAX_FUEL;
let jetpackActive = false;
let jetpackFlashTimer = 0;

// Underground tunnel state
let tunnel = null;      // { x, entranceWidth, bodyWidth, exitWidth }
let playerUnderground = false; // is the player currently below GROUND_Y?
let tunnelObstacleTimer = 0;
let tunnelExitGrace = 0;  // frames of obstacle-spawn grace after exiting tunnel
let wasUnderground = false; // track transition for grace period

// Shooting state
let projectiles = [];   // { x, y, vx }
let shootCooldown = 0;
let droneKills = 0;     // total drones destroyed this run
let killFlashTimer = 0; // screen flash on kill
let lastKillText = "";  // "+50" popup
let currentTimePeriodName = ""; // track for transition detection
let timePeriodFlashTimer = 0;  // flash when period changes

// Unlock tutorial pause state
let unlockPause = null; // { title, lines, color } when active

// Countdown state (after dismissing unlock pause dialogs)
let countdownTimer = 0;        // frames remaining in countdown
let countdownNumber = 0;       // current number to display (3, 2, 1)
const COUNTDOWN_SECONDS = 3;
const FRAMES_PER_SECOND = 60;

// Stats tracking
let maxSpeedReached = 0;
let gameStartTime = 0;
let screenShake = 0; // frames of shake remaining
let deathFlash = 0; // frames of red flash on death

// City background layers (parallax)
const buildings = [];
const farBuildings = [];

function generateWindowColors(w, h) {
  const winW = 3, winH = 4;
  const cols = Math.floor(w / 10);
  const rows = Math.floor(h / 14);
  const colors = [];
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = 4 + c * 10;
      const wy = 6 + r * 14;
      const lit = Math.sin(wx * 13.7 + wy * 7.3) > 0;
      if (lit) {
        const flicker = Math.random() > 0.98;
        colors.push({
          r, c,
          color: flicker
            ? "#ffaa00"
            : `rgba(${180 + Math.random() * 75}, ${150 + Math.random() * 60}, ${50 + Math.random() * 200}, 0.7)`,
        });
      }
    }
  }
  return colors;
}

function generateBuildings() {
  buildings.length = 0;
  farBuildings.length = 0;

  // Far layer (silhouettes)
  let x = 0;
  while (x < canvas.width + 200) {
    const w = 30 + Math.random() * 60;
    const h = 60 + Math.random() * 120;
    farBuildings.push({
      x,
      w,
      h,
      windows: Math.random() > 0.3,
      windowColors: generateWindowColors(w, h),
      color: `hsl(${260 + Math.random() * 30}, 30%, ${8 + Math.random() * 6}%)`,
    });
    x += w + Math.random() * 10;
  }

  // Near layer
  x = 0;
  while (x < canvas.width + 200) {
    const w = 40 + Math.random() * 70;
    const h = 40 + Math.random() * 90;
    buildings.push({
      x,
      w,
      h,
      windows: Math.random() > 0.2,
      windowColors: generateWindowColors(w, h),
      antenna: Math.random() > 0.6,
      color: `hsl(${240 + Math.random() * 40}, 25%, ${12 + Math.random() * 8}%)`,
      glowColor: ["#ff00ff", "#00ffcc", "#ff6600", "#00aaff"][Math.floor(Math.random() * 4)],
    });
    x += w + Math.random() * 15;
  }
}

generateBuildings();

// Player
const player = {
  x: 80,
  y: GROUND_Y - PLAYER_HEIGHT,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  vy: 0,
  jumping: false,
  ducking: false,
  trailTimer: 0,
  jumpsUsed: 0,    // 0 = grounded, 1 = single jumped, 2 = double jumped
  canDoubleJump: false,
};

// Input
const keys = {};
const justPressed = {}; // Track fresh key presses for double jump

document.addEventListener("keydown", (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;

  if (e.code === "Escape") {
    if (state === "playing") {
      pauseGame();
    } else if (state === "paused" && !unlockPause && countdownTimer <= 0) {
      resumeGame();
    }
    e.preventDefault();
    return;
  }

  // Unlock tutorial pause — Enter/Space clicks the OK button
  if (state === "paused" && unlockPause) {
    if (e.code === "Enter" || e.code === "Space") {
      dismissUnlockPause();
    }
    e.preventDefault();
    return;
  }

  // Block input during countdown
  if (state === "paused" && countdownTimer > 0) {
    e.preventDefault();
    return;
  }

  // R/Q shortcuts for pause menu
  if (state === "paused") {
    if (e.code === "KeyR" || e.key === "r" || e.key === "R") { resumeGame(); e.preventDefault(); return; }
    if (e.code === "KeyQ" || e.key === "q" || e.key === "Q") { quitGame(); e.preventDefault(); return; }
  }

  // Initials entry input
  if (state === "entering_initials") {
    if (e.code === "ArrowUp") {
      initialsEntry.chars[initialsEntry.pos] = (initialsEntry.chars[initialsEntry.pos] - 65 + 1) % 26 + 65;
    } else if (e.code === "ArrowDown") {
      initialsEntry.chars[initialsEntry.pos] = (initialsEntry.chars[initialsEntry.pos] - 65 + 25) % 26 + 65;
    } else if (e.code === "ArrowLeft") {
      initialsEntry.pos = Math.max(0, initialsEntry.pos - 1);
    } else if (e.code === "ArrowRight") {
      initialsEntry.pos = Math.min(2, initialsEntry.pos + 1);
    } else if (e.code === "Enter") {
      confirmInitials();
    }
    e.preventDefault();
    return;
  }

  if (state === "start") {
    startGame();
    e.preventDefault();
  }
  if (state === "gameover" && performance.now() - gameOverTime > 500) {
    startGame();
    e.preventDefault();
  }
  if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS", "Tab"].includes(e.code)) {
    e.preventDefault();
  }
  // Shoot on Tab key
  if (e.code === "Tab" && state === "playing") {
    shootProjectile();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Convert touch/click position from screen coords to canvas-internal coords
function screenToCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

// Touch/click handling for gameplay
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const pos = screenToCanvas(touch.clientX, touch.clientY);

  if (state === "start") {
    startGame();
    return;
  }
  if (state === "gameover" && performance.now() - gameOverTime > 500) {
    startGame();
    return;
  }
  if (state === "entering_initials") {
    handleInitialsTouch(pos.x, pos.y);
    return;
  }
  if (state === "paused" && unlockPause) {
    if (isInsideOkayButton(pos.x, pos.y)) {
      dismissUnlockPause();
    }
    return;
  }
  if (state === "paused") return;
  if (state !== "playing") return;

  // Right third of screen = shoot, left two-thirds = jump/duck
  if (pos.x > canvas.width * 0.66) {
    shootProjectile();
  } else if (pos.y < canvas.height / 2) {
    justPressed["ArrowUp"] = true;
    keys["ArrowUp"] = true;
  } else {
    keys["ArrowDown"] = true;
  }
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  keys["ArrowUp"] = false;
  keys["ArrowDown"] = false;
});

// Mouse click on canvas for OK button in unlock pause dialogs (desktop)
canvas.addEventListener("click", (e) => {
  if (state === "paused" && unlockPause) {
    const rect = canvas.getBoundingClientRect();
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (isInsideOkayButton(pos.x, pos.y)) {
      dismissUnlockPause();
    }
  }
});

function confirmInitials() {
  const initials = String.fromCharCode(...initialsEntry.chars);
  insertScore(initials, Math.floor(score));
  state = "gameover";
  gameOverTime = performance.now();
  showGameOverScreen();
}

function resetGameState() {
  score = 0;
  gameSpeed = INITIAL_SPEED;
  frameCount = 0;
  obstacles = [];
  particles = [];
  player.y = GROUND_Y - PLAYER_HEIGHT;
  player.height = PLAYER_HEIGHT;
  player.vy = 0;
  player.jumping = false;
  player.ducking = false;
  player.jumpsUsed = 0;
  player.canDoubleJump = false;
  tunnelUnlocked = false;
  tunnelFlashTimer = 0;
  doubleJumpUnlocked = false;
  unlockFlashTimer = 0;
  jetpackUnlocked = false;
  jetpackFuel = JETPACK_MAX_FUEL;
  jetpackActive = false;
  jetpackFlashTimer = 0;
  tunnel = null;
  playerUnderground = false;
  tunnelObstacleTimer = 0;
  tunnelExitGrace = 0;
  wasUnderground = false;
  difficultyTier = "";
  weatherParticles = [];
  lightningTimer = 0;
  lightningFlash = 0;
  projectiles = [];
  shootCooldown = 0;
  droneKills = 0;
  killFlashTimer = 0;
  lastKillText = "";
  currentTimePeriodName = "";
  timePeriodFlashTimer = 0;
  unlockPause = null;
  countdownTimer = 0;
  countdownNumber = 0;
  maxSpeedReached = INITIAL_SPEED;
  gameStartTime = performance.now();
  screenShake = 0;
  deathFlash = 0;
  generateBuildings();
}

function startGame() {
  state = "playing";
  resetGameState();
  // Only show touch/control hints on first start after page load
  touchHintTimer = (isTouchDevice && isFirstStart) ? 180 : 0;

  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-screen").classList.add("hidden");
  document.getElementById("pause-screen").classList.add("hidden");

  // Show touch zone overlay briefly on mobile — only on first start
  if (isTouchDevice) {
    const pauseBtn = document.getElementById("pause-btn-mobile");
    pauseBtn.classList.remove("hidden");
    if (isFirstStart) {
      const touchControls = document.getElementById("touch-controls");
      touchControls.classList.remove("hidden");
      setTimeout(() => { touchControls.classList.add("hidden"); }, 3000);
    }
  }
  isFirstStart = false;
}

function pauseGame() {
  if (state !== "playing") return;
  state = "paused";
  document.getElementById("pause-score").textContent =
    "Score: " + Math.floor(score);
  document.getElementById("pause-screen").classList.remove("hidden");
  document.activeElement?.blur(); // prevent buttons from capturing keyboard input
}

function resumeGame() {
  if (state !== "paused") return;
  state = "playing";
  resumeGraceFrames = 10; // ~166ms collision immunity so obstacles near player don't instant-kill
  document.getElementById("pause-screen").classList.add("hidden");
}

// Returns the OK button bounds for unlock pause dialogs (matches drawing code)
function getOkayButtonBounds() {
  const cx = canvas.width / 2;
  const boxW = 320;
  const boxY = 55;
  const boxH = 30 + (unlockPause ? unlockPause.lines.length * 22 : 0) + 55;
  const btnW = 100;
  const btnH = 28;
  const btnX = cx - btnW / 2;
  const btnY = boxY + boxH - 40;
  return { x: btnX, y: btnY, w: btnW, h: btnH };
}

function isInsideOkayButton(px, py) {
  const btn = getOkayButtonBounds();
  return px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h;
}

function dismissUnlockPause() {
  unlockPause = null;
  // Start countdown instead of resuming immediately
  countdownTimer = COUNTDOWN_SECONDS * FRAMES_PER_SECOND;
  countdownNumber = COUNTDOWN_SECONDS;
  // Stay paused during countdown — state remains "paused"
}

function quitGame() {
  state = "start";
  resetGameState();

  document.getElementById("pause-screen").classList.add("hidden");
  document.getElementById("game-over-screen").classList.add("hidden");
  document.getElementById("start-screen").classList.remove("hidden");
  document.getElementById("score-display").textContent = "SCORE 000000";
  if (isTouchDevice) {
    document.getElementById("pause-btn-mobile").classList.add("hidden");
  }
  renderLeaderboardHTML("start-leaderboard");
}

// Pause menu buttons
document.getElementById("resume-btn").addEventListener("click", resumeGame);
document.getElementById("quit-btn").addEventListener("click", quitGame);

// Mobile pause button
document.getElementById("pause-btn-mobile").addEventListener("click", (e) => {
  e.stopPropagation();
  if (state === "playing") {
    pauseGame();
  }
});
document.getElementById("pause-btn-mobile").addEventListener("touchstart", (e) => {
  e.stopPropagation();
});

// Touch handlers for overlay screens (they sit on top of canvas and intercept touches)
document.getElementById("start-screen").addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (state === "start") {
    startGame();
  }
});
document.getElementById("start-screen").addEventListener("click", (e) => {
  if (state === "start") {
    startGame();
  }
});

document.getElementById("game-over-screen").addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (state === "gameover" && performance.now() - gameOverTime > 500) {
    startGame();
  }
});
document.getElementById("game-over-screen").addEventListener("click", (e) => {
  if (state === "gameover" && performance.now() - gameOverTime > 500) {
    startGame();
  }
});

// Handle touch on the whole game container for entering_initials (drawn on canvas but overlay blocks)
document.getElementById("game-container").addEventListener("touchstart", (e) => {
  if (state === "entering_initials") {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = screenToCanvas(touch.clientX, touch.clientY);
    handleInitialsTouch(pos.x, pos.y);
  }
}, true);

function showGameOverScreen() {
  document.getElementById("final-score").textContent = "Score: " + Math.floor(score);
  document.getElementById("high-score").textContent = "Best: " + Math.floor(highScore);

  // Populate stats
  document.getElementById("stat-kills").textContent = droneKills;
  const speedPct = Math.floor(((maxSpeedReached - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED)) * 100);
  document.getElementById("stat-speed").textContent = speedPct + "%";
  const survived = Math.floor((performance.now() - gameStartTime) / 1000);
  document.getElementById("stat-time").textContent = survived + "s";

  renderLeaderboardHTML("game-over-leaderboard");
  document.getElementById("game-over-screen").classList.remove("hidden");
  if (isTouchDevice) {
    document.getElementById("pause-btn-mobile").classList.add("hidden");
  }
}

function gameOver() {
  if (score > highScore) highScore = score;
  screenShake = 15; // ~250ms of screen shake
  deathFlash = 10; // brief red flash

  // Neon explosion particles — more dramatic
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 2 + Math.random() * 3,
      color: ["#ff00ff", "#00ffcc", "#ff4444", "#ffaa00", "#00aaff"][
        Math.floor(Math.random() * 5)
      ],
    });
  }

  // Check if score qualifies for leaderboard
  if (isHighScore(Math.floor(score))) {
    state = "entering_initials";
    initialsEntry = { chars: [65, 65, 65], pos: 0 };
  } else {
    state = "gameover";
    gameOverTime = performance.now();
    showGameOverScreen();
  }
}

// Touch handling for initials entry screen
function handleInitialsTouch(cx, cy) {
  const canvasCX = canvas.width / 2;
  const boxW = 40;
  const boxH = 50;
  const gap = 12;
  const startX = canvasCX - (boxW * 3 + gap * 2) / 2;
  const boxY = 155;

  // Check if tapping on a letter box to select it
  for (let i = 0; i < 3; i++) {
    const bx = startX + i * (boxW + gap);
    if (cx >= bx && cx <= bx + boxW && cy >= boxY && cy <= boxY + boxH) {
      initialsEntry.pos = i;
      return;
    }
  }

  // Check up arrows (above boxes)
  for (let i = 0; i < 3; i++) {
    const bx = startX + i * (boxW + gap);
    if (cx >= bx && cx <= bx + boxW && cy >= boxY - 30 && cy < boxY) {
      initialsEntry.pos = i;
      initialsEntry.chars[i] = (initialsEntry.chars[i] - 65 + 1) % 26 + 65;
      return;
    }
  }

  // Check down arrows (below boxes)
  for (let i = 0; i < 3; i++) {
    const bx = startX + i * (boxW + gap);
    if (cx >= bx && cx <= bx + boxW && cy > boxY + boxH && cy <= boxY + boxH + 30) {
      initialsEntry.pos = i;
      initialsEntry.chars[i] = (initialsEntry.chars[i] - 65 + 25) % 26 + 65;
      return;
    }
  }

  // Check confirm button
  const confirmY = boxY + boxH + 45;
  const confirmW = 140;
  const confirmH = 36;
  const confirmX = canvasCX - confirmW / 2;
  if (cx >= confirmX && cx <= confirmX + confirmW && cy >= confirmY && cy <= confirmY + confirmH) {
    confirmInitials();
    return;
  }
}

// Obstacle types - city themed
function createObstacle() {
  const inAdvancedPhase = score >= ADVANCED_PHASE_SCORE;

  // In advanced phase, 25% chance of firewall (requires double jump)
  if (inAdvancedPhase && Math.random() < 0.25) {
    const h = 155 + Math.floor(Math.random() * 15); // 155-170px tall
    return { x: canvas.width, y: GROUND_Y - h, width: 28, height: h, type: "firewall" };
  }

  const type = Math.random();
  if (type < 0.3) {
    // Traffic barrier
    return { x: canvas.width, y: GROUND_Y - 35, width: 30, height: 35, type: "barrier" };
  } else if (type < 0.55) {
    // Hydrant / bollard
    return { x: canvas.width, y: GROUND_Y - 28, width: 18, height: 28, type: "bollard" };
  } else if (type < 0.8) {
    // Tall server rack / electric box
    return { x: canvas.width, y: GROUND_Y - 55, width: 24, height: 55, type: "server" };
  } else {
    // Drone - hovers up and down
    return {
      x: canvas.width,
      y: GROUND_Y - PLAYER_HEIGHT - 18,
      baseY: GROUND_Y - PLAYER_HEIGHT - 18,
      width: 40,
      height: 20,
      type: "drone",
      spawnTime: performance.now(),
      hoverAmp: 18 + Math.random() * 14,   // 18-32px oscillation amplitude
      hoverSpeed: 1.5 + Math.random() * 1.5, // varied speed
    };
  }
}

// Returns the effective ground Y at a given x position (accounts for tunnel)
function getGroundAt(x) {
  if (!tunnel) return GROUND_Y;
  const t = tunnel;
  const entrEnd = t.x + t.entranceWidth;
  const bodyEnd = entrEnd + t.bodyWidth;
  const exitEnd = bodyEnd + t.exitWidth;

  if (x < t.x || x > exitEnd) return GROUND_Y;
  if (x < entrEnd) {
    // Entrance ramp: interpolate from GROUND_Y down to UNDERGROUND_Y
    const pct = (x - t.x) / t.entranceWidth;
    return GROUND_Y + (UNDERGROUND_Y - GROUND_Y) * pct;
  }
  if (x < bodyEnd) return UNDERGROUND_Y;
  // Exit ramp: interpolate from UNDERGROUND_Y back up to GROUND_Y
  const pct = (x - bodyEnd) / t.exitWidth;
  return UNDERGROUND_Y + (GROUND_Y - UNDERGROUND_Y) * pct;
}

function shootProjectile() {
  if (shootCooldown > 0) return;
  projectiles.push({
    x: player.x + player.width,
    y: player.y + player.height / 2 - BULLET_HEIGHT / 2,
    vx: BULLET_SPEED + gameSpeed,
    life: 1,
  });
  shootCooldown = SHOOT_COOLDOWN;
  // Muzzle flash particles
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: player.x + player.width + 4,
      y: player.y + player.height / 2,
      vx: 2 + Math.random() * 4,
      vy: (Math.random() - 0.5) * 3,
      life: 0.3,
      size: 2 + Math.random() * 2,
      color: ["#00ffcc", "#ffaa00", "#ffffff"][Math.floor(Math.random() * 3)],
    });
  }
}

function updateProjectiles() {
  if (shootCooldown > 0) shootCooldown--;
  if (killFlashTimer > 0) killFlashTimer--;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const b = projectiles[i];
    b.x += b.vx;
    b.life -= 0.008;

    // Check collision with drones
    let hitDrone = false;
    for (let j = obstacles.length - 1; j >= 0; j--) {
      const obs = obstacles[j];
      if (obs.type !== "drone") continue;
      if (b.x + BULLET_WIDTH > obs.x && b.x < obs.x + obs.width &&
          b.y + BULLET_HEIGHT > obs.y && b.y < obs.y + obs.height) {
        // Drone destroyed!
        droneKills++;
        score += DRONE_KILL_SCORE;
        killFlashTimer = 8;
        lastKillText = "+" + DRONE_KILL_SCORE;

        // Explosion particles
        for (let p = 0; p < 18; p++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 4;
          particles.push({
            x: obs.x + obs.width / 2,
            y: obs.y + obs.height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.7 + Math.random() * 0.3,
            size: 2 + Math.random() * 3,
            color: ["#ff4444", "#ff6600", "#ffaa00", "#ff0044", "#ffffff"][Math.floor(Math.random() * 5)],
          });
        }
        // Debris particles (darker, slower)
        for (let p = 0; p < 8; p++) {
          particles.push({
            x: obs.x + Math.random() * obs.width,
            y: obs.y + Math.random() * obs.height,
            vx: (Math.random() - 0.5) * 3,
            vy: 1 + Math.random() * 2,
            life: 0.5,
            size: 2 + Math.random() * 2,
            color: "#333344",
          });
        }

        obstacles.splice(j, 1);
        projectiles.splice(i, 1);
        hitDrone = true;
        break;
      }
    }

    // Remove if off-screen or expired (skip if already removed by drone hit)
    if (!hitDrone && i < projectiles.length && (projectiles[i].x > canvas.width + 20 || projectiles[i].life <= 0)) {
      projectiles.splice(i, 1);
    }
  }
}

function updatePlayer() {
  const jumpKey = justPressed["Space"] || justPressed["ArrowUp"] || justPressed["KeyW"];
  const wantDuck = keys["ArrowDown"] || keys["KeyS"];

  // Check if double jump is unlocked
  player.canDoubleJump = score >= ADVANCED_PHASE_SCORE;
  const maxJumps = player.canDoubleJump ? 2 : 1;

  if (jumpKey && player.jumpsUsed < maxJumps) {
    const isDoubleJump = player.jumpsUsed === 1;
    player.vy = isDoubleJump ? DOUBLE_JUMP_FORCE : JUMP_FORCE;
    player.jumping = true;
    player.jumpsUsed++;

    // Jump particles — different color for double jump
    const pColor = isDoubleJump ? "#ff00ff" : "#00ffcc";
    const currentGround = getGroundAt(player.x + player.width / 2);
    const pY = isDoubleJump ? player.y + player.height : currentGround;
    const count = isDoubleJump ? 10 : 6;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: player.x + player.width / 2 + (Math.random() - 0.5) * 20,
        y: pY,
        vx: (Math.random() - 0.5) * (isDoubleJump ? 5 : 3),
        vy: -Math.random() * (isDoubleJump ? 4 : 3),
        life: isDoubleJump ? 0.8 : 0.6,
        size: isDoubleJump ? 3 : 2,
        color: pColor,
      });
    }
  }

  // Clear justPressed flags
  justPressed["Space"] = false;
  justPressed["ArrowUp"] = false;
  justPressed["KeyW"] = false;

  const groundHere = getGroundAt(player.x + player.width / 2);

  if (wantDuck && !player.jumping) {
    player.ducking = true;
    player.height = DUCK_HEIGHT;
    player.y = groundHere - DUCK_HEIGHT;
  } else {
    player.ducking = false;
    if (!player.jumping) {
      player.height = PLAYER_HEIGHT;
      player.y = groundHere - PLAYER_HEIGHT;
    }
  }

  player.vy += GRAVITY;
  player.y += player.vy;

  // Jetpack hover: hold jump (Space/Up/W) while airborne to hover
  const holdJump = keys["Space"] || keys["ArrowUp"] || keys["KeyW"];
  if (jetpackUnlocked && player.jumping && holdJump && jetpackFuel > 0) {
    jetpackActive = true;
    player.vy *= 0.3;
    player.vy = Math.max(player.vy, -2);
    jetpackFuel -= JETPACK_BURN_RATE;
    if (jetpackFuel < 0) jetpackFuel = 0;
    // Flame particles from feet
    if (Math.random() < 0.7) {
      particles.push({
        x: player.x + player.width / 2 + (Math.random() - 0.5) * 12,
        y: player.y + player.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2 + Math.random() * 3,
        life: 0.5,
        size: 2 + Math.random() * 2,
        color: ["#ff6600", "#ffaa00", "#00ffcc"][Math.floor(Math.random() * 3)],
      });
    }
  } else {
    jetpackActive = false;
  }

  // Recharge jetpack on ground
  if (!player.jumping && jetpackUnlocked) {
    jetpackFuel = Math.min(JETPACK_MAX_FUEL, jetpackFuel + JETPACK_RECHARGE_RATE);
  }

  // Underground: ceiling check — prevent jumping above GROUND_Y when inside tunnel
  if (playerUnderground && player.y < GROUND_Y - player.height) {
    player.y = GROUND_Y - player.height;
    player.vy = 0;
  }

  // Ground landing
  if (player.y >= groundHere - player.height) {
    player.y = groundHere - player.height;
    player.vy = 0;
    player.jumping = false;
    player.jumpsUsed = 0;
  }

  // Track if player is underground
  const prevUnderground = playerUnderground;
  playerUnderground = player.y + player.height > GROUND_Y + 5;

  // Detect tunnel entry — spawn first obstacle quickly
  if (!prevUnderground && playerUnderground) {
    tunnelObstacleTimer = Math.max(35, tunnelObstacleTimer); // fast first spawn
  }

  // Detect tunnel exit transition — grant grace frames
  if (prevUnderground && !playerUnderground) {
    tunnelExitGrace = 60; // ~1 second of no obstacle spawns after surfacing
  }

  // Running trail
  player.trailTimer++;
  if (state === "playing" && player.trailTimer % 3 === 0) {
    particles.push({
      x: player.x,
      y: player.y + player.height - 4,
      vx: -gameSpeed * 0.3,
      vy: (Math.random() - 0.5) * 0.5,
      life: 0.4,
      size: 2 + Math.random() * 2,
      color: "#00ffcc44",
    });
  }
}

function updateTunnel() {
  if (!tunnel) {
    // Spawn check
    if (score >= TUNNEL_SCORE && Math.random() < 0.005) {
      tunnel = {
        x: canvas.width + 100,
        entranceWidth: 60,
        bodyWidth: 1400 + Math.random() * 600,
        exitWidth: 60,
      };
    }
    return;
  }

  tunnel.x -= gameSpeed;

  // Remove when fully off screen
  const totalWidth = tunnel.entranceWidth + tunnel.bodyWidth + tunnel.exitWidth;
  if (tunnel.x + totalWidth < -50) {
    tunnel = null;
    playerUnderground = false;
  }
}

// Create an underground-specific obstacle
function createUndergroundObstacle() {
  const type = Math.random();
  if (type < 0.18) {
    // Pipe at head height — duck under
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - PLAYER_HEIGHT - 10,
      width: 40,
      height: 16,
      type: "pipe",
    };
  } else if (type < 0.32) {
    // Electrified puddle — small, jump over
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - 12,
      width: 35,
      height: 12,
      type: "puddle_zap",
    };
  } else if (type < 0.46) {
    // Laser grid — horizontal beam across path, must duck under
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - PLAYER_HEIGHT + 2,
      width: 60,
      height: 30,
      type: "laser_grid",
      spawnTime: performance.now(),
    };
  } else if (type < 0.58) {
    // Steam vent — erupts from floor, must jump over
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - 40,
      width: 20,
      height: 40,
      type: "steam_vent",
      spawnTime: performance.now(),
    };
  } else if (type < 0.68) {
    // Hanging cables — dangle from ceiling, must duck
    return {
      x: canvas.width,
      y: GROUND_Y,
      width: 30,
      height: UNDERGROUND_Y - GROUND_Y - DUCK_HEIGHT + 2,
      type: "hanging_wire",
      spawnTime: performance.now(),
    };
  } else if (type < 0.78) {
    // Barrel stack — medium height, must jump over
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - 34,
      width: 28,
      height: 34,
      type: "barrel_stack",
    };
  } else if (type < 0.88) {
    // Ceiling crusher — piston slamming down, must time your run through
    return {
      x: canvas.width,
      y: GROUND_Y,
      width: 36,
      height: UNDERGROUND_Y - GROUND_Y - DUCK_HEIGHT + 5,
      type: "crusher",
      spawnTime: performance.now(),
    };
  } else {
    // Toxic gas cloud — wide low cloud, must jump over
    return {
      x: canvas.width,
      y: UNDERGROUND_Y - 28,
      width: 55,
      height: 28,
      type: "toxic_cloud",
      spawnTime: performance.now(),
    };
  }
}

// Create underground combo pairs — two obstacles that require quick reaction
function createUndergroundCombo() {
  const combo = Math.random();
  const pair = [];
  if (combo < 0.35) {
    // Floor obstacle then ceiling obstacle — jump then duck
    pair.push({
      x: canvas.width,
      y: UNDERGROUND_Y - 12,
      width: 35,
      height: 12,
      type: "puddle_zap",
    });
    pair.push({
      x: canvas.width + 200 + Math.random() * 60,
      y: GROUND_Y,
      width: 30,
      height: UNDERGROUND_Y - GROUND_Y - DUCK_HEIGHT + 2,
      type: "hanging_wire",
      spawnTime: performance.now(),
    });
  } else if (combo < 0.7) {
    // Ceiling obstacle then floor obstacle — duck then jump
    pair.push({
      x: canvas.width,
      y: UNDERGROUND_Y - PLAYER_HEIGHT + 2,
      width: 60,
      height: 30,
      type: "laser_grid",
      spawnTime: performance.now(),
    });
    pair.push({
      x: canvas.width + 220 + Math.random() * 60,
      y: UNDERGROUND_Y - 40,
      width: 20,
      height: 40,
      type: "steam_vent",
      spawnTime: performance.now(),
    });
  } else {
    // Double floor hazard — two jumps in quick succession
    pair.push({
      x: canvas.width,
      y: UNDERGROUND_Y - 34,
      width: 28,
      height: 34,
      type: "barrel_stack",
    });
    pair.push({
      x: canvas.width + 200 + Math.random() * 60,
      y: UNDERGROUND_Y - 28,
      width: 55,
      height: 28,
      type: "toxic_cloud",
      spawnTime: performance.now(),
    });
  }
  return pair;
}

function updateObstacles() {
  frameCount++;
  if (tunnelExitGrace > 0) tunnelExitGrace--;
  const minGap = Math.max(55, 100 - gameSpeed * 3);

  if (playerUnderground) {
    // Underground obstacle spawning — tighter gaps than surface
    tunnelObstacleTimer++;
    const ugGap = Math.max(50, minGap); // give player enough time to land and react
    if (tunnelObstacleTimer > ugGap) {
      // 25% chance of combo obstacles (two in quick succession)
      if (Math.random() < 0.25) {
        const combo = createUndergroundCombo();
        for (const obs of combo) obstacles.push(obs);
      } else {
        obstacles.push(createUndergroundObstacle());
      }
      tunnelObstacleTimer = 0;
    }
  } else if (
    tunnelExitGrace <= 0 &&
    frameCount > minGap &&
    (function() {
      if (obstacles.length === 0) return true;
      const rightmost = Math.max(...obstacles.map(o => o.x + o.width));
      return rightmost < canvas.width - 200 - Math.random() * 150;
    })()
  ) {
    // Normal surface obstacle spawning (skip if tunnel entrance is on screen)
    const tunnelOnScreen = tunnel && tunnel.x < canvas.width && tunnel.x > -100;
    if (!tunnelOnScreen) {
      // Combo obstacles: ground + drone pair at high scores (20% chance)
      if (score >= COMBO_OBSTACLE_SCORE && Math.random() < 0.2) {
        obstacles.push({ x: canvas.width, y: GROUND_Y - 35, width: 30, height: 35, type: "barrier" });
        obstacles.push({
          x: canvas.width + 120,
          y: GROUND_Y - PLAYER_HEIGHT - 18,
          baseY: GROUND_Y - PLAYER_HEIGHT - 18,
          width: 40,
          height: 20,
          type: "drone",
          spawnTime: performance.now(),
          hoverAmp: 18 + Math.random() * 14,
          hoverSpeed: 1.5 + Math.random() * 1.5,
        });
      } else {
        obstacles.push(createObstacle());
      }
    }
    frameCount = 0;
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    const speedMult = (obs.type === "drone" && score >= FAST_DRONE_SCORE) ? 1.4 : 1;
    obs.x -= gameSpeed * speedMult;

    // Drone vertical hover oscillation
    if (obs.type === "drone" && obs.baseY !== undefined) {
      const elapsed = (performance.now() - obs.spawnTime) / 1000;
      obs.y = obs.baseY + Math.sin(elapsed * obs.hoverSpeed) * obs.hoverAmp;
    }

    if (obs.x + obs.width < 0) {
      obstacles.splice(i, 1);
    }
  }
}

function checkCollisions() {
  if (resumeGraceFrames > 0) { resumeGraceFrames--; return; }
  const px = player.x + 5;
  const py = player.y + 5;
  const pw = player.width - 10;
  const ph = player.height - 10;

  for (const obs of obstacles) {
    // Skip surface obstacles when player is underground, and vice versa
    const isUndergroundObs = obs.type === "pipe" || obs.type === "puddle_zap" ||
      obs.type === "laser_grid" || obs.type === "steam_vent" || obs.type === "hanging_wire" ||
      obs.type === "barrel_stack" || obs.type === "crusher" || obs.type === "toxic_cloud";
    if (playerUnderground && !isUndergroundObs) continue;
    if (!playerUnderground && isUndergroundObs) continue;
    // Grace period after surfacing — skip surface obstacles near the exit
    if (tunnelExitGrace > 0 && !isUndergroundObs) continue;

    const ox = obs.x + 3;
    const oy = obs.y + 3;
    const ow = obs.width - 6;
    const oh = obs.height - 6;
    if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
      gameOver();
      return;
    }
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.025;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------- DRAWING ----------

function drawSky() {
  const period = getCurrentTimePeriod();
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, period.sky[0]);
  grad.addColorStop(0.5, period.sky[1]);
  grad.addColorStop(1, period.sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, GROUND_Y);

  // Atmospheric haze overlay
  if (period.haze) {
    ctx.fillStyle = period.haze;
    ctx.fillRect(0, 0, canvas.width, GROUND_Y);
  }

  // Lightning flash overlay (for STORM period)
  if (lightningFlash > 0) {
    ctx.fillStyle = `rgba(200, 200, 255, ${lightningFlash * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lightningFlash *= 0.85;
    if (lightningFlash < 0.01) lightningFlash = 0;
  }
}

function drawStars() {
  const period = getCurrentTimePeriod();
  if (period.starAlpha < 0.03) return; // no stars in heavy weather
  const starSeed = [
    [50, 20], [150, 40], [250, 15], [370, 35], [480, 25],
    [560, 50], [650, 18], [720, 42], [100, 55], [310, 48],
    [430, 10], [590, 30], [680, 52], [770, 28], [200, 32],
    [40, 60], [500, 8], [620, 55], [340, 22], [750, 12],
  ];
  const starOffset = (groundOffset * 0.02) % canvas.width;
  for (const [sx, sy] of starSeed) {
    const px = ((sx - starOffset) % canvas.width + canvas.width) % canvas.width;
    const flicker = 0.3 + Math.sin(Date.now() / 800 + sx * 0.5) * 0.25;
    ctx.globalAlpha = flicker * period.starAlpha;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function drawMoon() {
  const period = getCurrentTimePeriod();
  if (period.moonAlpha < 0.03) return; // hidden during storms/rain
  ctx.save();
  ctx.globalAlpha = period.moonAlpha;
  ctx.fillStyle = "#ff88cc";
  ctx.beginPath();
  ctx.arc(680, 50, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = period.moonAlpha * 0.5;
  ctx.fillStyle = "#ff00ff";
  ctx.beginPath();
  ctx.arc(680, 50, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updateWeather() {
  const period = getCurrentTimePeriod();

  // === Acid Rain ===
  if (period.name === "ACID RAIN") {
    // Spawn rain drops
    if (weatherParticles.length < 80) {
      for (let i = 0; i < 3; i++) {
        weatherParticles.push({
          type: "rain",
          x: Math.random() * (canvas.width + 100) - 50,
          y: -10 - Math.random() * 40,
          vx: -1.5 - Math.random(),
          vy: 6 + Math.random() * 4,
          len: 8 + Math.random() * 6,
          life: 1,
        });
      }
    }
  }

  // === Neon Fog ===
  if (period.name === "NEON FOG") {
    if (weatherParticles.length < 25) {
      weatherParticles.push({
        type: "fog",
        x: canvas.width + Math.random() * 100,
        y: 50 + Math.random() * (GROUND_Y - 80),
        radius: 30 + Math.random() * 50,
        vx: -0.5 - Math.random() * 0.8,
        alpha: 0.03 + Math.random() * 0.04,
        hue: Math.random() > 0.5 ? 280 : 300,
        life: 1,
      });
    }
  }

  // === Storm (lightning + heavy rain) ===
  if (period.name === "STORM") {
    // Heavy rain
    if (weatherParticles.length < 120) {
      for (let i = 0; i < 5; i++) {
        weatherParticles.push({
          type: "rain",
          x: Math.random() * (canvas.width + 100) - 50,
          y: -10 - Math.random() * 40,
          vx: -2 - Math.random() * 2,
          vy: 8 + Math.random() * 5,
          len: 10 + Math.random() * 8,
          life: 1,
        });
      }
    }
    // Lightning
    lightningTimer--;
    if (lightningTimer <= 0) {
      lightningFlash = 0.6 + Math.random() * 0.4;
      lightningTimer = 120 + Math.random() * 300; // every 2-7 seconds
    }
  }

  // Update and cull particles
  for (let i = weatherParticles.length - 1; i >= 0; i--) {
    const p = weatherParticles[i];
    p.x += p.vx || 0;
    p.y += (p.vy || 0);
    if (p.type === "rain" && p.y > GROUND_Y) {
      weatherParticles.splice(i, 1);
    } else if (p.type === "fog" && p.x + p.radius < -50) {
      weatherParticles.splice(i, 1);
    }
  }

  // Clean up particles when weather changes
  if (period.name !== "ACID RAIN" && period.name !== "STORM") {
    weatherParticles = weatherParticles.filter(p => p.type !== "rain");
  }
  if (period.name !== "NEON FOG") {
    weatherParticles = weatherParticles.filter(p => p.type !== "fog");
  }
}

function drawWeather() {
  const period = getCurrentTimePeriod();
  ctx.save();

  for (const p of weatherParticles) {
    if (p.type === "rain") {
      // Acid rain = green tint, storm rain = blue-white
      if (period.name === "ACID RAIN") {
        ctx.strokeStyle = "rgba(0, 255, 100, 0.35)";
      } else {
        ctx.strokeStyle = "rgba(150, 170, 220, 0.3)";
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 0.5, p.y + p.len);
      ctx.stroke();
    } else if (p.type === "fog") {
      ctx.fillStyle = `hsla(${p.hue}, 60%, 50%, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Storm: draw lightning bolt on flash
  if (period.name === "STORM" && lightningFlash > 0.3) {
    ctx.save();
    ctx.strokeStyle = `rgba(200, 200, 255, ${lightningFlash * 0.7})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = "#aaaaff";
    ctx.shadowBlur = 15;
    const boltX = 100 + Math.random() * (canvas.width - 200);
    let bx = boltX, by = 0;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    while (by < GROUND_Y - 20) {
      bx += (Math.random() - 0.5) * 30;
      by += 15 + Math.random() * 25;
      ctx.lineTo(bx, Math.min(by, GROUND_Y - 10));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore();
}

function drawCityLayer(layer, speed, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const offset = (groundOffset * speed) % (canvas.width + 400);

  for (const b of layer) {
    const bx = ((b.x - offset) % (canvas.width + 400) + canvas.width + 400) % (canvas.width + 400) - 200;
    const by = GROUND_Y - b.h;

    // Building body
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, by, b.w, b.h);

    // Roof line glow
    ctx.fillStyle = b.glowColor || "#ff00ff";
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillRect(bx, by, b.w, 2);
    ctx.globalAlpha = alpha;

    // Windows (pre-baked colors from generateBuildings)
    if (b.windows && b.windowColors) {
      for (const win of b.windowColors) {
        const wx = bx + 4 + win.c * 10;
        const wy = by + 6 + win.r * 14;
        ctx.fillStyle = win.color;
        ctx.fillRect(wx, wy, 3, 4);
      }
    }

    // Antenna
    if (b.antenna) {
      ctx.strokeStyle = "#333344";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + b.w / 2, by);
      ctx.lineTo(bx + b.w / 2, by - 15);
      ctx.stroke();
      // Blinking red light
      const blink = Math.sin(Date.now() / 500 + bx) > 0;
      if (blink) {
        ctx.fillStyle = "#ff0000";
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillRect(bx + b.w / 2 - 1.5, by - 17, 3, 3);
        ctx.globalAlpha = alpha;
      }
    }
  }
  ctx.restore();
}

function drawGround() {
  groundOffset += gameSpeed;

  // Road surface
  ctx.fillStyle = "#151525";
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

  // Neon road line (break at tunnel entrance/exit)
  const t = Date.now() / 1000;
  const period = getCurrentTimePeriod();
  ctx.strokeStyle = period.roadGlow;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2;
  if (tunnel) {
    const tEnd = tunnel.x + tunnel.entranceWidth + tunnel.bodyWidth + tunnel.exitWidth;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(Math.max(0, tunnel.x), GROUND_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(Math.min(canvas.width, tEnd), GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Glow under the road line (match current time-of-day road color)
  const rgHex = period.roadGlow;
  const rgR = parseInt(rgHex.slice(1,3), 16), rgG = parseInt(rgHex.slice(3,5), 16), rgB = parseInt(rgHex.slice(5,7), 16);
  const roadGlowGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 8);
  roadGlowGrad.addColorStop(0, `rgba(${rgR}, ${rgG}, ${rgB}, 0.2)`);
  roadGlowGrad.addColorStop(1, `rgba(${rgR}, ${rgG}, ${rgB}, 0)`);
  ctx.fillStyle = roadGlowGrad;
  ctx.fillRect(0, GROUND_Y, canvas.width, 8);

  // Dashed center line
  ctx.strokeStyle = "#333355";
  ctx.lineWidth = 1;
  const dashLen = 30;
  const gapLen = 20;
  const totalDash = dashLen + gapLen;
  const off = groundOffset % totalDash;
  for (let x = -off; x < canvas.width; x += totalDash) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 25);
    ctx.lineTo(x + dashLen, GROUND_Y + 25);
    ctx.stroke();
  }

  // Curb glow
  ctx.strokeStyle = "#00ffcc";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + canvas.height - GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y + canvas.height - GROUND_Y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.save();
  const px = player.x;
  const py = player.y;
  const t = Date.now();

  // Glow effect under player
  const playerGround = getGroundAt(px + player.width / 2);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#00ffcc";
  ctx.fillRect(px - 5, playerGround - 2, player.width + 10, 4);
  ctx.globalAlpha = 1;

  if (player.ducking) {
    // Sliding body
    ctx.fillStyle = "#111122";
    ctx.fillRect(px, py + 2, player.width + 6, player.height - 2);
    ctx.fillStyle = "#00ffcc";
    ctx.fillRect(px + 1, py + 3, player.width + 4, player.height - 4);

    // Visor
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(px + player.width, py + 4, 8, 6);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.8;
    ctx.fillRect(px + player.width + 2, py + 5, 4, 3);
    ctx.globalAlpha = 1;
  } else {
    // Body (cyber suit)
    ctx.fillStyle = "#111122";
    ctx.fillRect(px + 4, py + 8, player.width - 8, player.height - 18);
    ctx.fillStyle = "#00ccaa";
    ctx.fillRect(px + 5, py + 9, player.width - 10, player.height - 20);

    // Neon trim lines
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(px + 5, py + 9, player.width - 10, player.height - 20);
    ctx.globalAlpha = 1;

    // Chest detail
    ctx.fillStyle = "#008877";
    ctx.fillRect(px + 10, py + 16, player.width - 20, 3);
    ctx.fillRect(px + 12, py + 22, player.width - 24, 2);

    // Head (helmet)
    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(px + 6, py - 2, player.width - 12, 14);
    ctx.fillStyle = "#1a1a30";
    ctx.fillRect(px + 7, py - 1, player.width - 14, 12);

    // Visor (glowing)
    const visorGlow = 0.7 + Math.sin(t / 200) * 0.3;
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = visorGlow;
    ctx.fillRect(px + player.width - 14, py + 1, 12, 6);
    ctx.fillStyle = "#ff88cc";
    ctx.globalAlpha = visorGlow * 0.6;
    ctx.fillRect(px + player.width - 12, py + 2, 8, 4);
    ctx.globalAlpha = 1;

    // Legs (animated)
    ctx.fillStyle = "#00aa88";
    const legAnim = Math.sin(t / 80) * 5;
    const legL = player.jumping ? 0 : legAnim;
    const legR = player.jumping ? 0 : -legAnim;
    ctx.fillRect(px + 8, py + player.height - 12 + legL, 7, 12 - legL);
    ctx.fillRect(px + player.width - 15, py + player.height - 12 + legR, 7, 12 - legR);

    // Shoe glow
    ctx.fillStyle = "#00ffcc";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(px + 7, py + player.height - 2, 9, 2);
    ctx.fillRect(px + player.width - 16, py + player.height - 2, 9, 2);
    ctx.globalAlpha = 1;

    // Arm
    ctx.fillStyle = "#00aa88";
    const armY = player.jumping ? -4 : Math.sin(t / 100) * 3;
    ctx.fillRect(px + player.width - 4, py + 18 + armY, 7, 5);
  }

  ctx.restore();
}

function drawObstacle(obs) {
  ctx.save();
  const t = Date.now();

  if (obs.type === "barrier") {
    // Traffic barrier with warning stripes
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    // Warning stripes
    ctx.fillStyle = "#ff6600";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(obs.x + 2, obs.y + 4 + i * 11, obs.width - 4, 5);
    }
    // Reflective top
    ctx.fillStyle = "#ff4400";
    ctx.globalAlpha = 0.5 + Math.sin(t / 300) * 0.3;
    ctx.fillRect(obs.x, obs.y, obs.width, 3);
    ctx.globalAlpha = 1;
    // Posts
    ctx.fillStyle = "#444455";
    ctx.fillRect(obs.x + 2, obs.y + obs.height - 6, 4, 6);
    ctx.fillRect(obs.x + obs.width - 6, obs.y + obs.height - 6, 4, 6);
  } else if (obs.type === "bollard") {
    // Neon bollard / fire hydrant
    ctx.fillStyle = "#cc2200";
    ctx.fillRect(obs.x + 3, obs.y + 6, obs.width - 6, obs.height - 6);
    ctx.fillStyle = "#ff3300";
    ctx.fillRect(obs.x + 2, obs.y + 4, obs.width - 4, 8);
    // Top cap
    ctx.fillStyle = "#dd4400";
    ctx.fillRect(obs.x + 1, obs.y, obs.width - 2, 6);
    // Glow ring
    ctx.strokeStyle = "#ff6600";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 + Math.sin(t / 400 + obs.x) * 0.3;
    ctx.strokeRect(obs.x + 1, obs.y + 12, obs.width - 2, 4);
    ctx.globalAlpha = 1;
  } else if (obs.type === "server") {
    // Tall electric box / server rack
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 1;
    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    // Server lights
    for (let i = 0; i < 6; i++) {
      const litColor = Math.sin(t / 300 + i * 2 + obs.x) > 0 ? "#00ff88" : "#003322";
      ctx.fillStyle = litColor;
      ctx.fillRect(obs.x + 4, obs.y + 6 + i * 8, 3, 3);
      ctx.fillStyle = "#222233";
      ctx.fillRect(obs.x + 10, obs.y + 5 + i * 8, obs.width - 14, 5);
    }
    // Hazard stripe at top
    ctx.fillStyle = "#ffcc00";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(obs.x, obs.y, obs.width, 3);
    ctx.globalAlpha = 1;
  } else if (obs.type === "firewall") {
    // Tall energy firewall - requires double jump
    const pulse = Math.sin(t / 150 + obs.x * 0.1);

    // Base structure (dark pillars on sides)
    ctx.fillStyle = "#1a0a2e";
    ctx.fillRect(obs.x, obs.y, 4, obs.height);
    ctx.fillRect(obs.x + obs.width - 4, obs.y, 4, obs.height);

    // Energy field (animated vertical bars)
    for (let row = 0; row < obs.height; row += 4) {
      const wave = Math.sin(t / 200 + row * 0.15) * 0.4;
      const intensity = 0.4 + wave + pulse * 0.2;
      ctx.globalAlpha = Math.max(0.1, Math.min(1, intensity));
      const hue = (row * 2 + t / 10) % 60;
      ctx.fillStyle = `hsl(${280 + hue}, 100%, ${50 + wave * 20}%)`;
      ctx.fillRect(obs.x + 4, obs.y + row, obs.width - 8, 3);
    }
    ctx.globalAlpha = 1;

    // Bright edge glow
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.fillRect(obs.x + 3, obs.y, 2, obs.height);
    ctx.fillRect(obs.x + obs.width - 5, obs.y, 2, obs.height);
    ctx.globalAlpha = 1;

    // Top hazard cap
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = 0.7 + pulse * 0.3;
    ctx.fillRect(obs.x - 2, obs.y - 2, obs.width + 4, 4);
    ctx.globalAlpha = 1;

    // Ambient glow
    ctx.globalAlpha = 0.06 + pulse * 0.03;
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(obs.x - 8, obs.y, obs.width + 16, obs.height);
    ctx.globalAlpha = 1;

  } else if (obs.type === "drone") {
    // Drone body
    ctx.fillStyle = "#333344";
    ctx.fillRect(obs.x + 10, obs.y + 6, obs.width - 20, obs.height - 10);
    ctx.fillStyle = "#444455";
    ctx.fillRect(obs.x + 8, obs.y + 8, obs.width - 16, obs.height - 14);

    // Rotors (animated)
    const rotorPhase = Math.sin(t / 50) * 4;
    ctx.fillStyle = "#666688";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(obs.x - 2, obs.y + 2 + rotorPhase * 0.3, 14, 3);
    ctx.fillRect(obs.x + obs.width - 12, obs.y + 2 - rotorPhase * 0.3, 14, 3);
    ctx.globalAlpha = 1;

    // Eye / sensor
    ctx.fillStyle = "#ff0044";
    ctx.globalAlpha = 0.7 + Math.sin(t / 200) * 0.3;
    ctx.fillRect(obs.x + obs.width / 2 - 3, obs.y + obs.height / 2 - 2, 6, 4);
    ctx.globalAlpha = 1;

    // Bottom light
    ctx.fillStyle = "#ff0044";
    ctx.globalAlpha = 0.2;
    ctx.fillRect(obs.x + obs.width / 2 - 1, obs.y + obs.height - 2, 2, 10);
    ctx.globalAlpha = 1;

    // Hover glow
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ff0044";
    ctx.fillRect(obs.x + 5, obs.y - 4, obs.width - 10, obs.height + 8);
    ctx.globalAlpha = 1;

    // Target reticle — pulsing circle around drone
    const reticleAlpha = 0.2 + Math.sin(t / 150) * 0.15;
    ctx.strokeStyle = "#ff0044";
    ctx.lineWidth = 1;
    ctx.globalAlpha = reticleAlpha;
    const cx = obs.x + obs.width / 2;
    const cy = obs.y + obs.height / 2;
    const rr = 18 + Math.sin(t / 200) * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(cx - rr - 3, cy); ctx.lineTo(cx - rr + 4, cy);
    ctx.moveTo(cx + rr - 4, cy); ctx.lineTo(cx + rr + 3, cy);
    ctx.moveTo(cx, cy - rr - 3); ctx.lineTo(cx, cy - rr + 4);
    ctx.moveTo(cx, cy + rr - 4); ctx.lineTo(cx, cy + rr + 3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (obs.type === "pipe") {
    // Underground pipe — horizontal, industrial
    ctx.fillStyle = "#2a3a2a";
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    ctx.fillStyle = "#3a5a3a";
    ctx.fillRect(obs.x + 2, obs.y + 2, obs.width - 4, obs.height - 4);
    // Rust streaks
    ctx.fillStyle = "#664422";
    ctx.globalAlpha = 0.4;
    ctx.fillRect(obs.x + 8, obs.y + obs.height - 3, 12, 3);
    ctx.globalAlpha = 1;
    // Neon band
    ctx.fillStyle = "#00ff66";
    ctx.globalAlpha = 0.5 + Math.sin(t / 300 + obs.x) * 0.3;
    ctx.fillRect(obs.x, obs.y + obs.height / 2 - 1, obs.width, 2);
    ctx.globalAlpha = 1;
  } else if (obs.type === "puddle_zap") {
    // Electrified puddle on the ground
    const zap = Math.sin(t / 100 + obs.x * 0.3);
    ctx.fillStyle = "#002211";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(obs.x, obs.y + obs.height - 4, obs.width, 4);
    ctx.globalAlpha = 1;
    // Electric arcs
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6 + zap * 0.4;
    for (let i = 0; i < 3; i++) {
      const arcX = obs.x + 5 + i * 10;
      const arcH = 4 + Math.sin(t / 80 + i * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(arcX, obs.y + obs.height - 4);
      ctx.lineTo(arcX + 3, obs.y + obs.height - 4 - arcH);
      ctx.lineTo(arcX + 6, obs.y + obs.height - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Green glow
    ctx.fillStyle = "#00ff88";
    ctx.globalAlpha = 0.08 + zap * 0.04;
    ctx.fillRect(obs.x - 4, obs.y - 8, obs.width + 8, obs.height + 12);
    ctx.globalAlpha = 1;
  } else if (obs.type === "laser_grid") {
    // Horizontal laser beams — red scanning lines
    const elapsed = (t - obs.spawnTime) / 1000;
    const flicker = Math.sin(elapsed * 8) * 0.3;
    ctx.strokeStyle = "#ff0033";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7 + flicker;
    // Draw 3 horizontal beams
    for (let i = 0; i < 3; i++) {
      const by = obs.y + 5 + i * 10;
      ctx.beginPath();
      ctx.moveTo(obs.x, by);
      ctx.lineTo(obs.x + obs.width, by);
      ctx.stroke();
    }
    // Emitter boxes on sides
    ctx.fillStyle = "#440011";
    ctx.globalAlpha = 1;
    ctx.fillRect(obs.x - 3, obs.y, 6, obs.height);
    ctx.fillRect(obs.x + obs.width - 3, obs.y, 6, obs.height);
    // Red glow
    ctx.fillStyle = "#ff0033";
    ctx.globalAlpha = 0.06 + flicker * 0.04;
    ctx.fillRect(obs.x - 4, obs.y - 6, obs.width + 8, obs.height + 12);
    ctx.globalAlpha = 1;
  } else if (obs.type === "steam_vent") {
    // Floor vent erupting steam upward
    const elapsed = (t - obs.spawnTime) / 1000;
    // Vent base (metal grate)
    ctx.fillStyle = "#3a3a4a";
    ctx.fillRect(obs.x, obs.y + obs.height - 6, obs.width, 6);
    ctx.fillStyle = "#555566";
    for (let gx = obs.x + 3; gx < obs.x + obs.width - 3; gx += 5) {
      ctx.fillRect(gx, obs.y + obs.height - 5, 2, 4);
    }
    // Steam column
    ctx.fillStyle = "#aabbcc";
    for (let sy = 0; sy < obs.height - 6; sy += 4) {
      const wobble = Math.sin(elapsed * 6 + sy * 0.3) * 3;
      const fade = 1 - sy / (obs.height - 6);
      ctx.globalAlpha = fade * 0.4;
      ctx.fillRect(obs.x + wobble + 2, obs.y + sy, obs.width - 4, 3);
    }
    ctx.globalAlpha = 1;
    // Hot glow at base
    ctx.fillStyle = "#ff6600";
    ctx.globalAlpha = 0.2 + Math.sin(elapsed * 5) * 0.1;
    ctx.fillRect(obs.x - 2, obs.y + obs.height - 8, obs.width + 4, 8);
    ctx.globalAlpha = 1;
  } else if (obs.type === "hanging_wire") {
    // Cables dangling from tunnel ceiling
    const elapsed = (t - obs.spawnTime) / 1000;
    const sway = Math.sin(elapsed * 2) * 3;
    // Mount point on ceiling
    ctx.fillStyle = "#444455";
    ctx.fillRect(obs.x + 8, obs.y, 14, 5);
    // Wires
    ctx.strokeStyle = "#666688";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const wx = obs.x + 8 + i * 6;
      const wireLen = obs.height - 5 + (i === 1 ? 4 : 0);
      ctx.beginPath();
      ctx.moveTo(wx, obs.y + 5);
      ctx.quadraticCurveTo(wx + sway * (i === 1 ? 1.5 : 1), obs.y + wireLen * 0.5, wx + sway, obs.y + wireLen);
      ctx.stroke();
    }
    // Spark at bottom
    const sparkOn = Math.sin(elapsed * 12 + obs.x) > 0.6;
    if (sparkOn) {
      ctx.fillStyle = "#00ffff";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(obs.x + 12 + sway - 2, obs.y + obs.height - 4, 4, 4);
      ctx.globalAlpha = 1;
    }
  } else if (obs.type === "barrel_stack") {
    // Stacked industrial barrels — jump over
    const barrelW = 14;
    const barrelH = 16;
    // Bottom barrel
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(obs.x + 2, obs.y + barrelH, barrelW * 2 - 4, barrelH);
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(obs.x + 4, obs.y + barrelH + 2, barrelW * 2 - 8, barrelH - 4);
    // Top barrel
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(obs.x + 5, obs.y, barrelW, barrelH);
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(obs.x + 7, obs.y + 2, barrelW - 4, barrelH - 4);
    // Hazard stripe
    ctx.fillStyle = "#ff6600";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(obs.x + 6, obs.y + 6, barrelW - 2, 3);
    ctx.fillRect(obs.x + 3, obs.y + barrelH + 6, barrelW * 2 - 6, 3);
    ctx.globalAlpha = 1;
    // Toxic drip
    const dripPhase = (t + obs.x * 0.5) % 800;
    if (dripPhase < 400) {
      ctx.fillStyle = "#00ff66";
      ctx.globalAlpha = 0.5;
      ctx.fillRect(obs.x + 12, obs.y + obs.height + (dripPhase / 400) * 6, 2, 3);
      ctx.globalAlpha = 1;
    }
  } else if (obs.type === "crusher") {
    // Ceiling piston slamming down — duck under
    const elapsed = (t - obs.spawnTime) / 1000;
    const crushCycle = Math.abs(Math.sin(elapsed * 2.5));
    const pistonY = obs.y;
    const pistonH = obs.height * (0.6 + crushCycle * 0.4);
    // Piston housing on ceiling
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(obs.x - 2, pistonY, obs.width + 4, 10);
    // Piston shaft
    ctx.fillStyle = "#444466";
    ctx.fillRect(obs.x + 4, pistonY + 10, obs.width - 8, pistonH - 16);
    // Piston head
    ctx.fillStyle = "#555577";
    ctx.fillRect(obs.x, pistonY + pistonH - 8, obs.width, 8);
    // Impact sparks when near full extension
    if (crushCycle > 0.85) {
      ctx.fillStyle = "#ffaa00";
      ctx.globalAlpha = (crushCycle - 0.85) * 6;
      for (let sp = 0; sp < 3; sp++) {
        const sx = obs.x + Math.random() * obs.width;
        ctx.fillRect(sx, pistonY + pistonH - 2, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // Warning stripe on head
    ctx.fillStyle = "#ff0033";
    ctx.globalAlpha = 0.4 + Math.sin(elapsed * 8) * 0.2;
    ctx.fillRect(obs.x + 2, pistonY + pistonH - 6, obs.width - 4, 2);
    ctx.globalAlpha = 1;
  } else if (obs.type === "toxic_cloud") {
    // Low-lying toxic gas cloud — jump over
    const elapsed = (t - obs.spawnTime) / 1000;
    // Cloud puffs
    for (let ci = 0; ci < 5; ci++) {
      const cx = obs.x + ci * 11 + Math.sin(elapsed * 1.5 + ci * 1.2) * 3;
      const cy = obs.y + 6 + Math.sin(elapsed * 2 + ci * 0.8) * 4;
      const cr = 8 + Math.sin(elapsed + ci) * 2;
      ctx.fillStyle = "#00ff44";
      ctx.globalAlpha = 0.12 + Math.sin(elapsed * 1.5 + ci) * 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Denser core
    ctx.fillStyle = "#00cc33";
    ctx.globalAlpha = 0.15;
    ctx.fillRect(obs.x + 5, obs.y + 8, obs.width - 10, obs.height - 12);
    ctx.globalAlpha = 1;
    // Skull warning icon (simple pixel art)
    ctx.fillStyle = "#00ff44";
    ctx.globalAlpha = 0.3 + Math.sin(elapsed * 3) * 0.15;
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("☠", obs.x + obs.width / 2, obs.y + obs.height / 2 + 3);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawTunnel() {
  if (!tunnel) return;
  ctx.save();
  const t_now = Date.now();
  const ent = tunnel.x;
  const entEnd = ent + tunnel.entranceWidth;
  const bodyEnd = entEnd + tunnel.bodyWidth;
  const exitEnd = bodyEnd + tunnel.exitWidth;

  if (playerUnderground) {
    // === FULL-SCREEN IMMERSIVE TUNNEL ===

    // Fill entire screen with dark tunnel background
    ctx.fillStyle = "#040410";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle wall texture — dark bricks / panels
    ctx.fillStyle = "#0a0a1a";
    for (let wy = TUNNEL_CEILING_Y; wy < UNDERGROUND_Y; wy += 20) {
      const offset = (wy % 40 === 0) ? 0 : 15;
      for (let wx = ((-groundOffset * 0.6 + offset) % 30) - 30; wx < canvas.width; wx += 30) {
        ctx.fillRect(wx, wy, 28, 18);
      }
    }

    // Ceiling — thick industrial beam
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, TUNNEL_CEILING_Y - 8, canvas.width, 12);
    ctx.fillStyle = "#222244";
    ctx.fillRect(0, TUNNEL_CEILING_Y + 4, canvas.width, 4);

    // Ceiling conduits and pipes
    for (let px = ((-groundOffset * 0.5) % 80) - 80; px < canvas.width; px += 80) {
      // Vertical pipe
      ctx.fillStyle = "#1a2a22";
      ctx.fillRect(px + 35, TUNNEL_CEILING_Y + 4, 6, 20);
      // Drip animation
      const drip = (t_now / 400 + px) % 40;
      if (drip < 20) {
        ctx.fillStyle = "#00ff66";
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px + 37, TUNNEL_CEILING_Y + 24 + drip, 2, 3);
        ctx.globalAlpha = 1;
      }
      // Horizontal conduit
      ctx.fillStyle = "#151525";
      ctx.fillRect(px, TUNNEL_CEILING_Y + 6, 70, 4);
    }

    // Neon strip lights on walls (scrolling with parallax)
    const stripGlow = 0.3 + Math.sin(t_now / 500) * 0.15;
    ctx.fillStyle = "#00ff66";
    ctx.globalAlpha = stripGlow;
    ctx.fillRect(0, TUNNEL_CEILING_Y + 40, canvas.width, 1);
    ctx.fillRect(0, UNDERGROUND_Y - 25, canvas.width, 1);
    ctx.globalAlpha = 1;

    // Occasional warning signs on walls
    for (let sx = ((-groundOffset * 0.6) % 200) - 200; sx < canvas.width; sx += 200) {
      // Hazard stripe
      ctx.fillStyle = "#221100";
      ctx.fillRect(sx + 60, TUNNEL_CEILING_Y + 50, 40, 20);
      ctx.fillStyle = "#ff6600";
      ctx.globalAlpha = 0.4 + Math.sin(t_now / 300 + sx) * 0.2;
      ctx.font = "bold 7px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("CAUTION", sx + 80, TUNNEL_CEILING_Y + 64);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    // Floor — underground ground with toxic glow
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, UNDERGROUND_Y, canvas.width, canvas.height - UNDERGROUND_Y);
    // Glowing floor line
    ctx.strokeStyle = "#00ff66";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6 + Math.sin(t_now / 400) * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, UNDERGROUND_Y);
    ctx.lineTo(canvas.width, UNDERGROUND_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Floor glow gradient
    const floorGlow = ctx.createLinearGradient(0, UNDERGROUND_Y, 0, UNDERGROUND_Y + 10);
    floorGlow.addColorStop(0, "rgba(0, 255, 102, 0.12)");
    floorGlow.addColorStop(1, "rgba(0, 255, 102, 0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(0, UNDERGROUND_Y, canvas.width, 10);

    // Rail tracks on floor
    ctx.strokeStyle = "#222233";
    ctx.lineWidth = 1;
    for (let rail = 0; rail < 2; rail++) {
      const ry = UNDERGROUND_Y + 3 + rail * 4;
      ctx.beginPath();
      ctx.moveTo(0, ry);
      ctx.lineTo(canvas.width, ry);
      ctx.stroke();
    }
    // Rail ties (cross-beams)
    ctx.fillStyle = "#181828";
    for (let tx = ((-groundOffset * 0.8) % 25) - 25; tx < canvas.width; tx += 25) {
      ctx.fillRect(tx, UNDERGROUND_Y + 2, 8, 6);
    }

    // Exit light — bright opening visible ahead when approaching exit
    const exitScreenX = exitEnd;
    if (exitScreenX > 0 && exitScreenX < canvas.width + 100) {
      // Bright light cone from exit
      const lightGrad = ctx.createLinearGradient(exitScreenX - 120, 0, exitScreenX, 0);
      lightGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
      lightGrad.addColorStop(1, "rgba(100, 140, 200, 0.15)");
      ctx.fillStyle = lightGrad;
      ctx.fillRect(exitScreenX - 120, TUNNEL_CEILING_Y, 120, UNDERGROUND_Y - TUNNEL_CEILING_Y);
      // Exit marker
      ctx.fillStyle = "#88aacc";
      ctx.globalAlpha = 0.6 + Math.sin(t_now / 200) * 0.3;
      ctx.font = "bold 9px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("EXIT", exitScreenX - 20, GROUND_Y + 20);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    // Entrance visible behind player
    const entScreenX = ent;
    if (entScreenX > -100 && entScreenX < canvas.width) {
      const entGrad = ctx.createLinearGradient(entScreenX, 0, entScreenX + 100, 0);
      entGrad.addColorStop(0, "rgba(100, 140, 200, 0.1)");
      entGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = entGrad;
      ctx.fillRect(entScreenX, TUNNEL_CEILING_Y, 100, UNDERGROUND_Y - TUNNEL_CEILING_Y);
    }

    // Ambient particles — dust motes
    ctx.fillStyle = "#00ff66";
    for (let i = 0; i < 8; i++) {
      const dx = ((t_now * 0.02 + i * 107) % canvas.width);
      const dy = TUNNEL_CEILING_Y + 30 + ((t_now * 0.01 + i * 73) % (UNDERGROUND_Y - TUNNEL_CEILING_Y - 40));
      ctx.globalAlpha = 0.15 + Math.sin(t_now / 300 + i) * 0.1;
      ctx.fillRect(dx, dy, 2, 2);
    }
    ctx.globalAlpha = 1;

  } else {
    // === SURFACE VIEW — show tunnel entrance/exit from above ===

    // Underground pit background (dark)
    ctx.fillStyle = "#060612";
    ctx.beginPath();
    ctx.moveTo(ent, GROUND_Y);
    ctx.lineTo(entEnd, UNDERGROUND_Y);
    ctx.lineTo(bodyEnd, UNDERGROUND_Y);
    ctx.lineTo(exitEnd, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Underground ground line (toxic green glow)
    ctx.strokeStyle = "#00ff66";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(t_now / 400) * 0.2;
    ctx.beginPath();
    ctx.moveTo(entEnd, UNDERGROUND_Y);
    ctx.lineTo(bodyEnd, UNDERGROUND_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Glow under the underground ground line
    const ugGlow = ctx.createLinearGradient(0, UNDERGROUND_Y, 0, UNDERGROUND_Y + 6);
    ugGlow.addColorStop(0, "rgba(0, 255, 102, 0.15)");
    ugGlow.addColorStop(1, "rgba(0, 255, 102, 0)");
    ctx.fillStyle = ugGlow;
    ctx.fillRect(entEnd, UNDERGROUND_Y, bodyEnd - entEnd, 6);

    // Ceiling at GROUND_Y with dripping pipes
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(entEnd, GROUND_Y);
    ctx.lineTo(bodyEnd, GROUND_Y);
    ctx.stroke();

    // Pipe details on ceiling
    for (let px = entEnd + 30; px < bodyEnd - 30; px += 60) {
      ctx.fillStyle = "#224433";
      ctx.fillRect(px, GROUND_Y, 4, 15);
      const drip = (t_now / 500 + px) % 30;
      if (drip < 15) {
        ctx.fillStyle = "#00ff66";
        ctx.globalAlpha = 0.4;
        ctx.fillRect(px + 1, GROUND_Y + 15 + drip, 2, 3);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#1a2a1a";
      ctx.fillRect(px - 20, GROUND_Y + 2, 44, 3);
    }

    // Entrance ramp edges
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(ent, GROUND_Y);
    ctx.lineTo(entEnd, UNDERGROUND_Y);
    ctx.stroke();
    // Exit ramp edges
    ctx.beginPath();
    ctx.moveTo(bodyEnd, UNDERGROUND_Y);
    ctx.lineTo(exitEnd, GROUND_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // "DANGER" warning text at entrance
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.fillStyle = "#ff6600";
    ctx.globalAlpha = 0.5 + Math.sin(t_now / 300) * 0.3;
    ctx.textAlign = "center";
    ctx.fillText("DANGER", ent + tunnel.entranceWidth / 2, GROUND_Y - 4);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawProjectiles() {
  ctx.save();
  for (const b of projectiles) {
    const t = Date.now();
    // Neon bullet core
    ctx.fillStyle = "#00ffcc";
    ctx.globalAlpha = 0.9 * b.life;
    ctx.fillRect(b.x, b.y, BULLET_WIDTH, BULLET_HEIGHT);
    // Bright center line
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.7 * b.life;
    ctx.fillRect(b.x + 2, b.y + 1, BULLET_WIDTH - 4, 1);
    // Glow trail
    ctx.fillStyle = "#00ffcc";
    ctx.globalAlpha = 0.15 * b.life;
    ctx.fillRect(b.x - 8, b.y - 2, BULLET_WIDTH + 8, BULLET_HEIGHT + 4);
    // Trailing particles (small)
    ctx.fillStyle = "#00ffcc";
    ctx.globalAlpha = 0.3 * b.life;
    ctx.fillRect(b.x - 4 - Math.random() * 6, b.y + Math.random() * BULLET_HEIGHT, 3, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawKillPopup() {
  if (killFlashTimer > 0 && lastKillText) {
    ctx.save();
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4444";
    ctx.globalAlpha = killFlashTimer / 8;
    const popY = player.y - 20 - (8 - killFlashTimer) * 2;
    ctx.fillText(lastKillText, player.x + player.width / 2, popY);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    // Glow for bright particles
    if (p.life > 0.5 && p.size > 2) {
      ctx.globalAlpha = p.life * 0.2;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
  }
  ctx.globalAlpha = 1;
}

function drawInitialsEntry() {
  ctx.save();

  // Dark overlay
  ctx.fillStyle = "rgba(8, 8, 24, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;

  // Title
  ctx.textAlign = "center";
  ctx.font = "bold 22px 'Courier New', monospace";
  ctx.fillStyle = "#ff00ff";
  ctx.shadowColor = "#ff00ff";
  ctx.shadowBlur = 15;
  ctx.fillText("NEW HIGH SCORE!", cx, 80);
  ctx.shadowBlur = 0;

  // Score
  ctx.font = "18px 'Courier New', monospace";
  ctx.fillStyle = "#00ffcc";
  ctx.fillText(String(Math.floor(score)).padStart(6, "0"), cx, 110);

  // Subtitle
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#8888aa";
  ctx.fillText("ENTER YOUR INITIALS", cx, 140);

  // Letter boxes
  const boxW = 40;
  const boxH = 50;
  const gap = 12;
  const startX = cx - (boxW * 3 + gap * 2) / 2;
  const boxY = 155;

  for (let i = 0; i < 3; i++) {
    const bx = startX + i * (boxW + gap);
    const isActive = i === initialsEntry.pos;

    // Box background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(bx, boxY, boxW, boxH);

    // Box border
    ctx.strokeStyle = isActive ? "#00ffcc" : "#333355";
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(bx, boxY, boxW, boxH);

    // Letter
    ctx.font = "bold 28px 'Courier New', monospace";
    ctx.fillStyle = isActive ? "#00ffcc" : "#8888aa";
    if (isActive) {
      ctx.shadowColor = "#00ffcc";
      ctx.shadowBlur = 8;
    }
    ctx.fillText(String.fromCharCode(initialsEntry.chars[i]), bx + boxW / 2, boxY + 35);
    ctx.shadowBlur = 0;

    // Up/down arrows for all positions (tappable on mobile)
    const arrowAlpha = isActive ? (0.6 + Math.sin(Date.now() / 300) * 0.4) : 0.3;
    ctx.fillStyle = isActive ? "#00ffcc" : "#555566";
    ctx.globalAlpha = arrowAlpha;
    // Up arrow
    ctx.beginPath();
    ctx.moveTo(bx + boxW / 2, boxY - 12);
    ctx.lineTo(bx + boxW / 2 - 8, boxY - 2);
    ctx.lineTo(bx + boxW / 2 + 8, boxY - 2);
    ctx.closePath();
    ctx.fill();
    // Down arrow
    ctx.beginPath();
    ctx.moveTo(bx + boxW / 2, boxY + boxH + 14);
    ctx.lineTo(bx + boxW / 2 - 8, boxY + boxH + 4);
    ctx.lineTo(bx + boxW / 2 + 8, boxY + boxH + 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Confirm button
  const confirmY = boxY + boxH + 45;
  const confirmW = 140;
  const confirmH = 36;
  const confirmX = cx - confirmW / 2;
  const confirmPulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;

  ctx.fillStyle = "rgba(0, 255, 204, 0.08)";
  ctx.fillRect(confirmX, confirmY, confirmW, confirmH);
  ctx.strokeStyle = "#00ffcc";
  ctx.lineWidth = 1;
  ctx.globalAlpha = confirmPulse;
  ctx.strokeRect(confirmX, confirmY, confirmW, confirmH);
  ctx.globalAlpha = 1;
  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.fillStyle = "#00ffcc";
  ctx.fillText("CONFIRM", cx, confirmY + 23);

  // Instructions
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#555566";
  if (isTouchDevice) {
    ctx.fillText("Tap arrows to change  |  Tap letter to select  |  Tap CONFIRM", cx, confirmY + confirmH + 18);
  } else {
    ctx.fillText("UP/DOWN: Letter  |  LEFT/RIGHT: Move  |  ENTER: Confirm", cx, confirmY + confirmH + 18);
  }

  ctx.restore();
}

function drawScanlines() {
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  if (state !== "playing") return;

  // Speed indicator — wider bar with rounded ends feel
  const speedPct = (gameSpeed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED);
  ctx.fillStyle = "#181828";
  ctx.fillRect(12, 12, 70, 7);
  ctx.strokeStyle = "#333344";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(12, 12, 70, 7);
  const barGrad = ctx.createLinearGradient(12, 0, 82, 0);
  barGrad.addColorStop(0, "#00ffcc");
  barGrad.addColorStop(1, "#ff00ff");
  ctx.fillStyle = barGrad;
  ctx.fillRect(12, 12, 70 * speedPct, 7);
  // Speed glow at bar tip
  if (speedPct > 0.1) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.4;
    ctx.fillRect(12 + 70 * speedPct - 2, 12, 2, 7);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#666677";
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.fillText("SPD", 14, 29);

  // Difficulty tier label
  if (difficultyTier) {
    ctx.save();
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "right";
    const tierColors = {
      "DOUBLE JUMP": "#ff00ff",
      "HIGH SPEED": "#ffaa00",
      "DANGER ZONE": "#ff4444",
      "OVERDRIVE": "#ff0066",
      "TUNNELS": "#00ff66",
      "UNDERGROUND": "#00ff66",
      "HOVER PACK": "#ff6600",
    };
    const tierColor = tierColors[difficultyTier] || "#00ffcc";
    ctx.fillStyle = tierColor;
    ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 400) * 0.3;
    ctx.shadowColor = tierColor;
    ctx.shadowBlur = 6;
    ctx.fillText(difficultyTier, canvas.width - 40, 28);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Time-of-day / weather label
  if (state === "playing" && !playerUnderground) {
    const period = getCurrentTimePeriod();
    const timeColors = {
      "DUSK": "#cc66aa", "NIGHT": "#6666aa", "MIDNIGHT": "#8844cc",
      "ACID RAIN": "#00ff66", "LATE NIGHT": "#6666aa", "NEON FOG": "#cc44ff",
      "STORM": "#6688ff", "PRE-DAWN": "#cc6688",
    };

    // Detect time period transition
    if (currentTimePeriodName && currentTimePeriodName !== period.name) {
      timePeriodFlashTimer = 120; // ~2 seconds
    }
    currentTimePeriodName = period.name;

    const periodColor = timeColors[period.name] || "#666688";
    ctx.save();

    // Big transition announcement
    if (timePeriodFlashTimer > 0) {
      timePeriodFlashTimer--;
      const flashAlpha = Math.min(1, timePeriodFlashTimer / 40) * 0.8;
      ctx.font = "bold 16px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = periodColor;
      ctx.globalAlpha = flashAlpha;
      ctx.shadowColor = periodColor;
      ctx.shadowBlur = 12;
      ctx.fillText(period.name, canvas.width / 2, 84);
      ctx.shadowBlur = 0;
      // Thin line accent
      ctx.globalAlpha = flashAlpha * 0.3;
      ctx.fillRect(canvas.width / 2 - 80, 90, 160, 1);
      ctx.textAlign = "left";
    }

    // Persistent small label
    ctx.font = "9px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = periodColor;
    ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 600) * 0.15;
    ctx.fillText(period.name, canvas.width - 40, 38);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Double jump indicator
  if (player.canDoubleJump) {
    const maxJumps = 2;
    const jumpsLeft = maxJumps - player.jumpsUsed;
    const djY = 35;
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.fillStyle = "#666677";
    ctx.fillText("JUMP", 14, djY);
    for (let i = 0; i < maxJumps; i++) {
      const ix = 50 + i * 14;
      if (i < jumpsLeft) {
        ctx.fillStyle = "#ff00ff";
        ctx.globalAlpha = 0.8 + Math.sin(Date.now() / 300) * 0.2;
        ctx.shadowColor = "#ff00ff";
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = "#332233";
        ctx.globalAlpha = 0.4;
        ctx.shadowBlur = 0;
      }
      // Upward chevron
      ctx.beginPath();
      ctx.moveTo(ix, djY);
      ctx.lineTo(ix + 5, djY - 7);
      ctx.lineTo(ix + 10, djY);
      ctx.lineTo(ix + 7, djY);
      ctx.lineTo(ix + 5, djY - 4);
      ctx.lineTo(ix + 3, djY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  } else if (score > ADVANCED_PHASE_SCORE * 0.7) {
    // Tease: approaching unlock
    const pct = (score - ADVANCED_PHASE_SCORE * 0.7) / (ADVANCED_PHASE_SCORE * 0.3);
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = 0.15 + pct * 0.25;
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText("x2 JUMP " + Math.floor(pct * 100) + "%", 14, 42);
    ctx.globalAlpha = 1;
  }

  // Jetpack fuel meter — wider and clearer
  if (jetpackUnlocked) {
    const fuelPct = jetpackFuel / JETPACK_MAX_FUEL;
    const fuelY = player.canDoubleJump ? 44 : 35;
    ctx.fillStyle = "#181828";
    ctx.fillRect(12, fuelY, 50, 6);
    ctx.strokeStyle = "#333344";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(12, fuelY, 50, 6);
    const fuelColor = fuelPct > 0.3 ? "#ff6600" : "#ff2200";
    ctx.fillStyle = fuelColor;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(12, fuelY, 50 * fuelPct, 6);
    // Low fuel flash
    if (fuelPct < 0.2 && fuelPct > 0) {
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.3;
      ctx.fillRect(12, fuelY, 50 * fuelPct, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#666677";
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.fillText("JET", 14, fuelY + 14);
  }

  // Drone kills counter
  if (droneKills > 0) {
    const killY = jetpackUnlocked ? (player.canDoubleJump ? 66 : 57) : (player.canDoubleJump ? 50 : 42);
    ctx.fillStyle = "#ff4444";
    ctx.globalAlpha = 0.8;
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.fillText("KILLS " + droneKills, 14, killY);
    ctx.globalAlpha = 1;
  }

  // Shoot cooldown indicator (bar above player)
  if (shootCooldown > 0) {
    const cdPct = shootCooldown / SHOOT_COOLDOWN;
    // Background
    ctx.fillStyle = "#181828";
    ctx.globalAlpha = 0.4;
    ctx.fillRect(player.x, player.y - 8, player.width, 3);
    // Fill
    ctx.fillStyle = "#00ffcc";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(player.x, player.y - 8, player.width * (1 - cdPct), 3);
    ctx.globalAlpha = 1;
  }

  // Touch zone hint (fades out)
  if (isTouchDevice && touchHintTimer > 0) {
    const hintAlpha = Math.min(0.4, touchHintTimer / 120 * 0.4);

    // Horizontal divider
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1;
    ctx.globalAlpha = hintAlpha * 0.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width * 0.66, canvas.height / 2);
    ctx.stroke();

    // Vertical divider for shoot zone
    ctx.strokeStyle = "#ff4444";
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.66, 0);
    ctx.lineTo(canvas.width * 0.66, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.globalAlpha = hintAlpha;
    ctx.fillStyle = "#00ffcc";
    ctx.fillText("TAP TO JUMP", canvas.width * 0.33, canvas.height / 2 - 30);
    ctx.fillStyle = "#ff00ff";
    ctx.fillText("TAP TO SLIDE", canvas.width * 0.33, canvas.height / 2 + 45);
    ctx.fillStyle = "#ff4444";
    ctx.fillText("TAP TO", canvas.width * 0.83, canvas.height / 2 - 10);
    ctx.fillText("SHOOT", canvas.width * 0.83, canvas.height / 2 + 10);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // Pause icon (desktop only — mobile uses the HTML button)
  if (!isTouchDevice) {
    ctx.fillStyle = "#555566";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(canvas.width - 30, 12, 4, 12);
    ctx.fillRect(canvas.width - 22, 12, 4, 12);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  // Screen shake
  const shaking = screenShake > 0;
  if (shaking) {
    ctx.save();
    const shakeX = (Math.random() - 0.5) * screenShake * 1.2;
    const shakeY = (Math.random() - 0.5) * screenShake * 1.2;
    ctx.translate(shakeX, shakeY);
    screenShake--;
  }

  drawSky();
  drawStars();
  drawMoon();
  drawCityLayer(farBuildings, 0.15, 0.5);
  drawCityLayer(buildings, 0.4, 0.7);
  drawWeather(); // rain/fog/lightning between buildings and ground
  drawGround();
  drawTunnel();

  // When underground, the immersive tunnel drawTunnel() covers the full screen.
  // No additional sky darkening needed — the tunnel IS the environment.

  if (state === "playing" || state === "gameover" || state === "paused" || state === "entering_initials") {
    for (const obs of obstacles) {
      drawObstacle(obs);
    }
  }
  if (state === "playing" || state === "paused") {
    drawPlayer();
    // Draw jetpack flame glow on player when active
    if (jetpackActive) {
      ctx.save();
      ctx.fillStyle = "#ff6600";
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 50) * 0.15;
      ctx.fillRect(player.x + 4, player.y + player.height - 2, player.width - 8, 8);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  drawProjectiles();
  drawParticles();
  drawHUD();
  drawKillPopup();

  if (state === "entering_initials") {
    drawInitialsEntry();
  }

  // Unlock pause tutorial overlay
  if (unlockPause && state === "paused") {
    ctx.save();
    // Dim background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const col = unlockPause.color;
    const pulse = 0.8 + Math.sin(Date.now() / 200) * 0.2;

    // Box background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    const boxW = 320;
    const boxH = 30 + unlockPause.lines.length * 22 + 55;
    const boxX = cx - boxW / 2;
    const boxY = 55;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Title
    ctx.font = "bold 18px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = pulse;
    ctx.fillText(unlockPause.title, cx, boxY + 26);
    ctx.shadowBlur = 0;

    // Instruction lines
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = "#cccccc";
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < unlockPause.lines.length; i++) {
      ctx.fillText(unlockPause.lines[i], cx, boxY + 50 + i * 22);
    }

    // OK button
    const btnW = 100;
    const btnH = 28;
    const btnX = cx - btnW / 2;
    const btnY = boxY + boxH - 40;
    const pulse2 = 0.7 + Math.sin(Date.now() / 300) * 0.3;
    ctx.globalAlpha = pulse2;
    ctx.fillStyle = col;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.fillText("OKAY", cx, btnY + btnH / 2 + 5);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.restore();
  }

  // Countdown overlay (after OK is clicked on unlock pause)
  if (countdownTimer > 0 && !unlockPause && state === "paused") {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx2 = canvas.width / 2;
    const cy2 = canvas.height / 2;
    const num = countdownNumber;
    const scale = 1 + (1 - (countdownTimer % FRAMES_PER_SECOND) / FRAMES_PER_SECOND) * 0.3;
    ctx.font = `bold ${Math.floor(72 * scale)}px 'Courier New', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00ffcc";
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 20;
    ctx.globalAlpha = Math.min(1, (countdownTimer % FRAMES_PER_SECOND) / 10);
    ctx.fillText(num > 0 ? String(num) : "GO!", cx2, cy2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.restore();
  }

  // Flash notifications (after unlock pause is dismissed, these continue briefly)
  if (!unlockPause) {
    if (tunnelFlashTimer > 0) {
      const alpha = Math.min(1, tunnelFlashTimer / 30) * (0.7 + Math.sin(Date.now() / 100) * 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 20px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#00ff66";
      ctx.shadowColor = "#00ff66";
      ctx.shadowBlur = 15;
      ctx.fillText("UNDERGROUND UNLOCKED", canvas.width / 2, 84);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.restore();
    }
    if (unlockFlashTimer > 0) {
      const alpha = Math.min(1, unlockFlashTimer / 30) * (0.7 + Math.sin(Date.now() / 100) * 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 20px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff00ff";
      ctx.shadowColor = "#ff00ff";
      ctx.shadowBlur = 15;
      ctx.fillText("DOUBLE JUMP UNLOCKED", canvas.width / 2, 84);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.restore();
    }
    if (jetpackFlashTimer > 0) {
      const alpha = Math.min(1, jetpackFlashTimer / 30) * (0.7 + Math.sin(Date.now() / 100) * 0.3);
      ctx.save();
      ctx.font = "bold 20px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff6600";
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 15;
      ctx.fillText("HOVER PACK UNLOCKED", canvas.width / 2, 84);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // Death flash overlay
  if (deathFlash > 0) {
    ctx.fillStyle = "#ff0033";
    ctx.globalAlpha = deathFlash / 15 * 0.35;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    deathFlash--;
  }

  drawScanlines();

  // Close screen shake transform
  if (shaking) {
    ctx.restore();
  }
}

function update() {
  // Handle countdown timer (runs while still paused)
  if (state === "paused" && countdownTimer > 0) {
    countdownTimer--;
    countdownNumber = Math.ceil(countdownTimer / FRAMES_PER_SECOND);
    if (countdownTimer <= 0) {
      countdownNumber = 0;
      resumeGame();
    }
    return;
  }
  if (state === "paused") return;
  if (state !== "playing") {
    updateParticles();
    return;
  }

  // Decrement touch hint timer
  if (touchHintTimer > 0) touchHintTimer--;

  // Progressive speed: gentle while unlocking mechanics, then ramps up
  let speedIncrement = 0.001;
  if (score >= COMBO_OBSTACLE_SCORE) {
    speedIncrement = 0.003;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "OVERDRIVE";
  } else if (score >= FAST_DRONE_SCORE) {
    speedIncrement = 0.0025;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "DANGER ZONE";
  } else if (score >= SPEED_TIER_SCORE) {
    speedIncrement = 0.002;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "HIGH SPEED";
  } else if (score >= JETPACK_SCORE) {
    speedIncrement = 0.0015;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "HOVER PACK";
  } else if (score >= ADVANCED_PHASE_SCORE) {
    speedIncrement = 0.001;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "DOUBLE JUMP";
  } else if (score >= TUNNEL_SCORE) {
    speedIncrement = 0.001;
    difficultyTier = playerUnderground ? "UNDERGROUND" : "TUNNELS";
  } else {
    difficultyTier = "";
  }
  gameSpeed = Math.min(MAX_SPEED, INITIAL_SPEED + score * speedIncrement);
  if (gameSpeed > maxSpeedReached) maxSpeedReached = gameSpeed;
  score += gameSpeed * 0.05;

  // Check for tunnel unlock — pause with instructions
  if (!tunnelUnlocked && score >= TUNNEL_SCORE) {
    tunnelUnlocked = true;
    tunnelFlashTimer = 180;
    unlockPause = {
      title: "UNDERGROUND UNLOCKED",
      lines: ["Tunnels will appear in the road ahead.", "You'll descend into them automatically.", "Watch for pipes, lasers, and hazards below!"],
      color: "#00ff66",
    };
    state = "paused";
    resumeGraceFrames = 15;
  }
  if (tunnelFlashTimer > 0) tunnelFlashTimer--;

  // Check for double jump unlock — pause with instructions
  if (!doubleJumpUnlocked && score >= ADVANCED_PHASE_SCORE) {
    doubleJumpUnlocked = true;
    unlockFlashTimer = 180;
    unlockPause = {
      title: "DOUBLE JUMP UNLOCKED",
      lines: isTouchDevice
        ? ["Tap jump twice to double jump!", "Use it to clear firewalls and combo obstacles."]
        : ["Press Space/Up twice to double jump!", "Use it to clear firewalls and combo obstacles."],
      color: "#ff00ff",
    };
    state = "paused";
    resumeGraceFrames = 15;
  }
  if (unlockFlashTimer > 0) unlockFlashTimer--;

  // Check for jetpack unlock — pause with instructions
  if (!jetpackUnlocked && score >= JETPACK_SCORE) {
    jetpackUnlocked = true;
    jetpackFlashTimer = 180;
    unlockPause = {
      title: "HOVER PACK UNLOCKED",
      lines: isTouchDevice
        ? ["Hold the jump zone to hover!", "Fuel drains while hovering, recharges on ground.", "Use it to fly over obstacles."]
        : ["Hold Space/Up to hover!", "Fuel drains while hovering, recharges on ground.", "Use it to fly over obstacles."],
      color: "#ff6600",
    };
    state = "paused";
    resumeGraceFrames = 15;
  }
  if (jetpackFlashTimer > 0) jetpackFlashTimer--;

  updatePlayer();
  updateTunnel();
  updateObstacles();
  updateProjectiles();
  checkCollisions();
  updateParticles();
  updateWeather();

  document.getElementById("score-display").textContent =
    "SCORE " + String(Math.floor(score)).padStart(6, "0");
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// Responsive scaling
function resizeCanvas() {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const ratio = canvas.width / canvas.height;
  let displayW = maxW;
  let displayH = maxW / ratio;
  if (displayH > maxH) {
    displayH = maxH;
    displayW = maxH * ratio;
  }
  canvas.style.width = displayW + "px";
  canvas.style.height = displayH + "px";
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

renderLeaderboardHTML("start-leaderboard");
gameLoop();
