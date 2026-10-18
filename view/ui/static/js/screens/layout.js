import { useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { ToastHost } from "./toasts.js";

// Layout places a tab's parts (figma.md → rules). phone: head (the deck, or a
// page's sub header) and body scroll together above the floating tab bar.
// desktop: a sidebar (the deck, the tab bar, then side, the open page, on
// the ground) and a main area.
export function Layout({ desktop, nav, head, body, deck, side, main }) {
  if (!desktop) {
    return html`
      <main class="scroll flex-1 pb-[calc(max(16px,env(safe-area-inset-bottom))+124px)]">
        <div class="pt-[env(safe-area-inset-top)]">${head}</div>
        <div class="px-3 pt-2">${body}</div>
      </main>
      <div class="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2">
        <${ToastHost} />
        ${nav}
      </div>
    `;
  }
  return html`
    <div class="flex h-full">
      <aside class="flex w-[390px] shrink-0 flex-col gap-4 px-4 py-6">
        ${deck} ${nav}
        ${side &&
        html`<section class="scroll min-h-0 flex-1 pb-4">${side}</section>`}
      </aside>
      <main class="scroll min-w-0 flex-1 px-4 py-6">${main}</main>
      <div class="fixed right-6 bottom-6 w-[366px]"><${ToastHost} /></div>
    </div>
  `;
}

// DeckHead is the deck as a phone page's head: 12 px in, 8 below.
export const DeckHead = ({ children }) => html`<div class="px-3 pt-2">${children}</div>`;

// Empty is a muted line (spec → empty states).
export const Empty = ({ text }) => html`<p class="py-6 text-center type-body opacity-60">${text}</p>`;

// Unfold shows what opened in place growing from nothing, pushing what is
// below down; it clips only while it grows, so shadows show after.
export function Unfold({ children }) {
  const [growing, setGrowing] = useState(true);
  return html`<div class=${growing ? "unfold" : ""} onAnimationEnd=${(e) => e.target === e.currentTarget && setGrowing(false)}><div>${children}</div></div>`;
}
