import { html } from "./html.js";
import { Key } from "./key.js";

// SubHeader is the top of a full-screen page inside a tab: back, title,
// subtitle, actions ([{icon, label, onClick}]), as keys. (d2 removes it.)
export function SubHeader({ title, subtitle, onBack, actions = [] }) {
  return html`<div class="flex h-16 w-full items-center gap-4 px-4 py-2">
    <${Key} icon="back" label="Back" onClick=${onBack} />
    <div class="flex min-w-0 flex-col">
      <h2 class="truncate type-heading">${title}</h2>
      ${subtitle && html`<p class="truncate type-mono-small opacity-60">${subtitle}</p>`}
    </div>
    <div class="flex-1"></div>
    ${actions.length > 0 && html`<div class="flex gap-2">${actions.map((a) => html`<${Key} ...${a} />`)}</div>`}
  </div>`;
}
