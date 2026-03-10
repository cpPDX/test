const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Increase canvas for a wider city view
canvas.width = 800;
canvas.height = 350;

const GROUND_Y = 290;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const INITIAL_SPEED = 5;
const MAX_SPEED = 13;
const SPEED_INCREMENT = 0.001;

const PLAYER_WIDTH = 36;
const PLAYER_HEIGHT = 50;
const DUCK_HEIGHT = 25;

// Game state
let state = "start";
let score = 0;
let highScore = 0;
let gameSpeed = INITIAL_SPEED;
let frameCount = 0;
let obstacles = [];
let particles = [];
let groundOffset = 0;

// City background layers (parallax)
const buildings = [];
const farBuildings = [];

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
};

// Input
const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (state === "start" || state === "gameover") {
    startGame();
    e.preventDefault();
  }
  if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) {
    e.preventDefault();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

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
  generateBuildings();

  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-screen").classList.add("hidden");
}

function gameOver() {
  state = "gameover";
  if (score > highScore) highScore = score;

  // Neon explosion particles
  for (let i = 0; i < 30; i++) {
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

  document.getElementById("final-score").textContent = "Score: " + Math.floor(score);
  document.getElementById("high-score").textContent = "Best: " + Math.floor(highScore);
  document.getElementById("game-over-screen").classList.remove("hidden");
}

// Obstacle types - city themed
function createObstacle() {
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
    // Drone - duck under
    return {
      x: canvas.width,
      y: GROUND_Y - PLAYER_HEIGHT - 18,
      width: 40,
      height: 20,
      type: "drone",
    };
  }
}

function updatePlayer() {
  const wantJump = keys["Space"] || keys["ArrowUp"] || keys["KeyW"];
  const wantDuck = keys["ArrowDown"] || keys["KeyS"];

  if (wantJump && !player.jumping) {
    player.vy = JUMP_FORCE;
    player.jumping = true;
    // Jump particles
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: player.x + player.width / 2 + (Math.random() - 0.5) * 20,
        y: GROUND_Y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3,
        life: 0.6,
        size: 2,
        color: "#00ffcc",
      });
    }
  }

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

  player.vy += GRAVITY;
  player.y += player.vy;

  if (player.y >= GROUND_Y - player.height) {
    player.y = GROUND_Y - player.height;
    player.vy = 0;
    player.jumping = false;
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

function updateObstacles() {
  frameCount++;
  const minGap = Math.max(55, 100 - gameSpeed * 3);
  if (
    frameCount > minGap &&
    (obstacles.length === 0 ||
      obstacles[obstacles.length - 1].x < canvas.width - 200 - Math.random() * 150)
  ) {
    obstacles.push(createObstacle());
    frameCount = 0;
  }

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
    p.life -= 0.025;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------- DRAWING ----------

function drawSky() {
  // Gradient sky
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, "#050510");
  grad.addColorStop(0.5, "#0a0a20");
  grad.addColorStop(1, "#101030");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, GROUND_Y);
}

function drawStars() {
  const starSeed = [
    [50, 20], [150, 40], [250, 15], [370, 35], [480, 25],
    [560, 50], [650, 18], [720, 42], [100, 55], [310, 48],
    [430, 10], [590, 30], [680, 52], [770, 28], [200, 32],
    [40, 60], [500, 8], [620, 55], [340, 22], [750, 12],
  ];
  for (const [sx, sy] of starSeed) {
    const flicker = 0.3 + Math.sin(Date.now() / 800 + sx * 0.5) * 0.25;
    ctx.globalAlpha = flicker;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function drawMoon() {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ff88cc";
  ctx.beginPath();
  ctx.arc(680, 50, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ff00ff";
  ctx.beginPath();
  ctx.arc(680, 50, 40, 0, Math.PI * 2);
  ctx.fill();
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

    // Windows
    if (b.windows) {
      const winW = 3;
      const winH = 4;
      const cols = Math.floor(b.w / 10);
      const rows = Math.floor(b.h / 14);
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = bx + 4 + c * 10;
          const wy = by + 6 + r * 14;
          const lit = Math.sin(wx * 13.7 + wy * 7.3) > 0;
          if (lit) {
            ctx.fillStyle = Math.random() > 0.98
              ? "#ffaa00"
              : `rgba(${180 + Math.random() * 75}, ${150 + Math.random() * 60}, ${50 + Math.random() * 200}, 0.7)`;
            ctx.fillRect(wx, wy, winW, winH);
          }
        }
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

  // Neon road line
  const t = Date.now() / 1000;
  ctx.strokeStyle = "#ff00ff";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Glow under the road line
  const roadGlow = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 8);
  roadGlow.addColorStop(0, "rgba(255, 0, 255, 0.2)");
  roadGlow.addColorStop(1, "rgba(255, 0, 255, 0)");
  ctx.fillStyle = roadGlow;
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
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#00ffcc";
  ctx.fillRect(px - 5, GROUND_Y - 2, player.width + 10, 4);
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
  }

  ctx.restore();
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

  // Speed indicator
  const speedPct = (gameSpeed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED);
  ctx.fillStyle = "#222233";
  ctx.fillRect(12, 12, 60, 6);
  const barGrad = ctx.createLinearGradient(12, 0, 72, 0);
  barGrad.addColorStop(0, "#00ffcc");
  barGrad.addColorStop(1, "#ff00ff");
  ctx.fillStyle = barGrad;
  ctx.fillRect(12, 12, 60 * speedPct, 6);

  ctx.fillStyle = "#555566";
  ctx.font = "9px 'Courier New', monospace";
  ctx.fillText("SPD", 14, 28);
}

function draw() {
  drawSky();
  drawStars();
  drawMoon();
  drawCityLayer(farBuildings, 0.15, 0.5);
  drawCityLayer(buildings, 0.4, 0.7);
  drawGround();

  if (state === "playing" || state === "gameover") {
    for (const obs of obstacles) {
      drawObstacle(obs);
    }
  }
  if (state === "playing") {
    drawPlayer();
  }

  drawParticles();
  drawHUD();
  drawScanlines();
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
    "SCORE " + String(Math.floor(score)).padStart(6, "0");
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
