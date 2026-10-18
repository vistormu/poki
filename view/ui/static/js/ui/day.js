import { html } from "./html.js";

// Day is a date of the monday-to-sunday reference, a glass well: picked is the
// shown day (lit gold from behind), today a full ink rim when another day is
// shown.
export function Day({ letter, number, state = "default", onClick }) {
  const look = state === "picked" ? "glass-lit" : state === "today" ? "[--glass-rim:var(--color-ink)] [--glass-w:1.5px]" : "";
  return html`<button
    type="button"
    class="glass flex w-[42px] flex-col items-center gap-1 rounded-sm py-2 ${look}"
    aria-current=${state === "picked" ? "date" : null}
    onClick=${onClick}
  >
    <span class="type-mono-small ${state === "default" ? "opacity-60" : ""}">${letter}</span>
    <span class="type-mono">${number}</span>
  </button>`;
}
