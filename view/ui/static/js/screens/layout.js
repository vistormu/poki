import { html } from "../ui/html.js";
import { ToastHost } from "./toasts.js";

// Layout places a tab's parts (figma.md → rules). phone: head (the deck, or a
// page's sub header) and body scroll together above the floating tab bar.
// desktop: a sidebar (the deck, the rail, then side, the open page, in a
// card) and a main area.
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
        html`<section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-ink bg-paper shadow-soft">
          <div class="scroll min-h-0 flex-1 pb-4">${side}</div>
        </section>`}
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
