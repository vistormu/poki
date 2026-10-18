import { useState, useEffect } from "preact/hooks";

import { html } from "./html.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { Stripes } from "./stripes.js";
import { SyncLight } from "./sync-light.js";
import { Day } from "./day.js";

// the keys each kind of deck has: the tab's global actions (decisions: no
// floating button)
const keys = {
  List: [
    ["plus", "Add", "onAdd"],
    ["eject", "Clear the list", "onClear"],
  ],
  Plan: [
    ["rewind", "Seven days back", "onBack"],
    ["forward", "Seven days forward", "onForward"],
  ],
  Meals: [["search", "Search", "onSearch"]],
};

// Deck is the header of every tab: the window (title, subtitle, reels), the
// sync light and the stripes, the tab's keys, and on the plan the dates.
// sync is the syncer's state; the reels turn while changes wait (REC) or the
// server can't be reached (OFF).
export function Deck({ kind, title, subtitle, sync = { status: "synced" }, days, ...on }) {
  const [spin, stop] = useSpin(sync.status !== "synced");
  return html`<header class="flex flex-col gap-2 rounded-lg border-2 border-ink bg-paper p-2 shadow-soft">
    <div class="grain flex items-center gap-2 rounded-lg bg-dusk-gradient px-4 pt-[10px] pb-3">
      <div class="flex min-w-0 flex-col">
        <h1 class="type-display glow whitespace-nowrap text-gold">${title}</h1>
        ${subtitle && html`<p class="type-mono-small text-paper opacity-60">${subtitle}</p>`}
      </div>
      <div class="flex-1"></div>
      <div class="relative flex shrink-0 items-center gap-1 rounded-full px-[6px] py-1" aria-hidden="true" onAnimationIteration=${stop}>
        <div class="absolute inset-0 rounded-full bg-paper opacity-12"></div>
        <${Icon} name="reel" class="relative ${spin ? "spin-reel" : ""}" />
        <div class="relative h-[3px] w-5 bg-paper opacity-60"></div>
        <${Icon} name="reel" class="relative ${spin ? "spin-reel" : ""}" />
      </div>
    </div>
    <div class="flex items-center gap-2 pr-2 pl-4">
      <${SyncLight} status=${sync.status} />
      <${Stripes} class="min-w-0 flex-1" />
      ${keys[kind].map(([icon, label, handler]) => html`<${IconButton} icon=${icon} label=${label} onClick=${on[handler]} />`)}
    </div>
    ${kind === "Plan" &&
    days &&
    html`<div class="flex items-center justify-between px-2 pt-2">${days.map((d) => html`<${Day} ...${d} />`)}</div>`}
  </header>`;
}

// useSpin turns the reels while on, and stops them only at the end of a
// turn: a spin lasts at least one whole turn and never snaps back.
function useSpin(on) {
  const [spin, setSpin] = useState(on);
  useEffect(() => {
    if (on) setSpin(true);
  }, [on]);
  return [spin, () => !on && setSpin(false)];
}
