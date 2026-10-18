import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Data } from "./data/data.js";
import { idb } from "./data/idb.js";
import { post, Syncer } from "./data/sync.js";
import { html } from "./ui/html.js";
import { TabBar } from "./ui/tab-bar.js";
import { useData, useDesktop } from "./screens/hooks.js";
import { MealsTab } from "./screens/meals.js";
import { PlanTab } from "./screens/plan.js";
import { ListTab } from "./screens/list.js";
import { toast, dismiss } from "./screens/toasts.js";

// the three tabs (spec → screens)
const tabs = ["Plan", "List", "Meals"];

// useSync is the syncer's state, for the deck's light and reels.
function useSync(syncer) {
  const [s, setS] = useState(syncer.state);
  useEffect(() => syncer.subscribe(setS), [syncer]);
  return s;
}

function App({ data, syncer }) {
  useData(data);
  const sync = useSync(syncer);
  const desktop = useDesktop();
  const [tab, setTab] = useState(tabs[0]);
  // each tab keeps its open page while another is shown; its own tab again
  // goes back to its start (the plan: today). leaving the plan ends a move.
  const [pages, setPages] = useState({});
  const setPage = (t, p) => setPages((ps) => ({ ...ps, [t]: typeof p === "function" ? p(ps[t]) : p }));
  const pick = (t) => {
    if (pages.Plan?.mode && (t !== "Plan" || tab === "Plan")) {
      dismiss();
      setPage("Plan", (p) => ({ ...p, mode: null }));
    }
    if (t === tab) setPage(t, null);
    setTab(t);
  };
  // app is what one tab opens in another: a meal to edit, a meal to place
  const app = {
    toMeal: (id) => {
      setPage("Meals", { name: "meal", id });
      setTab("Meals");
    },
    place: (id) => {
      setPage("Plan", (p) => ({ date: p?.date, mode: { kind: "place", id } }));
      setTab("Plan");
      toast({ text: `Placing ${data.get("meals", id).name}`, action: "Cancel", onAction: () => setPage("Plan", (p) => ({ ...p, mode: null })), stay: true });
    },
  };
  const nav = html`<${TabBar} tabs=${tabs} active=${tab} onPick=${pick} />`;
  const props = { data, desktop, nav, sync, app, page: pages[tab] || null, setPage: (p) => setPage(tab, p) };
  if (tab === "Plan") return html`<${PlanTab} ...${props} />`;
  if (tab === "List") return html`<${ListTab} ...${props} />`;
  return html`<${MealsTab} ...${props} />`;
}

// refused names what a refused op was about, from the row while it's here.
function refused(data, op) {
  const row = { ...data.get(op.table, op.id), ...op.fields };
  const name = (table, id) => data.get(table, id)?.name;
  if (op.table === "ingredients" || op.table === "list_entries") return name("items", row.item_id) || "An item";
  if (op.table === "plan_entries") return name("meals", row.meal_id) || "A meal";
  return row.name || "A change";
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
// a change the server refused (spec → messages): the error stays until tapped
syncer.onRejected = (ops) => toast({ kind: "error", text: `${refused(data, ops[0])} couldn’t be saved` });
render(html`<${App} data=${data} syncer=${syncer} />`, document.getElementById("app"));
syncer.start(window, document);

// the data, for the console
window.poki = { data, syncer };
