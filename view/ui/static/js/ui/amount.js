import { html } from "./html.js";

// Amount is an amount in mono, on clear glass tinted in its band's colour
// (tone-*).
export function Amount({ value, tone = "sky" }) {
  return html`<span class="tone-${tone} glass glass-tone shrink-0 rounded-sm px-2 py-[2px] type-mono whitespace-nowrap">${value}</span>`;
}
