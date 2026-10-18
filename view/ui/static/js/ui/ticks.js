import { html } from "./html.js";

// Ticks are the strong Block's trailing marks: four bars fading out.
export function Ticks() {
  return html`<span class="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
    ${["", "opacity-60", "opacity-40", "opacity-15"].map((o) => html`<span class="h-3 w-[3px] rounded-[1.5px] bg-ink ${o}"></span>`)}
  </span>`;
}
