import { html } from "./html.js";
import { Icon } from "./icon.js";

// the tones a latch lights in: buy, check, bought
const lit = {
  gold: "--color-gold",
  orchid: "--color-orchid",
  sky: "--color-sky",
};

// Latch is a round key that holds a state: up when off, down and lit in its
// tone when on (gold buy, orchid ?, sky bought). 36, as every key. icon is an
// icon name, or text ("?"). as a span (no onClick), its row is the button.
export function Latch({ on, tone, icon, text, label, onClick }) {
  const c = `var(${lit[tone]})`;
  const face = on
    ? `background-image: radial-gradient(closest-side, color-mix(in srgb, ${c}, white 75%), ${c} 60%, ${c}); box-shadow: inset 0 2px 3px rgb(43 39 71 / 0.18), 0 0 8px color-mix(in srgb, ${c} 60%, transparent);`
    : "";
  const inner = html`<span class="cap-base"></span>
    <span class="cap-face pointer-events-none" style=${face}>
      ${icon && html`<${Icon} name=${icon} />`}${text && html`<span class="type-label text-[18px]">${text}</span>`}
    </span>`;
  const cls = `relative block size-9 shrink-0 rounded-full [--cap-face-r:50%] ${on ? "cap-down" : ""}`;
  return onClick
    ? html`<button type="button" class="${cls} touch-manipulation" aria-label=${label} aria-pressed=${!!on} onClick=${onClick}>${inner}</button>`
    : html`<span class=${cls} aria-hidden="true">${inner}</span>`;
}
