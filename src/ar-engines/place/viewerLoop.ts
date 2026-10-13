export interface FrameScheduler {
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}

/**
 * Schedule ordinary viewer frames only while invalidated, animating or damping.
 * XR owns a separate renderer animation loop and must not use this scheduler.
 * @param allowed - Whether the ordinary viewer can currently draw.
 * @param frame - Draw one frame; return true while animation or damping needs another.
 * @param scheduler - Browser RAF by default; injectable clock for lifecycle tests.
 * @returns Invalidation, visibility refresh and permanent disposal controls.
 */
export function createViewerLoop(
  allowed: () => boolean,
  frame: (deltaSeconds: number) => boolean,
  scheduler: FrameScheduler = {
    request: callback => window.requestAnimationFrame(callback),
    cancel: handle => window.cancelAnimationFrame(handle),
  },
) {
  const interval = 1000 / 30;
  let handle: number | undefined;
  let previous: number | undefined;
  let dirty = false;
  let drawing = false;
  let disposed = false;

  function schedule() {
    if (!disposed && !drawing && allowed() && handle === undefined) handle = scheduler.request(tick);
  }
  function tick(time: number) {
    handle = undefined;
    if (disposed || !allowed()) { previous = undefined; return; }
    if (previous !== undefined && time - previous < interval) { schedule(); return; }
    const delta = previous === undefined ? 0 : Math.min((time - previous) / 1000, 0.1);
    previous = time;
    dirty = false;
    drawing = true;
    let continuing: boolean;
    try { continuing = frame(delta); } finally { drawing = false; }
    if (continuing || dirty) schedule();
    else previous = undefined;
  }
  function invalidate() { dirty = true; schedule(); }
  function refresh() {
    if (handle !== undefined) scheduler.cancel(handle);
    handle = undefined;
    previous = undefined;
    invalidate();
  }
  function dispose() {
    disposed = true;
    if (handle !== undefined) scheduler.cancel(handle);
    handle = undefined;
  }
  return { invalidate, refresh, dispose };
}
