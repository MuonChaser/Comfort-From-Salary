(function () {
  'use strict';
  class CommuterPlayer {
    constructor(element, options = {}) {
      this.element = element;
      this.assets = options.assets || window.CFSYueyaAssets;
      this.active = false;
      this.loaded = false;
      this.phase = 'idle';
      this.step = 0;
      this.timer = null;
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced = this.media.matches;
      this.media.addEventListener('change', event => this.setReduced(event.matches));
      this.onReady = options.onReady || (() => {});
      this.onPhase = options.onPhase || (() => {});
      this.nextAction = Infinity;
      this.element.style.backgroundImage = `url("${this.assets.sheet}")`;
      this.element.style.backgroundSize = `${this.assets.columns * 100}% ${this.assets.rows * 100}%`;
      this.paint();
      this.ready = new Promise(resolve => {
        const image = new Image();
        image.onload = () => { this.loaded = true; this.onReady(true); if (this.active) this.beginIdle(); resolve(true); };
        image.onerror = () => { this.onReady(false); resolve(false); };
        image.src = this.assets.sheet;
      });
    }
    paint() {
      const frame = this.assets[this.phase].frames[this.step];
      const x = frame % this.assets.columns, y = Math.floor(frame / this.assets.columns);
      this.element.style.backgroundPosition = `${x / (this.assets.columns - 1) * 100}% ${y / (this.assets.rows - 1) * 100}%`;
      this.element.dataset.frame = String(frame);
      this.element.dataset.phase = this.phase;
      this.element.dataset.playing = String(this.active && !this.reduced && this.loaded);
    }
    schedule() {
      clearTimeout(this.timer);
      this.paint();
      if (!this.active || this.reduced || !this.loaded) return;
      this.timer = setTimeout(() => {
        this.step++;
        if (this.step >= this.assets[this.phase].frames.length) {
          if (this.phase === 'action') { this.beginIdle(); return; }
          this.step = 0;
          if (Date.now() >= this.nextAction) { this.playAction(); return; }
        }
        this.schedule();
      }, this.assets[this.phase].delays[this.step]);
    }
    beginIdle() {
      this.phase = 'idle'; this.step = 0;
      const [min, max] = this.assets.randomInterval;
      this.nextAction = Date.now() + min + Math.random() * (max - min);
      this.onPhase('idle'); this.schedule();
    }
    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      clearTimeout(this.timer);
      if (active) this.beginIdle();
      else this.paint();
    }
    setReduced(reduced) {
      if (this.reduced === reduced) return;
      this.reduced = reduced;
      clearTimeout(this.timer);
      if (this.active) this.beginIdle(); else this.paint();
    }
    playAction() {
      if (!this.active || this.reduced || !this.loaded) return false;
      this.phase = 'action'; this.step = 0;
      this.onPhase('action'); this.schedule();
      return true;
    }
  }
  window.CFSCommuterPlayer = CommuterPlayer;
})();
