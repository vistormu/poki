import { html } from "./html.js";
import { Icon } from "./icon.js";

// IconButton is a round action: back, move, edit, the deck's keys.
export function IconButton({ icon, label, onClick }) {
  return html`<button
    type="button"
    class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper"
    aria-label=${label}
    onClick=${onClick}
  >
    <${Icon} name=${icon} />
  </button>`;
}
