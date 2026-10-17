import { html } from "./html.js";
import { Tab } from "./tab.js";

// TabRail is the tabs stacked in a dusk rail (desktop), under the deck.
export function TabRail({ tabs, active, onPick }) {
  return html`<nav class="flex flex-col gap-1 rounded-lg bg-dusk-gradient p-2 shadow-soft">
    ${tabs.map((t) => html`<${Tab} label=${t} on=${t === active} wide onClick=${() => onPick(t)} />`)}
  </nav>`;
}
