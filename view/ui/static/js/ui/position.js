import { html } from "./html.js";

// Position is a group's place on the path: "01", white on dark glass (the
// display's), with its reflection.
export function Position({ n }) {
  return html`<span class="glass-dark shrink-0 rounded-full bg-[linear-gradient(to_bottom_right,transparent_36%,rgb(255_255_255/0.21)_42%,rgb(255_255_255/0.07)_56%,transparent_62%)] px-2 py-[2px] type-mono-small text-paper">${String(n).padStart(2, "0")}</span>`;
}
