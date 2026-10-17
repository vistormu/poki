import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import htm from "htm";

import { Data } from "./data/data.js";
import { idb } from "./data/idb.js";
import { post, Syncer, OFF, WAITING } from "./data/sync.js";

const html = htm.bind(h);

// the three tabs (spec → screens); their screens come with phase d
const tabs = ["Plan", "List", "Meals"];

// SyncLight is a placeholder until m10 draws the one figma settles (m8).
function SyncLight({ syncer }) {
  const [s, setS] = useState(syncer.state);
  useEffect(() => syncer.subscribe(setS), [syncer]);
  const color = s.status === OFF ? "bg-pink" : s.status === WAITING ? "bg-gold" : "bg-ink/30";
  return html`<span
    class="sync-light size-2 rounded-full ${color} ${s.syncing ? "animate-pulse" : ""}"
    data-status=${s.status}
    data-pending=${s.pending}
  ></span>`;
}

function App({ syncer }) {
  const [tab, setTab] = useState(tabs[0]);
  return html`
    <header class="flex justify-end p-3"><${SyncLight} syncer=${syncer} /></header>
    <main class="scroll flex-1"></main>
    <nav class="tabs flex border-t border-ink/20 bg-paper">
      ${tabs.map(
        (t) => html`
          <button
            class="flex-1 py-3 text-ink aria-[current=page]:font-bold"
            aria-current=${t === tab ? "page" : null}
            onClick=${() => setTab(t)}
          >
            ${t}
          </button>
        `,
      )}
    </nav>
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
