/**
 * Keyboard + pointer-lock mouse input, with robust action mapping.
 *
 * Keys are tracked by BOTH the physical `e.code` (e.g. "KeyE", "ShiftLeft")
 * and the produced `e.key` (normalised, e.g. "e", "shift"). Checking either
 * one makes the bindings survive non-QWERTY layouts (AZERTY, Dvorak, Thai,
 * …), IMEs, and browser quirks where one of the two fields is unreliable —
 * this is what makes E / Shift work everywhere.
 *
 * Game code asks for *actions* ("sprint", "interact"), never raw keys:
 *  - `action(name)`     — is any key bound to the action held right now?
 *  - `actionPressed(name)` — did it go down since last frame? (edge trigger,
 *     used for jump / mount so holding E doesn't spam mount/dismount)
 */

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp', 'key:w'],
  back: ['KeyS', 'ArrowDown', 'key:s'],
  left: ['KeyA', 'ArrowLeft', 'key:a'],
  right: ['KeyD', 'ArrowRight', 'key:d'],
  sprint: ['ShiftLeft', 'ShiftRight', 'key:shift'],
  jump: ['Space', 'key:space'],
  interact: ['KeyE', 'key:e'],
};

/** Normalise e.key: " " → "space", case-folded. */
function keyName(e) {
  const k = e.key === ' ' ? 'space' : e.key;
  return 'key:' + k.toLowerCase();
}

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.down = new Set();     // held keys: both codes and key names
    this.pressed = new Set();  // went down this frame (edge)
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this._lockListeners = [];

    window.addEventListener('keydown', (e) => {
      // Don't hijack browser shortcuts (Ctrl+R etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const name = keyName(e);
      if (!e.repeat && !this.down.has(e.code)) {
        this.pressed.add(e.code);
        this.pressed.add(name);
      }
      this.down.add(e.code);
      this.down.add(name);
      // Keep Space/arrows from scrolling the page if pointer lock drops
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.down.delete(keyName(e));
      // Shift released while a letter is held changes what e.key reports for
      // the later letter keyup — clearing everything on Shift-up is the
      // simple, safe way to avoid stuck movement keys.
      if (e.key === 'Shift') {
        for (const k of [...this.down]) {
          if (k.startsWith('key:') && k.length === 5) this.down.delete(k);
        }
      }
    });
    // Drop all keys when the tab loses focus (avoids "stuck sprint")
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.down.clear();
      for (const cb of this._lockListeners) cb(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      for (const cb of this._lockListeners) cb(false);
    });
  }

  requestLock() {
    this.dom.requestPointerLock();
  }

  onLockChange(cb) {
    this._lockListeners.push(cb);
  }

  /** Is the action held right now? */
  action(name) {
    for (const bind of BINDINGS[name]) {
      if (this.down.has(bind)) return true;
    }
    return false;
  }

  /** Did the action go down since last frame? */
  actionPressed(name) {
    for (const bind of BINDINGS[name]) {
      if (this.pressed.has(bind)) return true;
    }
    return false;
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
