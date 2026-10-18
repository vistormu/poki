import { html } from "./html.js";
import { Icon } from "./icon.js";

// Key is a square key: it acts and springs back (the deck's keys, back, a
// row's trailing). 36: a face inset in its base, the base its side; pressed,
// the face sinks flush. its alignment is its base.
export function Key({ icon, label, onClick, class: cls = "touch-manipulation", ...rest }) {
  return html`<button type="button" class="relative size-9 shrink-0 rounded-sm active:cap-down ${cls}" aria-label=${label} onClick=${onClick} ...${rest}>
    <span class="cap-base"></span>
    <span class="cap-face pointer-events-none"><${Icon} name=${icon} /></span>
  </button>`;
}

// KeyCap is a key's look without its button, for a key inside another
// button (a row's trailing, when the row is what is tapped).
export function KeyCap({ icon }) {
  return html`<span class="relative block size-9 shrink-0 rounded-sm" aria-hidden="true">
    <span class="cap-base"></span>
    <span class="cap-face"><${Icon} name=${icon} /></span>
  </span>`;
}
