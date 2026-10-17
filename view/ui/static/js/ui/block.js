import { html } from "./html.js";
import { Icon } from "./icon.js";

// Block is every text on a coloured pill: [leading] [text] [trailing], 40
// tall, full radius. strong (gradient, outline, grain) for headers; soft (40%
// tint) for states and actions inside a slot. leading and trailing are icon
// names or nodes; with onClick it is a button.
export function Block({ tone = "sky", fill = "strong", text, leading, trailing, onClick }) {
  const look = fill === "strong" ? "grain border-2 border-ink bg-tone-gradient" : "bg-(--tone)/40";
  const part = (p) => (typeof p === "string" ? html`<${Icon} name=${p} />` : p);
  const inner = html`${part(leading)}<span class="min-w-0 flex-1 truncate text-left type-heading">${text}</span>${part(trailing)}`;
  const cls = `tone-${tone} ${look} flex h-10 w-full items-center gap-2 rounded-full px-4`;
  return onClick
    ? html`<button type="button" class=${cls} onClick=${onClick}>${inner}</button>`
    : html`<div class=${cls}>${inner}</div>`;
}
