import { describe, expect, it, vi } from 'vitest';
import { createViewerLoop, type FrameScheduler } from './viewerLoop';

function clock() {
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scheduler: FrameScheduler = {
    request: callback => { callbacks.set(++id, callback); return id; },
    cancel: handle => { callbacks.delete(handle); },
  };
  return { scheduler, callbacks, tick(time: number) {
    const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time));
  } };
}

describe('ordinary viewer demand loop', () => {
  it('coalesces changes and schedules no idle callbacks after a static frame', () => {
    const c = clock(); const frame = vi.fn(() => false);
    const loop = createViewerLoop(() => true, frame, c.scheduler);
    loop.invalidate(); loop.invalidate(); expect(c.callbacks.size).toBe(1);
    c.tick(0); expect(frame).toHaveBeenCalledOnce(); expect(c.callbacks.size).toBe(0);
    loop.invalidate(); c.tick(1000); expect(frame).toHaveBeenLastCalledWith(0);
  });
  it('continues animation or damping at the viewer cadence and stops once settled', () => {
    const c = clock(); let moving = true; const frame = vi.fn(() => moving);
    const loop = createViewerLoop(() => true, frame, c.scheduler);
    loop.invalidate(); c.tick(0); c.tick(16); expect(frame).toHaveBeenCalledTimes(1);
    c.tick(34); expect(frame).toHaveBeenCalledTimes(2);
    moving = false; c.tick(68); expect(c.callbacks.size).toBe(0);
  });
  it('cancels for a hidden tab, modal, page suspension or XR ownership and resets time on resume', () => {
    const c = clock(); let allowed = true; const frame = vi.fn(() => true);
    const loop = createViewerLoop(() => allowed, frame, c.scheduler);
    loop.invalidate(); c.tick(0); allowed = false; loop.refresh();
    loop.invalidate(); expect(c.callbacks.size).toBe(0);
    allowed = true; loop.refresh(); c.tick(10_000); expect(frame).toHaveBeenLastCalledWith(0);
  });
  it('does not lose changes made from a controls change event during the frame', () => {
    const c = clock(); let changed = false;
    const loop = createViewerLoop(() => true, () => { if (!changed) { changed = true; loop.invalidate(); } return false; }, c.scheduler);
    loop.invalidate(); c.tick(0); expect(c.callbacks.size).toBe(1);
    c.tick(34); expect(c.callbacks.size).toBe(0);
  });
  it('permanently cancels pending frames after disposal', () => {
    const c = clock(); const frame = vi.fn(() => true);
    const loop = createViewerLoop(() => true, frame, c.scheduler);
    loop.invalidate(); loop.dispose(); loop.refresh(); loop.invalidate(); c.tick(100);
    expect(frame).not.toHaveBeenCalled(); expect(c.callbacks.size).toBe(0);
  });
  it('preserves elapsed time for damping below 10fps; only the animation consumer clamps time', () => {
    const c = clock(); const frame = vi.fn(() => true);
    const loop = createViewerLoop(() => true, frame, c.scheduler);
    loop.invalidate(); c.tick(0); c.tick(750);
    expect(frame).toHaveBeenLastCalledWith(0.75);
  });
});
