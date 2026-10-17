import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Data } from "./data/data.js";
import { idb } from "./data/idb.js";
import { post, Syncer } from "./data/sync.js";
import { html } from "./ui/html.js";
import { Deck } from "./ui/deck.js";
import { TabBar } from "./ui/tab-bar.js";

// the three tabs (spec → screens); their screens come with phase d
const tabs = ["Plan", "List", "Meals"];

// useSync is the syncer's state, for the deck's light and reels.
function useSync(syncer) {
  const [s, setS] = useState(syncer.state);
  useEffect(() => syncer.subscribe(setS), [syncer]);
  return s;
}

// the plan's window title is "Today" (figma.md → rules); its subtitle the date
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "").toUpperCase();

function App({ syncer }) {
  const [tab, setTab] = useState(tabs[0]);
  const sync = useSync(syncer);
  return html`
    <main class="scroll flex-1 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(max(16px,env(safe-area-inset-bottom))+68px)]">
      <${Deck} kind=${tab} title=${tab === "Plan" ? "Today" : tab} subtitle=${tab === "Plan" ? today() : null} sync=${sync} />
    </main>
    <div class="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))]">
      <${TabBar} tabs=${tabs} active=${tab} onPick=${setTab} />
    </div>
  `;
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
render(html`<${App} syncer=${syncer} />`, document.getElementById("app"));
syncer.start(window, document);

// the data, for the console until the screens use it
window.poki = { data, syncer };
