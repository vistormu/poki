import { useState, useEffect } from "preact/hooks";

import { html } from "./html.js";
import { Icon } from "./icon.js";
import { Key } from "./key.js";
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

// Deck is the header of every tab, a cassette player seen slightly from
// above: a cream body on its side; the window (the title, the cassette in its
// bay); the sync lamps, the stripes lit in a dark display, the tab's keys; on
// the plan the dates, as glass. sync is the syncer's state; the reels turn
// while changes wait (REC) or the server can't be reached (OFF).
export function Deck({ kind, title, sync = { status: "synced" }, days, ...on }) {
  const [spin, stop] = useSpin(sync.status !== "synced");
  return html`<header class="relative rounded-lg [--side:4px]">
    <span class="side"></span>
    <div class="grain relative flex flex-col gap-2 rounded-lg border-2 border-ink bg-linear-to-b from-[#fffcf7] to-[#f8f0e4] p-2">
      <div class="grain flex items-center gap-2 rounded-lg bg-dusk-gradient py-2 pr-3 pl-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),inset_0_-1px_0_rgb(0_0_0/0.35)]">
        <h1 class="type-display glow min-w-0 whitespace-nowrap text-gold">${title}</h1>
        <div class="flex-1"></div>
        <${Bay} spin=${spin} onTurn=${stop} />
      </div>
      <div class="flex items-center gap-2 pr-2 pl-4">
        <${SyncLight} status=${sync.status} />
        <${Display} />
        ${keys[kind].map(([icon, label, handler]) => html`<${Key} icon=${icon} label=${label} onClick=${on[handler]} />`)}
      </div>
      ${kind === "Plan" &&
      days &&
      html`<div class="flex items-center justify-between px-2 pt-2 pb-1">${days.map((d) => html`<${Day} ...${d} />`)}</div>`}
    </div>
  </header>`;
}

// Bay is the cassette inside the player: the cassette is bigger than the
// opening, so only its middle shows (the label, the reel window, the reels);
// the opening's edge shades it, and one reflection crosses the door.
function Bay({ spin, onTurn }) {
  const reel = (x) =>
    html`<span class="absolute top-[11px] ${x}" onAnimationIteration=${onTurn}><${Icon} name="reel" class=${spin ? "spin-reel" : ""} /></span>`;
  return html`<div class="relative h-[60px] w-[136px] shrink-0 overflow-hidden rounded-[10px] bg-ink shadow-[0_1px_0_rgb(255_255_255/0.14)]" aria-hidden="true">
    <span class="absolute -top-[18px] -left-[22px] h-[96px] w-[180px] rounded-sm bg-linear-to-b from-[#6b61ab] to-dusk"></span>
    <span class="absolute top-px -left-[10px] h-[58px] w-[156px] rounded-[5px] bg-paper/14"></span>
    <span class="absolute top-[10px] left-[14px] h-10 w-[108px] rounded-[20px] bg-ink shadow-[inset_0_2px_4px_rgb(0_0_0/0.6)]"></span>
    ${reel("left-[15px]")} ${reel("left-[83px]")}
    <span class="absolute inset-0 rounded-[10px] border-[1.5px] border-ink shadow-[inset_0_4px_8px_rgb(0_0_0/0.7),inset_0_0_2px_rgb(0_0_0/0.5)]"></span>
    <span class="absolute inset-0 bg-[linear-gradient(to_bottom_right,transparent_38%,rgb(255_255_255/0.14)_42%,rgb(255_255_255/0.05)_55%,transparent_60%)]"></span>
  </div>`;
}

// Display is the stripes as five lit tubes in a dark window, 10 in from
// each end.
const tubes = ["sky", "periwinkle", "orchid", "pink", "gold"];
function Display() {
  return html`<div class="glass-dark flex h-9 min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-sm px-[10px]" aria-hidden="true">
    ${tubes.map(
      (t) => html`<span
        class="h-[3px] w-full rounded-[2px]"
        style=${`background-image: linear-gradient(to bottom, var(--color-${t}), color-mix(in srgb, var(--color-${t}), white 75%), var(--color-${t})); box-shadow: 0 0 6px color-mix(in srgb, var(--color-${t}) 90%, transparent);`}
      ></span>`,
    )}
  </div>`;
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
