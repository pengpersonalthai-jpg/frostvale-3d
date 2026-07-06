/**
 * Keyboard + pointer-lock mouse input.
 *
 * - `isDown(code)`  — is the key held right now?
 * - `wasPressed(code)` — did the key go down since last frame? (edge trigger,
 *    used for jump / mount so holding E doesn't spam mount/dismount)
 * - `mouseDX/DY` — accumulated pointer-lock deltas, cleared via endFrame().
 */

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this._lockListeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Keep Space from scrolling the page if pointer lock ever drops
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Drop all keys when the tab loses focus (avoids "stuck sprint")
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      for (const cb of this._lockListeners) cb(this.locked);
    });
  }

  requestLock() {
    this.dom.requestPointerLock();
  }

  onLockChange(cb) {
    this._lockListeners.push(cb);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
