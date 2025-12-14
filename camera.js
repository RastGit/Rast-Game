// Prosty moduł kamery (globalny obiekt `camera`)
// Init: camera.init(screenHeight, followRatio)
// Każda klatka -> camera.update(targetY) gdzie targetY to world-y celu (np. player.y)
// Można też wymusić natychmiastowe ustawienie kamery: camera.focus(targetY, true)
(function () {
  window.camera = {
    y: 0,
    h: 600,
    followOffset: 0,
    smooth: 0.18, // szybsze podążanie kamery
    init: function (screenHeight, followRatio = 0.5) {
      this.h = screenHeight || this.h;
      this.followOffset = this.h * followRatio;
    },
    // targetY to pozycja w świecie (np. player.y)
    // jeśli instant === true -> ustawiamy kamerę natychmiast
    update: function (targetY, instant = false) {
      const target = targetY - this.followOffset;
      if (instant) {
        this.y = target;
        return;
      }
      // lerp / smooth follow
      this.y += (target - this.y) * this.smooth;
    },
    focus: function (targetY) {
      // szybka, natychmiastowa zmiana pozycji kamery na target
      this.update(targetY, true);
    }
  };
})();
