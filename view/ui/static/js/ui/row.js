import { html } from "./html.js";
import { Icon } from "./icon.js";
import { Amount } from "./amount.js";
import { Tick } from "./tick.js";

// Row is a meal or an item: name (wraps), then an optional amount, a trailing
// icon and a tick. selected (gold at 40%, no divider): the meal open in the
// desktop sidebar. with onClick the whole row is a button (a tick, an opening).
export function Row({ name, amount, tone, trailing, tick, selected = false, divider = true, onClick }) {
  const inner = html`
    ${selected && html`<span class="absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-full bg-gold opacity-40"></span>`}
    <span class="relative min-w-0 flex-1 text-left type-body break-words">${name}</span>
    ${amount && html`<span class="relative"><${Amount} value=${amount} tone=${tone} /></span>`}
    ${trailing && html`<${Icon} name=${trailing} class="relative" />`}
    ${tick !== undefined && html`<${Tick} on=${tick} />`}
    ${divider && !selected && html`<span class="divider"></span>`}
  `;
  const cls = "relative flex min-h-[54px] w-full items-center gap-2 px-4 py-2";
  return onClick
    ? html`<button type="button" class=${cls} aria-pressed=${tick === undefined ? null : !!tick} onClick=${onClick}>${inner}</button>`
    : html`<div class=${cls}>${inner}</div>`;
}
