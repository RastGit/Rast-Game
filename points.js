// points.js - zarządzanie punktami i power-upami
// API globalne: window.Points.init(options), window.Points.update(delta), window.Points.onLand(platform), window.Points.draw(ctx)
// options: { getNow: ()=>timeInSecondsOptional }
// Platforms may have: platform.pickup = { type: 'x2'|'x3'|'minus10' }

(function () {
  const Points = {
    points: 0,
    // active multiplier: { value: 1|2|3, expiresAt: timestamp seconds } - 1 means none
    activeMultiplier: { value: 1, expiresAt: 0 },
    getNow: () => (performance.now() / 1000),
    // init optional
    init(opts = {}) {
      if (opts.getNow) this.getNow = opts.getNow;
      this.points = 0;
      this.activeMultiplier = { value: 1, expiresAt: 0 };
    },

    // update multipliers timers
    update(delta) {
      const now = this.getNow();
      if (this.activeMultiplier.value > 1 && now >= this.activeMultiplier.expiresAt) {
        this.activeMultiplier = { value: 1, expiresAt: 0 };
      }
    },

    // Called when player lands on a platform (platform object provided)
    // Awards points only once per platform (platform.collected flag)
    onLand(platform) {
      if (!platform || platform.collected) return;
      platform.collected = true;

      // Base point for landing on a platform
      let base = 1;

      // If platform has pickup, resolve it first
      if (platform.pickup && !platform.pickupCollected) {
        const t = platform.pickup.type;
        platform.pickupCollected = true;
        if (t === 'minus10') {
          this.points -= 10;
          // no further awarding from this platform (still mark collected)
          return;
        } else if (t === 'x2' || t === 'x3') {
          // activate multiplier for 10 seconds
          const now = this.getNow();
          const val = (t === 'x2') ? 2 : 3;
          // If incoming multiplier is higher than current, set it.
          // Otherwise, override/refresh (makes picking x2 while x3 active less effective).
          this.activeMultiplier = { value: val, expiresAt: now + 10.0 };
          // continue to award base points under the new multiplier for this platform landing as well
        }
      }

      // award points (apply active multiplier)
      const mult = this.activeMultiplier.value || 1;
      this.points += base * mult;
    },

    // render HUD for active multipliers (only x2/x3)
    draw(ctx) {
      // show only if multiplier >1
      if (!ctx) return;
      if (this.activeMultiplier.value > 1) {
        const label = 'x' + this.activeMultiplier.value;
        // draw a small circle in top-left
        const x = 48, y = 28, r = 14;
        ctx.save();
        ctx.fillStyle = '#ffd24d';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + 1);
        // draw a small timer arc
        const now = this.getNow();
        const remaining = Math.max(0, this.activeMultiplier.expiresAt - now);
        const frac = Math.max(0, Math.min(1, remaining / 10));
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
        ctx.stroke();
        ctx.restore();
      }
      // draw points numeric
      ctx.save();
      ctx.fillStyle = '#064e77';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Points: ' + Math.floor(this.points), 12, 24);
      ctx.restore();
    }
  };

  window.Points = Points;
})();
