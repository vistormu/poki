import { html } from "./html.js";
import { Icon } from "./icon.js";

// Mark is an ingredient's mark (decisions/0009): + → gold with a check (buy),
// ? → orchid (to check); tapping the lit one again goes back to none (we have
// it). onChange gets "buy", "check" or "none".
export function Mark({ value = "none", onChange }) {
  const flip = (v) => () => onChange?.(value === v ? "none" : v);
  const round = "flex size-[34px] items-center justify-center rounded-full border-2 border-ink";
  return html`<div class="flex shrink-0 items-center gap-2">
    <button type="button" class="${round} ${value === "buy" ? "bg-gold" : ""}" aria-label="Buy" aria-pressed=${value === "buy"} onClick=${flip("buy")}>
      <${Icon} name=${value === "buy" ? "check" : "plus"} />
    </button>
    <button type="button" class="${round} ${value === "check" ? "bg-orchid" : ""}" aria-label="Check" aria-pressed=${value === "check"} onClick=${flip("check")}>
      <span class="type-label text-[18px] ${value === "check" ? "" : "opacity-60"}">?</span>
    </button>
  </div>`;
}
