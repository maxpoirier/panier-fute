// @ts-check
import { writePref } from '../lib/prefs.js';
import { el } from './dom.js';
import { closeOverlay, showOverlay } from './overlays.js';
import { PREFS, state } from './state.js';

const MAX_NAME_LENGTH = 30;
/** @type {HTMLElement | null} */
let screen = null;

/**
 * Asked on first launch only; the answer stays on this device. Tapping the greeting asks again.
 * @param {() => void} onSaved
 */
export function askUserName(onSaved) {
  if (screen) return;
  const input = /** @type {HTMLInputElement} */ (
    el('input', {
      id: 'welcome-name',
      name: 'name',
      autocomplete: 'given-name',
      maxlength: String(MAX_NAME_LENGTH),
      placeholder: 'Ton prénom',
      required: 'required',
      enterkeyhint: 'done',
    })
  );
  input.value = state.userName;
  screen = el(
    'div',
    {
      id: 'welcome-screen',
      class: 'update-screen welcome-screen',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'welcome-title',
    },
    el(
      'form',
      {
        class: 'update-card',
        onsubmit: (/** @type {SubmitEvent} */ event) => {
          event.preventDefault();
          const name = input.value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
          if (!name) return;
          state.userName = name;
          writePref(PREFS.userName, name);
          if (screen) closeOverlay(screen);
          screen = null;
          onSaved();
        },
      },
      el('img', { class: 'update-icon', src: 'icons/icon-192.png', alt: '' }),
      el('h2', { id: 'welcome-title', text: 'Bienvenue! 👋' }),
      el('label', { for: 'welcome-name', text: 'Comment t’appelles-tu?' }),
      input,
      el('button', { type: 'submit', class: 'btn update-btn', text: 'C’est parti' }),
    ),
  );
  showOverlay(screen);
  input.focus();
}
