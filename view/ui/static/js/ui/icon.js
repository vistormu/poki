import { html } from "./html.js";

// Icon is one of figma's icons (icons/ui/*.svg, exported from the Components
// page): 20 × 20, ink; the reel is 34 and white.
export function Icon({ name, size = name === "reel" ? 34 : 20, class: cls = "" }) {
  return html`<img src="/icons/ui/${name}.svg" alt="" width=${size} height=${size} class="block shrink-0 ${cls}" draggable=${false} />`;
}
