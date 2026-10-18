import { html } from "./html.js";
import { Icon } from "./icon.js";

// AddRow is a round frosted glass with a printed +, centred, at the end of a
// slot: quiet, as repeated elements stay.
export function AddRow({ label = "Add", onClick }) {
  return html`<div class="flex h-11 w-full items-center justify-center">
    <button type="button" class="glass frosted grain flex size-9 items-center justify-center rounded-full" aria-label=${label} onClick=${onClick}>
      <${Icon} name="plus" />
    </button>
  </div>`;
}
