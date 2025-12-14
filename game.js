// Proste pionowe parkour demo - kamera w camera.js, skok +10%, camera focus po spawnie
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
    // zainicjuj kamerę przy każdej zmianie rozmiaru
    if (window.camera && typeof window.camera.init === 'function') {
      window.camera.init(H, 0.45);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // Camera (z camera.js)
  const cam = window.camera || { y: 0, update: () => {}, focus: () => {} };
  cam.init(H, 0.45);

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
  // Ślizg ~2.5% silniejszy (bez zmian)
  const friction = 0.960375;
  const slideBoost = 1.6;

  // Platformy (bez przeszkód)
  let platforms = [];
  const platformColor = '#5a9ad6';
  const platformMinW = 60;
  const platformMaxW = 140;
  let gapMin = 40;
  let gapMax = 120;

  function spawnInitialPlatforms() {
    platforms.length = 0;
    // start platforma na dole widoku
    let y = H - 40;
    const startW = 220;
    const startX = Math.max(10, (W - startW) / 2);
    platforms.push({ x: startX, y: y, w: startW, h: 16 });
    // ustaw gracza dokładnie na środku startowej platformy
    player.x = startX + startW / 2;
    player.y = y - player.r;
    for (let i = 0; i < 20; i++) {
      y -= (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(y);
    }
  }

  function createPlatformAt(y) {
    const w = Math.random() * (platformMaxW - platformMinW) + platformMinW;
    const x = Math.random() * (W - w - 20) + 10;
    platforms.push({ x, y, w, h: 14 });
  }

  // Najpierw wygeneruj platformy, potem ustaw kamerę na graczu (focus), by nie ginąć
  spawnInitialPlatforms();
  cam.focus(player.y);

  // sterowanie
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  document.getElementById('left').addEventListener('pointerdown', () => keys['arrowleft']=keys['a']=true);
  document.getElementById('left').addEventListener('pointerup',   () => keys['arrowleft']=keys['a']=false);
  document.getElementById('right').addEventListener('pointerdown', () => keys['arrowright']=keys['d']=true);
  document.getElementById('right').addEventListener('pointerup',   () => keys['arrowright']=keys['d']=false);
  document.getElementById('jump').addEventListener('pointerdown', () => { keys[' ']=true; setTimeout(()=>keys[' ']=false, 120); });

  let score = 0;
  let deadTimer = 0;
  let deadBlink = 0;

  function respawn() {
    deadTimer = 40;
    deadBlink = 0;
    // odtwórz platformy i umieść gracza na środku startowej platformy
    spawnInitialPlatforms();
    // ustaw kamerę natychmiast na graczu, żeby nie zginąć od razu
    cam.focus(player.y);
    player.vx = 0; player.vy = 0;
    player.rotation = 0; player.angularVelocity = 0;
    score = 0;
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

    // wejście poziome
    const left = keys['arrowleft'] || keys['a'];
    const right = keys['arrowright'] || keys['d'];
    if (left) player.vx -= 0.38;
    if (right) player.vx += 0.38;
    player.vx = Math.max(-player.maxVx, Math.min(player.maxVx, player.vx));

    // grawitacja i skok
    player.vy += gravity;
    // Skok zwiększony o 10% (był -10.5, teraz -11.55)
    if ((keys[' '] || keys['space']) && player.grounded) {
      player.vy = -10.5 * 1.10; // = -11.55
      player.grounded = false;
      player.angularVelocity = -0.45 * (player.vx >= 0 ? 1 : -1);
    }

    // ruch
    player.x += player.vx;
    player.y += player.vy;

    // krawędzie poziome
    if (player.x < player.r) { player.x = player.r; player.vx *= -0.2; }
    if (player.x > W - player.r) { player.x = W - player.r; player.vx *= -0.2; }

    // kamera: aktualizujemy, żeby podążała za graczem (camera.js)
    cam.update(player.y);

    // rotacje
    player.rotation += player.angularVelocity;
    player.angularVelocity *= 0.95;

    // kolizje z platformami (proste)
    player.grounded = false;
    for (let p of platforms) {
      const withinX = player.x + player.r > p.x && player.x - player.r < p.x + p.w;
      const playerBottom = player.y + player.r;
      const platformTop = p.y;
      if (withinX && playerBottom > platformTop && playerBottom - player.vy <= platformTop + 1) {
        player.y = platformTop - player.r;
        if (player.vy > 2) {
          const slideDir = Math.sign(player.vx) || (Math.random() < 0.5 ? -1 : 1);
          player.vx += slideDir * slideBoost * 0.3;
          player.angularVelocity += 0.8 * slideDir;
        }
        player.vy = 0;
        player.grounded = true;
      }
    }

    // usuwaj platformy które są już bardzo poniżej ekranu
    while (platforms.length && platforms[0].y - cam.y > H + 300) {
      platforms.shift();
    }

    // generuj nowe platformy u góry (gdy najwyższa zbliża się do widoku)
    while (platforms.length === 0 || platforms[platforms.length - 1].y - cam.y > -320) {
      const lastY = platforms.length ? platforms[platforms.length - 1].y : H - 40;
      const newY = lastY - (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(newY);
    }

    // tarcie poziome (ślizg)
    player.vx *= friction;

    // śmierć przy upadku pod ekran
    if (player.y - cam.y > H + 120) {
      respawn();
      return;
    }

    // wynik - wysokość gracza
    score = Math.max(score, Math.floor(player.y));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // rysuj platformy
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
    }

    // cień gracza
    const sx = player.x;
    const sy = player.y - cam.y;
    ctx.beginPath();
    ctx.ellipse(sx, sy + player.r + 8, player.r * 1.05, player.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // postać
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

    // HUD
    ctx.fillStyle = '#064e77';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + Math.floor(score), 12, 24);

    if (cam.y < 200) {
      ctx.fillStyle = 'rgba(5,50,90,0.06)';
      ctx.fillRect(8, 32, W - 16, 48);
      ctx.fillStyle = '#064e77';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Celem jest iść w górę. Startujesz na środku platformy.', W/2, 60);
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
