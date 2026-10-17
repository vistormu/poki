import { html } from "./html.js";
import { Icon } from "./icon.js";

// Toast floats over the screen: a strong Block with a shadow. message (sky):
// one action in gold, gone after a few seconds; error (pink): a ×, stays until
// tapped. never blocks.
export function Toast({ kind = "message", text, action, onAction, onClose }) {
  const tone = kind === "error" ? "tone-pink" : "tone-sky";
  return html`<div class="${tone} grain flex h-10 w-full items-center gap-2 rounded-full border-2 border-ink bg-tone-gradient px-4 shadow-soft" role=${kind === "error" ? "alert" : "status"}>
    <span class="min-w-0 flex-1 truncate type-heading">${text}</span>
    ${kind === "message" && action && html`<button type="button" class="shrink-0 type-label text-gold" onClick=${onAction}>${action}</button>`}
    ${kind === "error" && html`<button type="button" class="shrink-0" aria-label="Dismiss" onClick=${onClose}><${Icon} name="close" /></button>`}
  </div>`;
}
