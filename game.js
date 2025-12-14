// Proste pionowe parkour demo
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Rozmiary canvas w pixels (wewnętrznie)
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;

  // Gra: kamera przewija się w górę z ustaloną prędkością -> wrażenie "idziemy cały czas"
  const camera = { y: 0, speed: 1.2 }; // im większa speed, tym szybciej w górę

  // Gracz
  const player = {
    x: W / 2,
    y: H - 150, // world coords (większe y = dalej w dół)
    r: 18,
    vx: 0,
    vy: 0,
    maxVx: 5,
    grounded: false,
    rotation: 0, // radians
    angularVelocity: 0
  };

  // Fizyka
  const gravity = 0.5;
  const friction = 0.98; // pozioma "lepkość" - niska -> lekko ślizga
  const slideBoost = 1.6; // kiedy lądujemy dostajemy mały "ślizg" poziomy

  // Platformy - będą generowane "w górę"
  const platforms = [];
  const platformColor = '#5a9ad6';
  const platformMinW = 80;
  const platformMaxW = 260;
  const gapMin = 70;
  const gapMax = 170;

  // Generuj początkowe platformy
  function spawnInitialPlatforms() {
    platforms.length = 0;
    let y = H - 40;
    // platformu blisko poczatku
    platforms.push({ x: W / 2 - 100, y: y, w: 200, h: 16 });
    for (let i = 0; i < 12; i++) {
      y -= (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(y);
    }
  }
  function createPlatformAt(y) {
    const w = Math.random() * (platformMaxW - platformMinW) + platformMinW;
    const x = Math.random() * (W - w - 20) + 10;
    platforms.push({ x, y, w, h: 14 });
  }

  spawnInitialPlatforms();

  // Sterowanie
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // UI przyciski mobilne
  document.getElementById('left').addEventListener('pointerdown', () => keys['arrowleft']=keys['a']=true);
  document.getElementById('left').addEventListener('pointerup',   () => keys['arrowleft']=keys['a']=false);
  document.getElementById('right').addEventListener('pointerdown', () => keys['arrowright']=keys['d']=true);
  document.getElementById('right').addEventListener('pointerup',   () => keys['arrowright']=keys['d']=false);
  document.getElementById('jump').addEventListener('pointerdown', () => { keys[' ']=true; setTimeout(()=>keys[' ']=false, 120); });

  // Prosty HUD
  let score = 0;

  // Główna pętla
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(40, t - last);
    last = t;
    update(dt / 16.67); // ~frame normalization
    draw();
    requestAnimationFrame(loop);
  }

  function update(delta) {
    // Sterowanie poziome
    const left = keys['arrowleft'] || keys['a'];
    const right = keys['arrowright'] || keys['d'];
    if (left) player.vx -= 0.35;
    if (right) player.vx += 0.35;
    // ograniczenia prędkości
    player.vx = Math.max(-player.maxVx, Math.min(player.maxVx, player.vx));

    // Grawitacja i skakanie
    player.vy += gravity;
    if ((keys[' '] || keys['space']) && player.grounded) {
      player.vy = -10; // skok
      player.grounded = false;
      // drobny "obrót" podczas skoku
      player.angularVelocity = -0.4 * (player.vx >= 0 ? 1 : -1);
    }

    // Zastosuj ruch
    player.x += player.vx;
    player.y += player.vy;

    // Krawędzie ekranu -> ogranicz i odbij lekko
    if (player.x < player.r) { player.x = player.r; player.vx *= -0.2; }
    if (player.x > W - player.r) { player.x = W - player.r; player.vx *= -0.2; }

    // Kamera: automatyczne przesuwanie w górę
    camera.y += camera.speed;

    // Aktualizuj rotację (spin)
    player.rotation += player.angularVelocity;
    player.angularVelocity *= 0.95; // damping rotacji

    // Kolizje z platformami
    player.grounded = false;
    // Sprawdzamy kolizje z platformami względem kamery
    for (let p of platforms) {
      const pyScreen = p.y - camera.y; // pozycja platformy na ekranie
      const nextY = player.y;
      // proste AABB vs circle (tylko góra platformy)
      const withinX = player.x + player.r > p.x && player.x - player.r < p.x + p.w;
      const playerBottom = player.y + player.r;
      const platformTop = p.y;
      // Jeśli gracz nad platformą i spada na nią
      if (withinX && playerBottom > platformTop && playerBottom - player.vy <= platformTop + 1) {
        // ląduje
        player.y = platformTop - player.r;
        // Jeśli prędkość pionowa wskazuje, że faktycznie był upadek
        if (player.vy > 2) {
          // lekki slide i spin przy lądowaniu
          const slideDir = Math.sign(player.vx) || (Math.random() < 0.5 ? -1 : 1);
          player.vx += slideDir * slideBoost * 0.3;
          player.angularVelocity += 0.8 * slideDir; // spin
        }
        player.vy = 0;
        player.grounded = true;
      }
    }

    // Zamień platformy, które wyszły poza ekran (na dole), i generuj nowe w górę
    // Usuwamy platformy, które są za daleko w dół (wyżej od kamery) -> y - camera.y < -200
    while (platforms.length && platforms[0].y - camera.y > H + 300) {
      platforms.shift();
    }
    // Dodaj nowe platformy u góry (mniejsze y)
    while (platforms.length < 14) {
      const lastY = platforms.length ? platforms[platforms.length - 1].y : H - 40;
      let newY = lastY - (Math.random() * (gapMax - gapMin) + gapMin);
      createPlatformAt(newY);
    }

    // Delikatne tarcie poziome -> efekt ślizgania
    player.vx *= friction;

    // Score: jak daleko poszliśmy (używamy camera.y)
    score = Math.max(score, Math.floor(camera.y));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tło gradient (dynamiczne)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Rysuj platformy
    ctx.fillStyle = platformColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let p of platforms) {
      const sy = p.y - camera.y;
      if (sy < -200 || sy > H + 200) continue; // poza ekranem
      ctx.beginPath();
      roundRect(ctx, p.x, sy, p.w, p.h, 6);
      ctx.fill();
      ctx.stroke();
    }

    // Rysuj gracza jako okrąg z rotacją i "cieniem"
    const sx = player.x;
    const sy = player.y - camera.y;

    // cień
    ctx.beginPath();
    ctx.ellipse(sx, sy + player.r + 8, player.r * 1.05, player.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // postać (okrąg) z obrotem graficznym
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(player.rotation);
    // kolor w zależności od stanu (w powietrzu vs na ziemi)
    ctx.fillStyle = player.grounded ? '#ff5656' : '#ff9a9a';
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    // "oczy" - dla lepszego efektu obrotu
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(6, -6, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HUD - score
    ctx.fillStyle = '#064e77';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + Math.floor(score), 12, 24);

    // Instrukcja mała jeśli blisko początku
    if (camera.y < 200) {
      ctx.fillStyle = 'rgba(5,50,90,0.06)';
      ctx.fillRect(8, 32, W - 16, 48);
      ctx.fillStyle = '#064e77';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Celem jest iść w górę. Steruj: ← →, skok: Spacja', W/2, 60);
    }
  }

  // Helper - zaokrąglony prostokąt
  function roundRect(ctx, x, y, w, h, r) {
    const radius = r;
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  // Start
  requestAnimationFrame(loop);
})();
