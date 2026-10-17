import { html } from "./html.js";
import { Icon } from "./icon.js";

// Tick is a list item's round: empty to buy, checked bought. the whole row
// ticks, so it is not a button itself.
export function Tick({ on }) {
  return html`<span class="flex size-[34px] shrink-0 items-center justify-center rounded-full border-2 border-ink" aria-hidden="true">
    ${on && html`<${Icon} name="check" />`}
  </span>`;
}
