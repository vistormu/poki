import { html } from "./html.js";
import { Icon } from "./icon.js";

// Action is what can be done to the open thing (move, edit, remove): frosted
// glass, tapped whole, its icon and label printed on it. pink: remove.
export function Action({ icon, label, tone, onClick }) {
  const tint = tone ? `tone-${tone} glass-tone` : "";
  return html`<button type="button" class="${tint} glass frosted grain flex h-10 min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[20px] px-2" onClick=${onClick}>
    <${Icon} name=${icon} /><span class="truncate type-heading">${label}</span>
  </button>`;
}
