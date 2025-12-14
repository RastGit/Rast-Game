// AntyBug.js - moduł naprawczy drobnych błędów rozgrywki
// API:
//   AntyBug.init(playerRef, { getWorldWidth, getPlatforms, respawn })   // inicjalizacja
//   AntyBug.update(delta)                                                 // wywoływane w pętli gry (delta = ten sam parametr co update w game.js)
// Cel:
// - zapobiega ekstremalnym prędkościom (clamp)
// - naprawia przypadek "po respawnie lecę w prawo i przylepiam się do ściany"
// - "wyciąga" gracza z ciasnych szczelin między platformą a ścianą
// - jeśli gracz przyklejony do ściany dłużej niż ~1.2s -> delikatne przepchnięcie w stronę środka (nudge)
// Uwaga: moduł nie zakłada struktury wewnętrznej gry poza minimalnymi getterami przekazanymi w init.

(function () {
  const AntyBug = {
    inited: false,
    player: null,
    opts: {
      getWorldWidth: null,
      getPlatforms: null,
      respawn: null
    },

    // konfig
    MAX_VY: 50,              // maks prędkość pionowa
    MAX_VX_MULT: 3.0,        // maks prędkość pozioma = player.maxVx * MAX_VX_MULT (bezpieczny limit)
    STUCK_FRAMES_THRESHOLD: Math.round(1.2 * 60), // ok. 1.2s przy ~60fps -> ok. 72 "delta" jednostek
    WALL_NUDGE_SPEED: 2.0,   // prędkość nadawana przy odklejeniu od ściany
    GAP_ESCAPE_SPEED: 1.8,   // prędkość przy ucieczce z wąskiej szczeliny
    MIN_GAP_CLEAR: 2.5,      // minimalna odległość od ściany po przesunięciu (px)

    // stan
    wallStuckCounter: 0,
    gapStuckCounter: 0,

    init(playerRef, opts = {}) {
      this.player = playerRef;
      if (!this.player) throw new Error('AntyBug.init: brak referencji gracza');
      this.opts.getWorldWidth = opts.getWorldWidth || (() => 0);
      this.opts.getPlatforms = opts.getPlatforms || (() => []);
      this.opts.respawn = opts.respawn || null;
      this.inited = true;
      this.wallStuckCounter = 0;
      this.gapStuckCounter = 0;
    },

    update(delta) {
      if (!this.inited || !this.player) return;
      // delta jest tym samym parametrem co w game.update (normalizowany ~1 per frame)
      const p = this.player;
      const W = (this.opts.getWorldWidth && this.opts.getWorldWidth()) || 0;
      const platforms = (this.opts.getPlatforms && this.opts.getPlatforms()) || [];

      // 1) Clamp prędkości (ochrona przed "metodami" ustawiającymi ekstremalne wartości)
      const safeMaxVx = Math.max(8, (p.maxVx || 6) * this.MAX_VX_MULT);
      if (!Number.isFinite(p.vx) || Math.abs(p.vx) > safeMaxVx) {
        p.vx = Math.sign(p.vx || 1) * Math.min(Math.abs(p.vx || 0), safeMaxVx);
      }
      if (!Number.isFinite(p.vy) || Math.abs(p.vy) > this.MAX_VY) {
        p.vy = Math.sign(p.vy || 1) * Math.min(Math.abs(p.vy || 0), this.MAX_VY);
      }

      // 2) Zapobiegaj "wystrzeleniu" w prawo po respawnie
      // Jeśli wykryjemy, że gracz ma po respawnie dużą prędkość poziomą lub jest przyklejony do ściany od razu,
      // dokonujemy bezpiecznego zresetowania vx i lekkiego odsunięcia od ściany.
      // Aby nie kolidować z zamierzonymi zachowaniami, robimy to tylko gdy gracz tuż po respawnie (ma niski score lub jest blisko startu)
      if (Math.abs(p.vx) > safeMaxVx * 0.6) {
        // agresywnie obcinamy nieprawidłowe wartości
        p.vx = 0;
        p.angularVelocity = 0;
      }

      // 3) Wykrywanie "przyklejenia" do ściany (lewej/prawej)
      const touchingLeft = p.x - p.r <= 0.5;
      const touchingRight = p.x + p.r >= W - 0.5;
      const touchingWall = touchingLeft || touchingRight;

      // Jeśli dotknięcie ściany + niemal brak prędkości poziomej -> zwiększamy licznik
      if (touchingWall && Math.abs(p.vx) < 0.6) {
        this.wallStuckCounter += delta;
      } else {
        this.wallStuckCounter = 0;
      }

      // 4) Jeśli przyklejony dłużej niż threshold -> zrób nudge (delikatne wypchnięcie ze ściany)
      if (this.wallStuckCounter >= this.STUCK_FRAMES_THRESHOLD) {
        // nudge do środka
        if (touchingLeft) {
          p.x = Math.max(p.r + this.MIN_GAP_CLEAR, p.x);
          p.vx = this.WALL_NUDGE_SPEED;
        } else if (touchingRight) {
          p.x = Math.min(W - p.r - this.MIN_GAP_CLEAR, p.x);
          p.vx = -this.WALL_NUDGE_SPEED;
        } else {
          // Tego przypadku raczej nie będzie, ale zabezpieczamy
          p.vx = 0;
        }
        p.angularVelocity = 0;
        this.wallStuckCounter = 0; // reset po nudżu
      }

      // 5) Detekcja ciasnych szczelin między platformą a ścianą:
      // Jeśli gracz jest w wąskiej szczelinie (odległość do ściany < r+4 i platforma przylega blisko),
      // próbujemy go delikatnie wysunąć w stronę środka.
      let inNarrowGap = false;
      for (let i = 0; i < platforms.length; i++) {
        const pl = platforms[i];
        // sprawdź, czy jesteśmy na wysokości platformy (przybliżenie)
        const playerBottom = p.y + p.r;
        const playerTop = p.y - p.r;
        // jeśli gracz jest mniej więcej na wysokości platformy (w pionie)
        if (!(playerBottom < pl.y - 6 || playerTop > pl.y + pl.h + 6)) {
          // oblicz odległość platformy od lewej i prawej ściany
          const gapLeft = pl.x; // odległość od lewej ściany do platformy
          const gapRight = W - (pl.x + pl.w); // od ściany prawej
          // jeśli platforma jest bardzo blisko ściany i gracz w tym obszarze
          if (gapLeft >= 0 && gapLeft < p.r + 6 && p.x - p.r < pl.x + 6 && p.x < pl.x + 8) {
            // wąska szczelina po lewej
            inNarrowGap = true;
            // zwiększ licznik...
            this.gapStuckCounter += delta;
            break;
          }
          if (gapRight >= 0 && gapRight < p.r + 6 && p.x + p.r > pl.x + pl.w - 6 && p.x > pl.x + pl.w - 8) {
            // wąska szczelina po prawej
            inNarrowGap = true;
            this.gapStuckCounter += delta;
            break;
          }
        }
      }
      if (!inNarrowGap) this.gapStuckCounter = 0;

      // 6) Jeśli w ciasnej szczelinie przez dłużej niż half of wall threshold -> delikatnie wypchnij
      if (this.gapStuckCounter >= Math.round(this.STUCK_FRAMES_THRESHOLD * 0.5)) {
        // sprawdź, która strona ("bliżej" której ściany) i wypchnij przeciwnie
        // prosty heurystyczny nudge:
        if (p.x < W * 0.5) {
          // bliżej lewej strony -> przepchnij w prawo
          p.vx = Math.max(p.vx, this.GAP_ESCAPE_SPEED);
          p.x = Math.min(W - p.r - this.MIN_GAP_CLEAR, Math.max(p.x, p.r + this.MIN_GAP_CLEAR + 1));
        } else {
          p.vx = Math.min(p.vx, -this.GAP_ESCAPE_SPEED);
          p.x = Math.max(p.x, p.r + this.MIN_GAP_CLEAR);
        }
        p.angularVelocity = 0;
        this.gapStuckCounter = 0;
      }

      // 7) Safety: jeśli gracz "zablokował się" w miejscu (brak ruchu przez długi czas i jest po ziemi),
      // zrób małe przesunięcie lub - gdy dostępna funkcja respawn - respawnuj (ostrożnie).
      // (Uwaga: respawn może być irytujący, więc używamy go tylko gdy wykryjemy NIEODWROTNY deadlock).
      // Prostota: jeżeli gracz jest poza ekranem poziomo (coś mocno niepokojącego) -> respawn jeśli funkcja istnieje.
      if ((p.x < -50 || p.x > W + 50) && typeof this.opts.respawn === 'function') {
        try { this.opts.respawn(); } catch (e) { /* ciche */ }
      }
    }
  };

  // Eksport
  window.AntyBug = AntyBug;
})();
