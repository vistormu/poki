import { h, render } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

// the three tabs (spec → screens); their screens come with phase d
const tabs = ["Plan", "List", "Meals"];

function App() {
  const [tab, setTab] = useState(tabs[0]);
  return html`
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

render(html`<${App} />`, document.getElementById("app"));
