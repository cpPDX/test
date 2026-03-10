const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GROUND_Y = 250;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const INITIAL_SPEED = 5;
const MAX_SPEED = 12;
const SPEED_INCREMENT = 0.001;

const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 50;
const DUCK_HEIGHT = 25;

// Game state
let state = "start"; // start | playing | gameover
let score = 0;
let highScore = 0;
let gameSpeed = INITIAL_SPEED;
let frameCount = 0;
let obstacles = [];
let particles = [];
let groundOffset = 0;

// Player
const player = {
  x: 80,
  y: GROUND_Y - PLAYER_HEIGHT,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  vy: 0,
  jumping: false,
  ducking: false,
};

// Input
const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  if (state === "start") {
    startGame();
    e.preventDefault();
  } else if (state === "gameover") {
    startGame();
    e.preventDefault();
  }

  if (
    ["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)
  ) {
    e.preventDefault();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Touch controls
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const y = touch.clientY - rect.top;

  if (state !== "playing") {
    startGame();
    return;
  }

  if (y < canvas.height / 2) {
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

function startGame() {
  state = "playing";
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

  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-screen").classList.add("hidden");
}

function gameOver() {
  state = "gameover";
  if (score > highScore) {
    highScore = score;
  }

  // Explosion particles
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      color: ["#ff4444", "#ff8800", "#ffcc00"][Math.floor(Math.random() * 3)],
    });
  }

  document.getElementById("final-score").textContent =
    "Score: " + Math.floor(score);
  document.getElementById("high-score").textContent =
    "Best: " + Math.floor(highScore);
  document.getElementById("game-over-screen").classList.remove("hidden");
}

// Obstacle types
function createObstacle() {
  const type = Math.random();

  if (type < 0.4) {
    // Short cactus - jump over
    return {
      x: canvas.width,
      y: GROUND_Y - 40,
      width: 20,
      height: 40,
      type: "cactus-short",
    };
  } else if (type < 0.7) {
    // Tall cactus - jump over
    return {
      x: canvas.width,
      y: GROUND_Y - 55,
      width: 22,
      height: 55,
      type: "cactus-tall",
    };
  } else {
    // Bird - duck under
    return {
      x: canvas.width,
      y: GROUND_Y - PLAYER_HEIGHT - 15,
      width: 35,
      height: 20,
      type: "bird",
    };
  }
}

function updatePlayer() {
  const wantJump = keys["Space"] || keys["ArrowUp"] || keys["KeyW"];
  const wantDuck = keys["ArrowDown"] || keys["KeyS"];

  // Jump
  if (wantJump && !player.jumping) {
    player.vy = JUMP_FORCE;
    player.jumping = true;
  }

  // Duck
  if (wantDuck && !player.jumping) {
    player.ducking = true;
    player.height = DUCK_HEIGHT;
    player.y = GROUND_Y - DUCK_HEIGHT;
  } else {
    player.ducking = false;
    if (!player.jumping) {
      player.height = PLAYER_HEIGHT;
      player.y = GROUND_Y - PLAYER_HEIGHT;
    }
  }

  // Gravity
  player.vy += GRAVITY;
  player.y += player.vy;

  // Land on ground
  if (player.y >= GROUND_Y - player.height) {
    player.y = GROUND_Y - player.height;
    player.vy = 0;
    player.jumping = false;
  }
}

function updateObstacles() {
  // Spawn
  frameCount++;
  const minGap = Math.max(60, 100 - gameSpeed * 3);
  if (
    frameCount > minGap &&
    (obstacles.length === 0 ||
      obstacles[obstacles.length - 1].x < canvas.width - 200 - Math.random() * 150)
  ) {
    obstacles.push(createObstacle());
    frameCount = 0;
  }

  // Move and cull
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= gameSpeed;
    if (obstacles[i].x + obstacles[i].width < 0) {
      obstacles.splice(i, 1);
    }
  }
}

function checkCollisions() {
  const px = player.x + 5;
  const py = player.y + 5;
  const pw = player.width - 10;
  const ph = player.height - 10;

  for (const obs of obstacles) {
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
    p.life -= 0.02;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Drawing
function drawGround() {
  groundOffset = (groundOffset + gameSpeed) % 40;

  ctx.strokeStyle = "#1a5276";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  // Ground texture dashes
  ctx.strokeStyle = "#1a4060";
  for (let x = -groundOffset; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 8);
    ctx.lineTo(x + 15, GROUND_Y + 8);
    ctx.stroke();
  }
  for (let x = -groundOffset + 20; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 16);
    ctx.lineTo(x + 10, GROUND_Y + 16);
    ctx.stroke();
  }
}

