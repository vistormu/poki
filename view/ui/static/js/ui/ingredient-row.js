import { html } from "./html.js";
import { Mark } from "./mark.js";

// IngredientRow is a meal's ingredient: name, its amount (and, on the list,
// its meal) below, and its Mark.
export function IngredientRow({ name, detail, mark, onMark, divider = true }) {
  return html`<div class="relative flex h-14 w-full items-center gap-2 px-4">
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate type-body">${name}</span>
      ${detail && html`<span class="truncate type-mono-small opacity-60">${detail}</span>`}
    </div>
    <${Mark} value=${mark} onChange=${onMark} />
    ${divider && html`<span class="divider"></span>`}
  </div>`;
}
