// game.js - zintegrowane z points.js i poprawioną śmiercią (giniesz tylko jeśli bardzo poniżej najniższej platformy)
// Kamera: camera.js (globalne window.camera), index.html ładuje points.js przed tym plikiem

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (window.camera && typeof window.camera.init === 'function') window.camera.init(H, 0.45);
  }
  window.addEventListener('resize', resize);
  resize();

  // camera
  const cam = window.camera || { y: 0, update: () => {}, focus: () => {} };
  cam.init(H, 0.45);

  // player
  const player = {
    x: W / 2,
    y: H - 150,
    r: 18,
    vx: 0,
    vy: 0,
    maxVx: 5.5,
    grounded: false,
    rotation: 0,
    angularVelocity: 0
  };

  const gravity = 0.5;
  const friction = 0.960375;
  const slideBoost = 1.6;

  // platforms
  let platforms = [];
  const platformColor = '#5a9ad6';
  const platformMinW = 60;
  const platformMaxW = 140;
  let gapMin = 40;
  let gapMax = 120;

  function spawnInitialPlatforms() {
    platforms.length = 0;
    let y = H - 40;
    const startW = 220;
    const startX = Math.max(10, (W - startW) / 2);
    platforms.push({ x: startX, y: y, w: startW, h: 16 });
    // spawn player center of start
    player.x = startX + startW / 2;
    player.y = y - player.r;
    player.vx = 0;
    player.vy = 0;
    for (let i = 0; i < 20; i++) {
      y -= (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(y);
    }
  }

  // pickup spawn probabilities:
  // minus10: 9%, x2: 6%, x3: 3% (total 18%)
  function createPlatformAt(y) {
    const w = Math.random() * (platformMaxW - platformMinW) + platformMinW;
    const x = Math.random() * (W - w - 20) + 10;
    const p = { x, y, w, h: 14, collected: false };
    // spawn pickup with chance
    const r = Math.random();
    if (r < 0.09) {
      p.pickup = { type: 'minus10' };
    } else if (r < 0.09 + 0.06) {
      p.pickup = { type: 'x2' };
    } else if (r < 0.09 + 0.06 + 0.03) {
      p.pickup = { type: 'x3' };
    }
    platforms.push(p);
  }

  spawnInitialPlatforms();
  cam.focus(player.y);

  // init Points
  if (window.Points && typeof window.Points.init === 'function') {
    window.Points.init({ getNow: () => performance.now() / 1000 });
  }

  // AntyBug (embedded simplified as before) - keeps soft edges and stops sticky walls
  const AntyBug = {
    MAX_VY: 50,
    MAX_VX_MULT: 3.0,
    STUCK_FRAMES_THRESHOLD: Math.round(1.2 * 60),
    WALL_NUDGE_IMPULSE: 2.2,
    GAP_NUDGE_IMPULSE: 1.6,
    MIN_MOVEMENT_TO_BE_FREE: 0.8,
    MIN_GAP_CLEAR: 2.5,
    NUDGE_COOLDOWN_FRAMES: 20,
    wallStuckCounter: 0,
    gapStuckCounter: 0,
    prevX: player.x,
    prevY: player.y,
    lastNudgeFrame: -9999,
    frameCounter: 0,
    init() {
      this.wallStuckCounter = 0; this.gapStuckCounter = 0;
      this.prevX = player.x; this.prevY = player.y;
      this.lastNudgeFrame = -9999; this.frameCounter = 0;
    },
    update(delta) {
      this.frameCounter += delta;
      const safeMaxVx = Math.max(8, (player.maxVx || 6) * this.MAX_VX_MULT);
      if (!Number.isFinite(player.vx) || Math.abs(player.vx) > safeMaxVx) {
        player.vx = Math.sign(player.vx || 1) * Math.min(Math.abs(player.vx || 0), safeMaxVx);
      }
      if (!Number.isFinite(player.vy) || Math.abs(player.vy) > this.MAX_VY) {
        player.vy = Math.sign(player.vy || 1) * Math.min(Math.abs(player.vy || 0), this.MAX_VY);
      }
      if (Math.abs(player.vx) > safeMaxVx * 0.6) { player.vx = 0; player.angularVelocity = 0; }

      const movedX = Math.abs(player.x - this.prevX);
      const isMovingHorizontally = movedX > this.MIN_MOVEMENT_TO_BE_FREE;
      const touchingLeftEdge = (player.x - player.r) <= 0 + 0.001;
      const touchingRightEdge = (player.x + player.r) >= W - 0.001;
      const touchingEdge = touchingLeftEdge || touchingRightEdge;

      if (touchingEdge && !isMovingHorizontally) {
        this.wallStuckCounter += delta;
      } else {
        this.wallStuckCounter = 0;
      }

      if (this.wallStuckCounter >= this.STUCK_FRAMES_THRESHOLD) {
        if (this.frameCounter - this.lastNudgeFrame > this.NUDGE_COOLDOWN_FRAMES) {
          if (touchingLeftEdge) {
            player.x = Math.max(player.r + this.MIN_GAP_CLEAR, player.x + 0.5);
            player.vx = Math.max(player.vx, this.WALL_NUDGE_IMPULSE);
          } else if (touchingRightEdge) {
            player.x = Math.min(W - player.r - this.MIN_GAP_CLEAR, player.x - 0.5);
            player.vx = Math.min(player.vx, -this.WALL_NUDGE_IMPULSE);
          }
          player.angularVelocity = 0;
          this.lastNudgeFrame = this.frameCounter;
          this.wallStuckCounter = 0;
        }
      }

      let inNarrowGap = false;
      for (let i = 0; i < platforms.length; i++) {
        const pl = platforms[i];
        const playerBottom = player.y + player.r;
        const playerTop = player.y - player.r;
        if (playerBottom < pl.y - 6 || playerTop > pl.y + pl.h + 6) continue;
        const gapLeft = pl.x;
        const gapRight = W - (pl.x + pl.w);
        if (gapLeft >= 0 && gapLeft < player.r + 6 && player.x - player.r < pl.x + 6 && player.x < pl.x + 8) {
          inNarrowGap = true; this.gapStuckCounter += delta; break;
        }
        if (gapRight >= 0 && gapRight < player.r + 6 && player.x + player.r > pl.x + pl.w - 6 && player.x > pl.x + pl.w - 8) {
          inNarrowGap = true; this.gapStuckCounter += delta; break;
        }
      }
      if (!inNarrowGap) this.gapStuckCounter = 0;

      if (this.gapStuckCounter >= Math.round(this.STUCK_FRAMES_THRESHOLD * 0.5)) {
        if (this.frameCounter - this.lastNudgeFrame > this.NUDGE_COOLDOWN_FRAMES) {
          if (player.x < W * 0.5) {
            player.vx = Math.max(player.vx, this.GAP_NUDGE_IMPULSE);
            player.x = Math.min(W - player.r - this.MIN_GAP_CLEAR, Math.max(player.x, player.r + this.MIN_GAP_CLEAR + 0.5));
          } else {
            player.vx = Math.min(player.vx, -this.GAP_NUDGE_IMPULSE);
            player.x = Math.max(player.x, player.r + this.MIN_GAP_CLEAR + 0.5);
          }
          player.angularVelocity = 0;
          this.lastNudgeFrame = this.frameCounter;
          this.gapStuckCounter = 0;
        }
      }

      if ((player.x < -80 || player.x > W + 80)) {
        respawn();
      }

      this.prevX = player.x; this.prevY = player.y;
    }
  };

  AntyBug.init();

  // controls
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  document.getElementById('left').addEventListener('pointerdown', () => keys['arrowleft']=keys['a']=true);
  document.getElementById('left').addEventListener('pointerup',   () => keys['arrowleft']=keys['a']=false);
  document.getElementById('right').addEventListener('pointerdown', () => keys['arrowright']=keys['d']=true);
  document.getElementById('right').addEventListener('pointerup',   () => keys['arrowright']=keys['d']=false);
  document.getElementById('jump').addEventListener('pointerdown', () => { keys[' ']=true; setTimeout(()=>keys[' ']=false, 140); });

  let score = 0;
  let deadTimer = 0;
  let deadBlink = 0;

  function respawn() {
    deadTimer = 40; deadBlink = 0;
    spawnInitialPlatforms();
    cam.focus(player.y);
    player.vx = 0; player.vy = 0;
    player.rotation = 0; player.angularVelocity = 0;
    score = 0;
    if (window.Points) { window.Points.activeMultiplier = { value: 1, expiresAt: 0 }; window.Points.points = 0; }
    AntyBug.init();
  }

  let last = performance.now();
  function loop(t) {
    const dt = Math.min(40, t - last);
    last = t;
    update(dt / 16.67);
    draw();
    requestAnimationFrame(loop);
  }

  function update(delta) {
    if (deadTimer > 0) { deadTimer--; return; }

    const left = keys['arrowleft'] || keys['a'];
    const right = keys['arrowright'] || keys['d'];
    if (left) player.vx -= 0.38;
    if (right) player.vx += 0.38;
    player.vx = Math.max(-player.maxVx, Math.min(player.maxVx, player.vx));

    player.vy += gravity;
    if ((keys[' '] || keys['space']) && player.grounded) {
      player.vy = -10.5 * 1.10; // = -11.55
      player.grounded = false;
      player.angularVelocity = -0.45 * (player.vx >= 0 ? 1 : -1);
    }

    player.x += player.vx;
    player.y += player.vy;

    // MIĘKKIE OGRANICZENIE BOCZNE: blokuj wyjście i daj lekki impuls przeciwny
    const minX = player.r; const maxX = W - player.r;
    if (player.x < minX) {
      player.x = minX;
      if (player.vx < 0) player.vx = 1.2;
    } else if (player.x > maxX) {
      player.x = maxX;
      if (player.vx > 0) player.vx = -1.2;
    }

    cam.update(player.y);

    // AntyBug update
    AntyBug.update(delta);

    player.rotation += player.angularVelocity;
    player.angularVelocity *= 0.95;

    // collision with platforms - and awarding points/pickups (only once per platform)
    player.grounded = false;
    for (let p of platforms) {
      const withinX = player.x + player.r > p.x && player.x - player.r < p.x + p.w;
      const playerBottom = player.y + player.r;
      const platformTop = p.y;
      if (withinX && playerBottom > platformTop && playerBottom - player.vy <= platformTop + 1) {
        // landed
        player.y = platformTop - player.r;
        if (player.vy > 2) {
          const slideDir = Math.sign(player.vx) || (Math.random() < 0.5 ? -1 : 1);
          player.vx += slideDir * slideBoost * 0.3;
          player.angularVelocity += 0.8 * slideDir;
        }
        player.vy = 0;
        player.grounded = true;

        // award points via Points manager
        if (window.Points) window.Points.onLand(p);
      }
    }

    // remove platforms which are far below camera (bigger margin to avoid removing all)
    while (platforms.length && platforms[0].y - cam.y > H + 600) {
      platforms.shift();
    }

    // generate new platforms above
    while (platforms.length === 0 || platforms[platforms.length - 1].y - cam.y > -320) {
      const lastY = platforms.length ? platforms[platforms.length - 1].y : H - 40;
      const newY = lastY - (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(newY);
    }

    // friction
    player.vx *= friction;

    // Points update
    if (window.Points && typeof window.Points.update === 'function') window.Points.update(delta);

    // death condition: only die if well below the lowest platform
    const lowestPlatformY = platforms.length ? Math.max(...platforms.map(pl => pl.y)) : (player.y + 800);
    if (player.y > lowestPlatformY + 350) {
      respawn();
      return;
    }

    score = Math.max(score, Math.floor(player.y));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // draw platforms and pickups
    ctx.fillStyle = platformColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let p of platforms) {
      const sy = p.y - cam.y;
      if (sy < -300 || sy > H + 300) continue;
      ctx.beginPath();
      roundRect(ctx, p.x, sy, p.w, p.h, 6);
      ctx.fill();
      ctx.stroke();

      // pickup icon
      if (p.pickup && !p.pickupCollected) {
        const px = p.x + p.w / 2;
        const py = sy - 10;
        if (p.pickup.type === 'minus10') {
          ctx.fillStyle = '#bb2222';
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('-10', px, py + 1);
        } else if (p.pickup.type === 'x2' || p.pickup.type === 'x3') {
          ctx.fillStyle = '#ffd24d';
          ctx.beginPath();
          ctx.arc(px, py, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#333';
          ctx.font = '12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.pickup.type.toUpperCase(), px, py + 1);
        }
      }
    }

    // shadow
    const sx = player.x;
    const sy = player.y - cam.y;
    ctx.beginPath();
    ctx.ellipse(sx, sy + player.r + 8, player.r * 1.05, player.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // player
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(player.rotation);
    ctx.fillStyle = player.grounded ? '#ff5656' : '#ff9a9a';
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(6, -6, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Points HUD (Points.draw will also draw points text; to avoid duplication Points.draw draws points)
    if (window.Points && typeof window.Points.draw === 'function') {
      window.Points.draw(ctx);
    } else {
      ctx.fillStyle = '#064e77';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Points: 0', 12, 24);
    }

    if (cam.y < 200) {
      ctx.fillStyle = 'rgba(5,50,90,0.06)';
      ctx.fillRect(8, 32, W - 16, 48);
      ctx.fillStyle = '#064e77';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Celem jest iść w górę. Zbieraj power-upy!', W/2, 60);
    }

    if (deadTimer > 0) {
      ctx.fillStyle = `rgba(200,30,30,${0.12 + 0.08 * Math.sin(deadBlink)})`;
      ctx.fillRect(0,0,W,H);
      deadBlink += 0.3;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = r;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  requestAnimationFrame(loop);
})();
