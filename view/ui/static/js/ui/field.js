import { html } from "./html.js";
import { Icon } from "./icon.js";

// Field is every text input: search (with its icon), a name, an amount (with
// its unit); clear glass set into the screen, as the days. no placeholder
// text. the rest of the props go to the <input>.
export function Field({ icon, unit, value, onInput, ...input }) {
  return html`<label class="glass flex h-11 w-full items-center gap-2 rounded-full px-4">
    ${icon && html`<${Icon} name=${icon} />`}
    <input
      class="min-w-0 flex-1 bg-transparent type-body outline-none"
      value=${value}
      onInput=${(e) => onInput?.(e.currentTarget.value)}
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      ...${input}
    />
    ${unit && html`<span class="shrink-0 type-body opacity-60">${unit}</span>`}
  </label>`;
}
