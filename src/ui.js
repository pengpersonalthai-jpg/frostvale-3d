/**
 * Thin DOM helper for the HUD: start/pause overlay, mount prompt,
 * per-mode controls panel, and the zone-name toast.
 */

const HUD_FOOT = `
  <div class="mode">ON FOOT</div>
  <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> sprint &nbsp; <kbd>Space</kbd> jump<br />
  <kbd>E</kbd> mount &nbsp; <kbd>Esc</kbd> release mouse
`;
const HUD_MOUNTED = `
  <div class="mode">MOUNTED</div>
  <kbd>W</kbd> ride &nbsp; <kbd>S</kbd> halt / back &nbsp; <kbd>A</kbd><kbd>D</kbd> steer<br />
  <kbd>Shift</kbd> gallop &nbsp; <kbd>E</kbd> dismount
`;

export class UI {
  constructor() {
    this.overlay = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.prompt = document.getElementById('prompt');
    this.toast = document.getElementById('zone-toast');
    this.enterHint = document.getElementById('enter-hint');
    this._promptText = '';
    this._toastShown = false;
    this.setMode('foot');
  }

  onEnterClick(cb) {
    this.overlay.addEventListener('click', cb);
  }

  setPlaying(playing) {
    this.overlay.classList.toggle('hidden', playing);
    this.hud.classList.toggle('visible', playing);
    if (playing && !this._toastShown) {
      this._toastShown = true;
      this.toast.classList.add('visible');
      setTimeout(() => this.toast.classList.remove('visible'), 5200);
    }
    if (!playing) this.enterHint.textContent = 'CLICK TO RETURN TO THE VALE';
  }

  setMode(mode) {
    this.hud.innerHTML = mode === 'mounted' ? HUD_MOUNTED : HUD_FOOT;
  }

  showPrompt(text) {
    if (text !== this._promptText) {
      this.prompt.innerHTML = `<kbd>E</kbd>${text}`;
      this._promptText = text;
    }
    this.prompt.classList.add('visible');
  }

  hidePrompt() {
    this.prompt.classList.remove('visible');
    this._promptText = '';
  }
}
