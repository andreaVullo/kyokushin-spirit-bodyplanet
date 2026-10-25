/* Keep browser selection/drag menus out of the arena without swallowing input. */
(function (global) {
  'use strict';
  function protectGameSurface(surface) {
    if (!surface?.addEventListener) return () => {};
    function editable(target) {
      const element = target?.nodeType === 3 ? target.parentElement : target;
      const field = element?.closest?.('input,textarea,[contenteditable]');
      return !!field && surface.contains(field) && !field.disabled && !field.readOnly &&
        (field.matches('input,textarea') || field.isContentEditable);
    }
    function suppress(event) {
      if (!editable(event.target)) event.preventDefault();
    }
    const events = ['selectstart', 'dragstart', 'contextmenu'];
    for (const type of events) surface.addEventListener(type, suppress, { capture: true, passive: false });
    return () => { for (const type of events) surface.removeEventListener(type, suppress, true); };
  }
  protectGameSurface(global.document?.getElementById('game-shell'));
  if (typeof module !== 'undefined') module.exports = { protectGameSurface };
})(typeof window !== 'undefined' ? window : globalThis);
