import { html } from "./html.js";
import { Icon } from "./icon.js";

// Block is every text on a coloured pill: [leading] [text] [trailing], 40
// tall, full radius. strong (gradient, outline, grain, on its side) for
// headers; soft, tinted glass set into the screen (a touch surface, its icons
// printed on it), for states and actions inside a slot. leading and trailing
// are icon names or nodes; with onClick it is a button.
export function Block({ tone = "sky", fill = "strong", text, leading, trailing, onClick }) {
  const part = (p) => (typeof p === "string" ? html`<${Icon} name=${p} />` : p);
  const inner = html`${part(leading)}<span class="min-w-0 flex-1 truncate text-left type-heading">${text}</span>${part(trailing)}`;
  const tag = (cls, body) =>
    onClick ? html`<button type="button" class=${cls} onClick=${onClick}>${body}</button>` : html`<div class=${cls}>${body}</div>`;
  if (fill === "soft") return tag(`tone-${tone} glass glass-tone flex h-10 w-full items-center gap-2 rounded-full px-4`, inner);
  return tag(
    `tone-${tone} relative block h-10 w-full rounded-full`,
    html`<span class="side"></span>
      <span class="grain relative flex h-10 w-full items-center gap-2 rounded-full border-2 border-ink bg-tone-gradient px-4">${inner}</span>`,
  );
}
