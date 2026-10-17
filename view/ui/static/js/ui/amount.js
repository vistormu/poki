import { html } from "./html.js";

// Amount is an amount in mono, on its band's colour at 40% (tone-*).
export function Amount({ value, tone = "sky" }) {
  return html`<span class="tone-${tone} shrink-0 rounded-sm bg-(--tone)/40 px-2 py-[2px] type-mono whitespace-nowrap">${value}</span>`;
}
