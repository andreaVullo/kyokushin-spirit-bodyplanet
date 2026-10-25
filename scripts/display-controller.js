/* One display owner: a cooperating host, otherwise the local cabinet. */
(function (global) {
  'use strict';
  class DojoDisplay {
    constructor({ window: win = global, document: doc = win.document, element, hostOrigin = null, onChange = () => {}, onInputReset = () => {} }) {
      this.win = win; this.doc = doc; this.element = element; this.hostOrigin = hostOrigin;
      this.onChange = onChange; this.onInputReset = onInputReset;
      this.requested = false; this.hostManaged = false; this.hostPending = false;
      this.layoutOnly = false;
      this.nativePending = false; this.nativeOwned = false; this.serial = 0;
      this.message = event => this.receive(event);
      this.fullscreen = () => this.fullscreenChanged();
      win.addEventListener('message', this.message);
      doc.addEventListener('fullscreenchange', this.fullscreen);
      doc.addEventListener('webkitfullscreenchange', this.fullscreen);
      this.send('sync');
    }
    nativeElement() { return this.doc.fullscreenElement || this.doc.webkitFullscreenElement; }
    send(action) {
      if (!this.hostOrigin || this.win.parent === this.win) return false;
      this.win.parent.postMessage({ type: 'kyokushin:display', action, requestId: this.serial }, this.hostOrigin);
      return true;
    }
    changed() { this.onInputReset(); this.onChange(); }
    clearTimers() {
      this.win.clearTimeout(this.hostTimer); this.win.clearTimeout(this.nativeTimer);
    }
    open({ native = true } = {}) {
      this.clearTimers(); const serial = ++this.serial;
      this.requested = true; this.nativePending = false; this.layoutOnly = !native;
      if (this.send('landscape')) {
        this.hostPending = !this.hostManaged;
        // Older launchers may ignore the display protocol. Do not wait forever.
        if (this.hostPending) this.hostTimer = this.win.setTimeout(() => {
          if (serial !== this.serial || !this.requested) return;
          this.hostPending = false; this.changed();
        }, 500);
      }
      this.changed();
      if (!native) return;
      // The layout fallback is already active. Fullscreen only hides browser UI;
      // it never decides whether portrait is playable and never locks the device.
      const request = this.element.requestFullscreen || this.element.webkitRequestFullscreen;
      if (!request || this.nativeElement()) return;
      this.nativePending = true;
      let result;
      try { result = request.call(this.element, { navigationUI: 'hide' }); }
      catch (_) { this.nativePending = false; this.changed(); return; }
      this.nativeTimer = this.win.setTimeout(() => {
        if (serial === this.serial) { this.nativePending = false; this.changed(); }
      }, 1500);
      Promise.resolve(result).catch(() => {}).then(() => {
        if (serial !== this.serial) {
          if (!this.requested && this.nativeElement() === this.element) this.exitNative();
          return;
        }
        this.win.clearTimeout(this.nativeTimer); this.nativePending = false; this.changed();
      });
    }
    exitNative() {
      if (this.nativeElement() !== this.element) return;
      try { Promise.resolve((this.doc.exitFullscreen || this.doc.webkitExitFullscreen)?.call(this.doc)).catch(() => {}); } catch (_) {}
    }
    close(notifyHost = true) {
      this.serial++; this.clearTimers();
      this.requested = false; this.hostPending = false; this.nativePending = false;
      this.layoutOnly = false;
      this.nativeOwned = false;
      if (notifyHost) this.send('exit');
      this.exitNative(); this.changed();
    }
    toggle() {
      // Automatic fitting must not turn the first fullscreen tap into an exit.
      if (this.layoutOnly) this.open();
      else this.requested || this.nativeElement() === this.element ? this.close() : this.open();
    }
    fullscreenChanged() {
      if (this.nativeElement() === this.element) {
        this.nativeOwned = true; this.nativePending = false;
        if (!this.requested) { this.exitNative(); return; }
      } else if (this.nativeOwned) {
        // Rotation, app switches or browser UI can dismiss native fullscreen.
        // Keep the requested cabinet layout: the native API only hides chrome.
        // The game's explicit exit action remains responsible for close().
        this.nativeOwned = false; this.nativePending = false;
        this.win.clearTimeout(this.nativeTimer);
      }
      this.changed();
    }
    receive(event) {
      if (!this.hostOrigin || event.origin !== this.hostOrigin || event.source !== this.win.parent ||
        event.data?.type !== 'kyokushin:display-state' || typeof event.data.landscapeRequested !== 'boolean') return;
      if (Number.isFinite(event.data.requestId) && event.data.requestId !== this.serial) return;
      this.win.clearTimeout(this.hostTimer); this.hostPending = false;
      this.hostManaged = event.data.managed === true;
      if (!this.requested && event.data.landscapeRequested) this.layoutOnly = true;
      this.requested = event.data.landscapeRequested;
      if (!this.requested) this.exitNative();
      // A host layout acknowledgment must not dismiss fullscreen granted from
      // the original touch gesture inside the game. Native owns rotation then.
      this.changed();
    }
    destroy() {
      this.close();
      this.win.removeEventListener('message', this.message);
      this.doc.removeEventListener('fullscreenchange', this.fullscreen);
      this.doc.removeEventListener('webkitfullscreenchange', this.fullscreen);
    }
  }
  global.DojoDisplay = DojoDisplay;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DojoDisplay };
})(typeof window !== 'undefined' ? window : globalThis);
