import { html } from "./html.js";

const colors = ["bg-sky", "bg-periwinkle", "bg-orchid", "bg-pink", "bg-gold"];

// Stripes are the five album colours, in palette order; they fill their width.
export function Stripes({ class: cls = "" }) {
  return html`<div class="flex flex-col gap-[2px] ${cls}" aria-hidden="true">
    ${colors.map((c) => html`<div class="h-[3px] w-full rounded-[2px] ${c}"></div>`)}
  </div>`;
}
