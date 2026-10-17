import { html } from "./html.js";

// Day is a date of the monday-to-sunday reference: picked is the shown day
// (gold), today an outline when another day is shown.
export function Day({ letter, number, state = "default", onClick }) {
  const box = state === "picked" ? "border-ink bg-gold" : state === "today" ? "border-ink" : "border-transparent";
  return html`<button
    type="button"
    class="flex w-[42px] flex-col items-center gap-1 rounded-sm border-2 py-2 ${box}"
    aria-current=${state === "picked" ? "date" : null}
    onClick=${onClick}
  >
    <span class="type-mono-small ${state === "default" ? "opacity-60" : ""}">${letter}</span>
    <span class="type-mono">${number}</span>
  </button>`;
}
