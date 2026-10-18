import { html } from "./html.js";
import { Latch } from "./latch.js";

// Tick is a list item's sky latch: up to buy, latched and lit (a check)
// bought. the whole row ticks, so it is not a button itself.
export function Tick({ on }) {
  return html`<${Latch} tone="sky" on=${on} icon=${on ? "check" : null} />`;
}
