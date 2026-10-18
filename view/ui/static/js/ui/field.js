import { useEffect, useRef } from "preact/hooks";

import { html } from "./html.js";
import { Icon } from "./icon.js";

// Field is every text input: search (with its icon), a name, an amount (with
// its unit); clear glass set into the screen, as the days. no placeholder
// text. the rest of the props go to the <input>. autofocus focuses it when it
// appears: the attribute alone works once per page, and fields open in place.
export function Field({ icon, unit, value, onInput, autofocus, ...input }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autofocus) ref.current.focus();
  }, []);
  return html`<label class="glass flex h-11 w-full items-center gap-2 rounded-full px-4">
    ${icon && html`<${Icon} name=${icon} />`}
    <input
      ref=${ref}
      class="min-w-0 flex-1 bg-transparent type-body outline-none"
      value=${value}
      onInput=${(e) => onInput?.(e.currentTarget.value)}
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      ...${input}
    />
    ${unit && html`<span class="shrink-0 type-body opacity-60">${unit}</span>`}
  </label>`;
}
