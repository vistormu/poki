import { html } from "./html.js";

// the lamps, and the sync status (data/sync.js) that lights each
const lamps = [
  ["SYNC", "synced", "bg-sky shadow-[0_0_6px_1px_var(--color-sky)]"],
  ["REC", "waiting", "bg-gold shadow-[0_0_6px_1px_var(--color-gold)]"],
  ["OFF", "off", "bg-pink shadow-[0_0_6px_1px_var(--color-pink)]"],
];

// SyncLight is three status lamps, the state's one lit. never a popup.
export function SyncLight({ status }) {
  return html`<div class="flex shrink-0 items-center gap-2" role="status" aria-label=${"sync: " + status}>
    ${lamps.map(
      ([word, lit, on]) => html`<div class="flex flex-col items-center gap-1">
        <div class="size-2 rounded-full ${status === lit ? on : "bg-ink opacity-15"}"></div>
        <span class="type-mono-small ${status === lit ? "" : "opacity-40"}">${word}</span>
      </div>`,
    )}
  </div>`;
}
