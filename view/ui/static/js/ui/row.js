import { html } from "./html.js";
import { Amount } from "./amount.js";
import { Key, KeyCap } from "./key.js";
import { Tick } from "./tick.js";

// Row is a meal or an item: name (wraps), then an optional amount, a
// trailing key and a tick. no divider. selected: the open meal, on frosted
// gold glass. with onClick the whole row is a button (a tick, an opening);
// with onTrailing too, the trailing key is a button of its own (an item's ↕),
// over the row's; trailingProps go on it (the drag's pointer handlers).
export function Row({ name, amount, tone, trailing, trailingLabel, onTrailing, trailingProps = {}, tick, selected = false, onClick }) {
  const pressed = tick === undefined ? null : !!tick;
  const quiet = onTrailing ? "pointer-events-none" : "";
  const inner = html`
    ${selected && html`<span class="glass frosted grain absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-[20px] [--glass:linear-gradient(to_bottom,color-mix(in_srgb,var(--color-gold),white_20%),color-mix(in_srgb,var(--color-gold),white_45%))]"></span>`}
    <span class="relative min-w-0 flex-1 text-left type-body break-words ${quiet}">${name}</span>
    ${amount && html`<span class="relative ${quiet}"><${Amount} value=${amount} tone=${tone} /></span>`}
    ${trailing &&
    (onTrailing
      ? html`<${Key} icon=${trailing} label=${trailingLabel} onClick=${onTrailing} class="touch-none" ...${trailingProps} />`
      : html`<${KeyCap} icon=${trailing} />`)}
    ${tick !== undefined && html`<span class="relative ${quiet}"><${Tick} on=${tick} /></span>`}
  `;
  const cls = "relative flex min-h-[54px] w-full items-center gap-2 px-4 py-2";
  if (onClick && onTrailing) {
    return html`<div class=${cls}>
      <button type="button" class="absolute inset-0" aria-label=${name} aria-pressed=${pressed} onClick=${onClick}></button>
      ${inner}
    </div>`;
  }
  return onClick
    ? html`<button type="button" class=${cls} aria-pressed=${pressed} onClick=${onClick}>${inner}</button>`
    : html`<div class=${cls}>${inner}</div>`;
}
