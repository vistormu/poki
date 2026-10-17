import { html } from "./html.js";

// Position is a group's place on the path: "01", white on ink.
export function Position({ n }) {
  return html`<span class="shrink-0 rounded-full bg-ink px-2 py-[2px] type-mono-small text-paper">${String(n).padStart(2, "0")}</span>`;
}