function drawStars() {
  // Simple static star field
  ctx.fillStyle = "#ffffff";
  const starSeed = [
    [50, 30], [150, 60], [250, 20], [370, 50], [480, 35],
    [560, 65], [650, 25], [720, 55], [100, 80], [310, 75],
    [430, 15], [590, 45], [680, 70], [770, 40], [200, 45],
  ];
  for (const [sx, sy] of starSeed) {
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 1000 + sx) * 0.2;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.save();

  if (player.ducking) {
    // Ducking: wide and flat
    ctx.fillStyle = "#00c8ff";
    ctx.fillRect(player.x, player.y, player.width + 8, player.height);

    // Visor
    ctx.fillStyle = "#0088cc";
    ctx.fillRect(player.x + player.width - 2, player.y + 4, 12, 8);

    // Legs
    ctx.fillStyle = "#0099dd";
    ctx.fillRect(player.x + 5, player.y + player.height - 5, 8, 5);
    ctx.fillRect(player.x + 20, player.y + player.height - 5, 8, 5);
  } else {
    // Body
    ctx.fillStyle = "#00c8ff";
    ctx.fillRect(player.x + 5, player.y, player.width - 10, player.height - 10);

    // Head
    ctx.fillStyle = "#00c8ff";
    ctx.fillRect(player.x + 8, player.y - 5, player.width - 16, 15);

    // Visor / eye
    ctx.fillStyle = "#0088cc";
    ctx.fillRect(player.x + player.width - 12, player.y - 2, 10, 8);

    // Legs (animated)
    ctx.fillStyle = "#0099dd";
    const legAnim = Math.sin(Date.now() / 80) * 4;
    ctx.fillRect(player.x + 8, player.y + player.height - 12, 8, 12);
    ctx.fillRect(
      player.x + player.width - 16,
      player.y + player.height - 12 + (player.jumping ? 0 : legAnim),
      8,
      12
    );

    // Arms
    ctx.fillStyle = "#0099dd";
    const armY = player.jumping ? -3 : Math.sin(Date.now() / 100) * 2;
    ctx.fillRect(player.x + player.width - 5, player.y + 15 + armY, 8, 5);
  }

  ctx.restore();
}

function drawObstacle(obs) {
  ctx.save();

  if (obs.type === "cactus-short" || obs.type === "cactus-tall") {
    // Cactus body
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(obs.x + 5, obs.y, obs.width - 10, obs.height);

    // Arms
    ctx.fillStyle = "#2ecc71";
    if (obs.type === "cactus-tall") {
      ctx.fillRect(obs.x - 2, obs.y + 12, 8, 5);
      ctx.fillRect(obs.x - 2, obs.y + 12, 5, 15);
      ctx.fillRect(obs.x + obs.width - 6, obs.y + 22, 8, 5);
      ctx.fillRect(obs.x + obs.width - 1, obs.y + 22, 5, 12);
    } else {
      ctx.fillRect(obs.x - 2, obs.y + 10, 7, 5);
      ctx.fillRect(obs.x - 2, obs.y + 10, 4, 12);
    }

    // Spikes
    ctx.fillStyle = "#1e8449";
    ctx.fillRect(obs.x + 3, obs.y - 3, 3, 3);
    ctx.fillRect(obs.x + obs.width - 6, obs.y - 2, 3, 2);
  } else if (obs.type === "bird") {
    // Bird body
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(obs.x + 5, obs.y + 5, obs.width - 10, obs.height - 10);

    // Wings (animated)
    const wingY = Math.sin(Date.now() / 100) * 5;
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(obs.x, obs.y + wingY, 10, 6);
    ctx.fillRect(obs.x + obs.width - 10, obs.y + wingY, 10, 6);

    // Beak
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(obs.x + obs.width - 5, obs.y + 8, 8, 4);

    // Eye
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(obs.x + obs.width - 12, obs.y + 5, 4, 4);
  }

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  // Clear
  ctx.fillStyle = "#0f3460";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars();
  drawGround();

  if (state === "playing") {
    drawPlayer();
    for (const obs of obstacles) {
      drawObstacle(obs);
    }
  } else if (state === "gameover") {
    // Still draw obstacles for context
    for (const obs of obstacles) {
      drawObstacle(obs);
    }
  }

  drawParticles();
}

function update() {
  if (state !== "playing") {
    updateParticles();
    return;
  }

  gameSpeed = Math.min(MAX_SPEED, INITIAL_SPEED + score * SPEED_INCREMENT);
  score += gameSpeed * 0.05;

  updatePlayer();
  updateObstacles();
  checkCollisions();
  updateParticles();

  document.getElementById("score-display").textContent =
    "Score: " + Math.floor(score);
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
