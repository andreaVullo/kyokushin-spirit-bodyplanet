/* One logical landscape cabinet, whether the browser or CSS supplies the turn. */
(function (global) {
  'use strict';

  const ROUNDING_TOLERANCE = 2;
  const positive = value => Number.isFinite(value) && value > 0;
  const clampOffset = (value, maximum) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;

  function resolve(input = {}) {
    input = input || {};
    // Device orientation/angle and a lock promise do not establish the size of
    // an embedded viewport. Its actual dimensions are the source of truth.
    const layoutWidth = positive(input.width) ? input.width : 1;
    const layoutHeight = positive(input.height) ? input.height : 1;
    let width = layoutWidth, height = layoutHeight, left = 0, top = 0;

    // visualViewport may lag the window resize during rotation/fullscreen.
    // Containment rejects an old, swapped viewport while still accepting the
    // smaller visible area left by browser chrome, zoom or the keyboard. Its
    // aspect ratio can legitimately differ from that of the layout viewport.
    const visualFits = positive(input.visualWidth) && positive(input.visualHeight)
      && input.visualWidth <= layoutWidth + ROUNDING_TOLERANCE
      && input.visualHeight <= layoutHeight + ROUNDING_TOLERANCE;
    if (visualFits) {
      width = Math.min(layoutWidth, input.visualWidth);
      height = Math.min(layoutHeight, input.visualHeight);
      left = clampOffset(input.offsetLeft, layoutWidth - width);
      top = clampOffset(input.offsetTop, layoutHeight - height);
    }
    const portrait = height > width;

    // A cooperating host owns the whole iframe; rotating again inside it would
    // reverse its work. Without that host the same live cabinet turns locally,
    // independent of an OS rotation lock or unsupported fullscreen/lock API.
    const virtual = !!input.landscapeRequested && portrait && input.hostManaged !== true;
    return {
      width, height, left, top, virtual,
      logicalWidth: virtual ? height : width,
      logicalHeight: virtual ? width : height,
      blocked: !!input.touchEnabled && portrait && !virtual
    };
  }

  // Inverse of the cabinet's clockwise CSS rotate(90deg). Pointer hit testing
  // stays in viewport coordinates; only joystick directions use this vector.
  function localVector(x, y, rotated = false) {
    return rotated ? { x: y, y: -x } : { x, y };
  }

  const DojoOrientation = Object.freeze({ resolve, localVector });
  global.DojoOrientation = DojoOrientation;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DojoOrientation };
})(typeof window !== 'undefined' ? window : globalThis);
