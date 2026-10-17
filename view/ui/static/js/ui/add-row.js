import { html } from "./html.js";
import { Icon } from "./icon.js";

// AddRow is a bare + at 40%, centred, at the end of a slot.
export function AddRow({ label = "Add", onClick }) {
  return html`<button type="button" class="flex h-11 w-full items-center justify-center rounded-lg pr-2 pl-4" aria-label=${label} onClick=${onClick}>
    <${Icon} name="plus" class="opacity-40" />
  </button>`;
}
