/**
 * A small native-dialog guide shared by the AR page and the static Unity wrapper.
 * No permissions are requested here; the page owns its start action.
 * @param {HTMLDialogElement} dialog
 * @param {{storageKey: string, onComplete?: () => void}} options
 */
export function mountOnboarding(dialog, options) {
  const listeners = new AbortController();
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: listeners.signal });
  const steps = Array.from(dialog.querySelectorAll('[data-guide-step]'));
  const next = dialog.querySelector('[data-guide-next]');
  const previous = dialog.querySelector('[data-guide-back]');
  const done = dialog.querySelector('[data-guide-done]');
  const counter = dialog.querySelector('[data-guide-count]');
  let index = 0;
  let opener = null;
  function render() {
    steps.forEach((step, i) => { step.hidden = i !== index; });
    previous.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    done.hidden = index !== steps.length - 1;
    counter.textContent = `${index + 1} / ${steps.length}`;
  }
  function hasSeen() {
    try { return localStorage.getItem(options.storageKey) === '1'; } catch { return false; }
  }
  function open() {
    if (dialog.open) return;
    opener = document.activeElement;
    index = 0;
    render();
    dialog.showModal();
  }
  function finish() {
    try { localStorage.setItem(options.storageKey, '1'); } catch {}
    dialog.close();
    if (opener instanceof HTMLElement) opener.focus();
    options.onComplete?.();
  }
  listen(next, 'click', () => { index++; render(); (index === steps.length - 1 ? done : next).focus(); });
  listen(previous, 'click', () => { index--; render(); next.focus(); });
  listen(done, 'click', finish);
  listen(dialog, 'cancel', event => { event.preventDefault(); finish(); });
  render();
  return { open, hasSeen, dispose: () => listeners.abort() };
}
