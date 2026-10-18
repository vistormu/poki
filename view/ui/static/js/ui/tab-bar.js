import { html } from "./html.js";
import { Tab } from "./tab.js";

// a screw at each end of the panel, as on a player's front plate
const screw = html`<span class="relative size-[6px] shrink-0 rounded-full bg-linear-to-b from-[#b9b3d9] to-periwinkle shadow-[inset_0_1px_1px_rgb(43_39_71/0.5)]" aria-hidden="true">
  <span class="absolute top-[2.5px] left-px h-px w-1 bg-ink/60"></span>
</span>`;

// TabBar is Plan · List · Meals: a flush dusk panel of the player (no side, a
// bevel), its tabs glass wells. the same bar on the phone and in the desktop
// sidebar.
export function TabBar({ tabs, active, onPick }) {
  return html`<nav class="flex h-[52px] items-center gap-[6px] rounded-[22px] border-2 border-ink bg-linear-to-b from-[#5c53a0] to-[#463d7e] px-2 shadow-[inset_0_2px_0_rgb(255_255_255/0.28),inset_0_-2px_2px_rgb(0_0_0/0.3)]">
    ${screw}
    <div class="flex flex-1 items-center gap-[6px] px-1">${tabs.map((t) => html`<${Tab} label=${t} on=${t === active} onClick=${() => onPick(t)} />`)}</div>
    ${screw}
  </nav>`;
}
