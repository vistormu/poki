import { html } from "./html.js";

// Tab is a tab in the pill or the rail. on: gold, with a dot.
export function Tab({ label, on, wide = false, onClick }) {
  return html`<button
    type="button"
    class="flex items-center gap-1 rounded-full px-4 py-2 type-label ${on ? "bg-gold text-ink" : "text-paper"} ${wide ? "w-full" : "flex-1 justify-center"}"
    aria-current=${on ? "page" : null}
    onClick=${onClick}
  >
    ${on && html`<span class="size-[6px] rounded-full bg-ink"></span>`}${label}
  </button>`;
}
