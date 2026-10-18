import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Data } from "./data/data.js";
import { idb } from "./data/idb.js";
import { post, Syncer } from "./data/sync.js";
import { html } from "./ui/html.js";
import { Deck } from "./ui/deck.js";
import { TabBar } from "./ui/tab-bar.js";
import { TabRail } from "./ui/tab-rail.js";
import { useData, useDesktop } from "./screens/hooks.js";
import { Layout, DeckHead } from "./screens/layout.js";
import { MealsTab } from "./screens/meals.js";

// the three tabs (spec → screens)
const tabs = ["Plan", "List", "Meals"];

// useSync is the syncer's state, for the deck's light and reels.
function useSync(syncer) {
  const [s, setS] = useState(syncer.state);
  useEffect(() => syncer.subscribe(setS), [syncer]);
  return s;
}

// the plan's window title is "Today" (figma.md → rules); its subtitle the date
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "").toUpperCase();

// Bare is a tab whose screen is still to come: its deck only.
function Bare({ tab, desktop, nav, sync }) {
  const deck = html`<${Deck} kind=${tab} title=${tab === "Plan" ? "Today" : tab} subtitle=${tab === "Plan" ? today() : null} sync=${sync} />`;
  return html`<${Layout} desktop=${desktop} nav=${nav} deck=${deck} head=${html`<${DeckHead}>${deck}</${DeckHead}>`} />`;
}

function App({ data, syncer }) {
  useData(data);
  const sync = useSync(syncer);
  const desktop = useDesktop();
  const [tab, setTab] = useState(tabs[0]);
  // each tab keeps its open page while another is shown; its own tab again
  // goes back to its start
  const [pages, setPages] = useState({});
  const pick = (t) => {
    if (t === tab) setPages({ ...pages, [t]: null });
    setTab(t);
  };
  const nav = desktop ? html`<${TabRail} tabs=${tabs} active=${tab} onPick=${pick} />` : html`<${TabBar} tabs=${tabs} active=${tab} onPick=${pick} />`;
  const props = { data, desktop, nav, sync, page: pages[tab] || null, setPage: (p) => setPages((ps) => ({ ...ps, [tab]: p })) };
  if (tab === "Meals") return html`<${MealsTab} ...${props} />`;
  return html`<${Bare} tab=${tab} ...${props} />`;
}

// ios pinches past the viewport's maximum-scale; this is what stops it
document.addEventListener("gesturestart", (e) => e.preventDefault());

// the shell for opening with no connection (sw.js); a new one takes over on
// the next launch
navigator.serviceWorker?.register("/sw.js");

// ask the browser to keep the store through storage pressure (ios keeps a
// home-screen app's anyway)
navigator.storage?.persist?.();

const data = await Data.open(await idb());
const syncer = new Syncer(data, post);
render(html`<${App} data=${data} syncer=${syncer} />`, document.getElementById("app"));
syncer.start(window, document);

// the data, for the console
window.poki = { data, syncer };
