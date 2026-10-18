import { html } from "./html.js";
import { Latch } from "./latch.js";

// Mark is an ingredient's mark (decisions/0009), two latches: gold + (on: a
// check, buy), orchid ? (to check); tapping the lit one again lets it up
// (none: we have it). onChange gets "buy", "check" or "none".
export function Mark({ value = "none", onChange }) {
  const flip = (v) => () => onChange?.(value === v ? "none" : v);
  return html`<div class="flex shrink-0 items-center gap-2">
    <${Latch} tone="gold" on=${value === "buy"} icon=${value === "buy" ? "check" : "plus"} label="Buy" onClick=${flip("buy")} />
    <${Latch} tone="orchid" on=${value === "check"} text="?" label="Check" onClick=${flip("check")} />
  </div>`;
}
