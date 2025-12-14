// Prosty moduł kamery (globalny obiekt `camera`)
// Init: camera.init(screenHeight, followRatio)
// Każda klatka -> camera.update(targetY) gdzie targetY to world-y celu (np. player.y)
// Odczyt pozycji kamery: camera.y
(function () {
  window.camera = {
    y: 0,
    h: 600,
    followOffset: 0,
    smooth: 0.12, // lerp factor
    init: function (screenHeight, followRatio = 0.5) {
      this.h = screenHeight || this.h;
      this.followOffset = this.h * followRatio;
      // zachowaj y (np. przy resize)
    },
    // targetY to pozycja w świecie (np. player.y)
    update: function (targetY) {
      const target = targetY - this.followOffset;
      this.y += (target - this.y) * this.smooth;
    }
  };
})();
