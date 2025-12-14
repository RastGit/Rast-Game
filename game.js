// Proste pionowe parkour demo - zmodyfikowana wersja (kamera podąża za postacią, platformy niżej, silniejszy ślizg)
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  let W = canvas.clientWidth;
  let H = canvas.clientHeight;
  window.addEventListener('resize', () => { W = canvas.clientWidth; H = canvas.clientHeight; });

  const camera = { y: 0 };

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
  // Zwiększony ślizg o ~2.5% (0.985 * 0.975 = ~0.9604)
  const friction = 0.960375;
  const slideBoost = 1.6;

  // Platformy / przeszkody
  let platforms = [];
  let obstacles = []; // kolce
  const platformColor = '#5a9ad6';
  const platformMinW = 60;  // krótsze platformy
  const platformMaxW = 140;
  let gapMin = 40;   // mniejsze odstępy
  let gapMax = 120;

  function spawnInitialPlatforms() {
    platforms.length = 0;
    obstacles.length = 0;
    // start niżej (platforma startowa poniżej dolnej krawędzi widoku)
    let y = H + 60;
    // duża platforma startowa
    platforms.push({ x: W / 2 - 100, y: y, w: 200, h: 16 });
    for (let i = 0; i < 20; i++) {
      y -= (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(y);
    }
  }

  function createPlatformAt(y) {
    const w = Math.random() * (platformMaxW - platformMinW) + platformMinW;
    const x = Math.random() * (W - w - 20) + 10;
    platforms.push({ x, y, w, h: 14 });
    // czasem dodaj kolce na platformie (25% szansy)
    if (Math.random() < 0.25) {
      const sw = Math.min(26, Math.max(12, Math.random() * 28));
      const sx = x + Math.random() * Math.max(0, w - sw);
      obstacles.push({ x: sx, y: y - 12, w: sw, h: 12, type: 'spike' });
    }
  }

  spawnInitialPlatforms();

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
    deadTimer = 60;
    deadBlink = 0;
    camera.y = 0;
    player.x = W / 2;
    player.y = H - 150;
    player.vx = 0; player.vy = 0;
    player.rotation = 0; player.angularVelocity = 0;
    score = 0;
    spawnInitialPlatforms();
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
    if ((keys[' '] || keys['space']) && player.grounded) {
      player.vy = -10.5;
      player.grounded = false;
      player.angularVelocity = -0.45 * (player.vx >= 0 ? 1 : -1);
    }

    // ruch
    player.x += player.vx;
    player.y += player.vy;

    // krawędzie poziome
    if (player.x < player.r) { player.x = player.r; player.vx *= -0.2; }
    if (player.x > W - player.r) { player.x = W - player.r; player.vx *= -0.2; }

    // kamera: teraz podąża za postacią (smooth follow)
    // followOffset określa pozycję postaci na ekranie (tu ~45% od góry)
    const followOffset = H * 0.45;
    const targetCameraY = player.y - followOffset;
    // płynne podążanie (lerp)
    camera.y += (targetCameraY - camera.y) * 0.08;

    // zapobiegaj wychodzeniu nad górną krawędź ekranu
    const playerScreenY = player.y - camera.y;
    if (playerScreenY < player.r) {
      player.y = camera.y + player.r;
      player.vy = 0;
    }

    // rotacje
    player.rotation += player.angularVelocity;
    player.angularVelocity *= 0.95;

    // kolizje z platformami
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

    // kolizje z kolcami (obstacles)
    for (let o of obstacles) {
      if (player.x + player.r > o.x && player.x - player.r < o.x + o.w) {
        if (player.y + player.r > o.y) {
          respawn();
          return;
        }
      }
    }

    // usuwaj platformy/obiekty które są już bardzo poniżej ekranu
    while (platforms.length && platforms[0].y - camera.y > H + 300) {
      platforms.shift();
    }
    obstacles = obstacles.filter(o => !(o.y - camera.y > H + 300));

    // generuj nowe platformy u góry (gdy najwyższa zbliża się do widoku)
    while (platforms.length === 0 || platforms[platforms.length - 1].y - camera.y > -320) {
      const lastY = platforms.length ? platforms[platforms.length - 1].y : H - 40;
      const newY = lastY - (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(newY);
    }

    // tarcie poziome (ślizg)
    player.vx *= friction;

    // śmierć przy upadku pod ekran
    if (player.y - camera.y > H + 120) {
      respawn();
      return;
    }

    // wynik
    score = Math.max(score, Math.floor(player.y)); // można użyć camera.y, używam player.y żeby wynik odczytywał jak wysoko doszedłeś
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
      const sy = p.y - camera.y;
      if (sy < -300 || sy > H + 300) continue;
      ctx.beginPath();
      roundRect(ctx, p.x, sy, p.w, p.h, 6);
      ctx.fill();
      ctx.stroke();
    }

    // rysuj kolce
    for (let o of obstacles) {
      const sy = o.y - camera.y;
      if (sy < -200 || sy > H + 200) continue;
      if (o.type === 'spike') {
        const spikesCount = Math.max(1, Math.floor(o.w / 8));
        const sw = o.w / spikesCount;
        ctx.fillStyle = '#222';
        for (let i = 0; i < spikesCount; i++) {
          const sx = o.x + i * sw;
          ctx.beginPath();
          ctx.moveTo(sx, sy + o.h);
          ctx.lineTo(sx + sw / 2, sy);
          ctx.lineTo(sx + sw, sy + o.h);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // cień gracza
    const sx = player.x;
    const sy = player.y - camera.y;
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

    if (camera.y < 200) {
      ctx.fillStyle = 'rgba(5,50,90,0.06)';
      ctx.fillRect(8, 32, W - 16, 48);
      ctx.fillStyle = '#064e77';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Celem jest iść w górę. Uważaj na kolce!', W/2, 60);
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
