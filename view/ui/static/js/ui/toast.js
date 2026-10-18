import { html } from "./html.js";
import { Icon } from "./icon.js";

// Toast floats over the screen: frosted glass, the one glass lifted. message
// (sky): one action, gone after a few seconds; error (pink): a ×, stays until
// tapped. never blocks.
export function Toast({ kind = "message", text, action, onAction, onClose }) {
  const tone = kind === "error" ? "tone-pink" : "tone-sky";
  return html`<div class="${tone} glass glass-tone frosted grain flex h-10 w-full items-center gap-2 rounded-[20px] px-4" style="--glass-out: 0 1px 0 rgb(255 255 255 / 0.9), var(--shadow-soft)" role=${kind === "error" ? "alert" : "status"}>
    <span class="min-w-0 flex-1 truncate type-heading">${text}</span>
    ${kind === "message" && action && html`<button type="button" class="shrink-0 type-label" onClick=${onAction}>${action}</button>`}
    ${kind === "error" && html`<button type="button" class="shrink-0" aria-label="Dismiss" onClick=${onClose}><${Icon} name="close" /></button>`}
  </div>`;
}
