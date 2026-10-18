import { html } from "./html.js";

// Tab is a tab of the bar, a glass well; on: lit gold from behind.
export function Tab({ label, on, onClick }) {
  return html`<button
    type="button"
    class="glass flex h-9 flex-1 items-center justify-center rounded-[11px] px-4 type-label ${on ? "glass-lit" : ""}"
    aria-current=${on ? "page" : null}
    onClick=${onClick}
  >
    <span class=${on ? "" : "opacity-60"}>${label}</span>
  </button>`;
}
