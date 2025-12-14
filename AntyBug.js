// AntyBug.js - moduł naprawczy drobnych błędów rozgrywki (poprawiona wersja)
// Cel poprawek w tej wersji:
// - NIE wpływamy na p.vy poza bezpiecznym clampem (grawitacja = tylko do podłogi)
// - usuwamy "przyciąganie" do ściany — zamiast ciągłego ustawiania pozycji robimy jednorazowe impulsy/nudges
// - lepsze wykrywanie "przyklejenia" (oparte o brak ruchu), a nie tylko o dotyk ściany
// - naprawiamy przypadki po respawnie (zerowanie nieprawidłowych dużych vx)
// API:
//   AntyBug.init(playerRef, { getWorldWidth, getPlatforms, respawn })   // wymagane
//   AntyBug.update(delta)                                                 // wywoływane w pętli gry (delta ~1 na klatkę)
(function () {
  const AntyBug = {
    inited: false,
    player: null,
    opts: {
      getWorldWidth: null,
      getPlatforms: null,
      respawn: null
    },

    // konfiguracja
    MAX_VY: 50,
    MAX_VX_MULT: 3.0,          // bezpieczny limit = player.maxVx * MULT
    STUCK_FRAMES_THRESHOLD: Math.round(1.2 * 60), // ~1.2s przy 60fps
    WALL_NUDGE_IMPULSE: 2.2,   // jednorazowy impuls poziomy przy odklejeniu
    MIN_GAP_CLEAR: 2.5,        // minimalne odsunięcie od ściany po nudżu (px)
    MIN_MOVEMENT_TO_CONSIDER_FREE: 0.8, // jeśli przesunięcie < tej wartości to traktujemy jako "brak ruchu"

    // stan
    wallStuckCounter: 0,
    gapStuckCounter: 0,
    prevX: 0,
    prevY: 0,
    lastNudgeFrame: -9999,
    frameCounter: 0,

    init(playerRef, opts = {}) {
      if (!playerRef) throw new Error('AntyBug.init: brak referencji gracza');
      this.player = playerRef;
      this.opts.getWorldWidth = opts.getWorldWidth || (() => 0);
      this.opts.getPlatforms = opts.getPlatforms || (() => []);
      this.opts.respawn = opts.respawn || null;
      this.inited = true;
      this.wallStuckCounter = 0;
      this.gapStuckCounter = 0;
      this.prevX = playerRef.x || 0;
      this.prevY = playerRef.y || 0;
      this.lastNudgeFrame = -9999;
      this.frameCounter = 0;
    },

    update(delta = 1) {
      if (!this.inited || !this.player) return;
      const p = this.player;
      const W = (this.opts.getWorldWidth && this.opts.getWorldWidth()) || 0;
      const platforms = (this.opts.getPlatforms && this.opts.getPlatforms()) || [];

      this.frameCounter += delta;

      // 1) Clamp prędkości - tylko ograniczamy, nie nadpisujemy "zamierzonego" ruchu
      const safeMaxVx = Math.max(8, (p.maxVx || 6) * this.MAX_VX_MULT);
      if (!Number.isFinite(p.vx) || Math.abs(p.vx) > safeMaxVx) {
        p.vx = Math.sign(p.vx || 1) * Math.min(Math.abs(p.vx || 0), safeMaxVx);
      }
      if (!Number.isFinite(p.vy) || Math.abs(p.vy) > this.MAX_VY) {
        p.vy = Math.sign(p.vy || 1) * Math.min(Math.abs(p.vy || 0), this.MAX_VY);
      }

      // 2) Po respawnie: jeśli mamy ekstremalnie dużą vx -> delikatne wyzerowanie (ochrona przed glitchami)
      // (nie robimy tego na każdym frame, tylko jeśli wartość jest naprawdę podejrzana)
      if (Math.abs(p.vx) > safeMaxVx * 0.6) {
        p.vx = 0;
        p.angularVelocity = 0;
      }

      // 3) Detekcja ruchu — czy gracz się porusza w poziomie wystarczająco?
      const movedX = Math.abs(p.x - this.prevX);
      const movedY = Math.abs(p.y - this.prevY);

      const isMovingHorizontally = movedX > this.MIN_MOVEMENT_TO_CONSIDER_FREE;

      // 4) Wykrywanie faktycznego "dotyku" ściany (przenikanie/overlap) - tolerancja 0.001
      const touchingLeft = (p.x - p.r) <= 0 + 0.001;
      const touchingRight = (p.x + p.r) >= W - 0.001;
      const touchingWall = touchingLeft || touchingRight;

      // Zwiększamy licznik tylko wtedy, gdy gracz jest prawie nieruchomy i dotyka ściany
      if (touchingWall && !isMovingHorizontally) {
        this.wallStuckCounter += delta;
      } else {
        this.wallStuckCounter = 0;
      }

      // 5) Jeśli "przyklejenie" trwa dłużej niż próg -> wykonaj jednorazowy nudge/impuls
      if (this.wallStuckCounter >= this.STUCK_FRAMES_THRESHOLD) {
        // zapobiegamy wielokrotnym nudgom co klatkę - minimalny odstęp 20 klatek
        if (this.frameCounter - this.lastNudgeFrame > 20) {
          if (touchingLeft) {
            // delikatne przesunięcie i dodanie impulsywnej prędkości na prawo
            p.x = Math.max(p.r + this.MIN_GAP_CLEAR, p.x + 0.5);
            p.vx = Math.max(p.vx, this.WALL_NUDGE_IMPULSE);
          } else if (touchingRight) {
            p.x = Math.min(W - p.r - this.MIN_GAP_CLEAR, p.x - 0.5);
            p.vx = Math.min(p.vx, -this.WALL_NUDGE_IMPULSE);
          }
          // nie zmieniamy p.vy tutaj! grawitacja = tylko w dół (do podłogi)
          p.angularVelocity = 0;
          this.lastNudgeFrame = this.frameCounter;
          this.wallStuckCounter = 0;
        }
      }

      // 6) Detekcja ciasnych szczelin między platformą a ścianą.
      //    Jeśli gracz znajduje się w wąskim obszarze i praktycznie się nie rusza -> delikatny escape nudge.
      let inNarrowGap = false;
      for (let i = 0; i < platforms.length; i++) {
        const pl = platforms[i];
        // pionowe dopasowanie (czy gracz jest w zakresie wysokości platformy +/- mały margines)
        const playerBottom = p.y + p.r;
        const playerTop = p.y - p.r;
        if (playerBottom < pl.y - 6 || playerTop > pl.y + pl.h + 6) continue;

        const gapLeft = pl.x; // odległość platformy od lewej ściany
        const gapRight = W - (pl.x + pl.w); // odległość od prawej ściany

        // Sprawdź, czy gracz jest "przylepiony" do platformy blisko ściany
        if (gapLeft >= 0 && gapLeft < p.r + 6 && p.x - p.r < pl.x + 6 && p.x < pl.x + 8) {
          inNarrowGap = true;
          this.gapStuckCounter += delta;
          break;
        }
        if (gapRight >= 0 && gapRight < p.r + 6 && p.x + p.r > pl.x + pl.w - 6 && p.x > pl.x + pl.w - 8) {
          inNarrowGap = true;
          this.gapStuckCounter += delta;
          break;
        }
      }
      if (!inNarrowGap) this.gapStuckCounter = 0;

      // 7) Jeśli w ciasnej szczelinie zbyt długo -> delikatny escape nudge (jednorazowy)
      if (this.gapStuckCounter >= Math.round(this.STUCK_FRAMES_THRESHOLD * 0.5)) {
        if (this.frameCounter - this.lastNudgeFrame > 20) {
          // wybierz kierunek wypchnięcia wg środka świata
          if (p.x < W * 0.5) {
            p.vx = Math.max(p.vx, 1.6);
            p.x = Math.min(W - p.r - this.MIN_GAP_CLEAR, Math.max(p.x, p.r + this.MIN_GAP_CLEAR + 0.5));
          } else {
            p.vx = Math.min(p.vx, -1.6);
            p.x = Math.max(p.x, p.r + this.MIN_GAP_CLEAR + 0.5);
          }
          p.angularVelocity = 0;
          this.lastNudgeFrame = this.frameCounter;
          this.gapStuckCounter = 0;
        }
      }

      // 8) Safety: jeśli gracz bardzo poza światem poziomo -> użyj respawn (ostrożnie)
      if ((p.x < -80 || p.x > W + 80) && typeof this.opts.respawn === 'function') {
        try { this.opts.respawn(); } catch (e) { /* ignoruj */ }
      }

      // zapamiętaj pozycję na koniec
      this.prevX = p.x;
      this.prevY = p.y;
    }
  };

  // eksport
  window.AntyBug = AntyBug;
})();
