import { html } from "./html.js";
import { Tab } from "./tab.js";

// TabBar is the floating dusk pill (phone): Plan · List · Meals.
export function TabBar({ tabs, active, onPick }) {
  return html`<nav class="flex h-[52px] items-center gap-1 rounded-full bg-dusk-gradient p-2 shadow-soft">
    ${tabs.map((t) => html`<${Tab} label=${t} on=${t === active} onClick=${() => onPick(t)} />`)}
  </nav>`;
}
