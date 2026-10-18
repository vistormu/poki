// the toast (spec → messages): one at a time, over the screen, never blocking.
// a message goes after a few seconds; an error stays until tapped.
import { useEffect, useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Toast } from "../ui/toast.js";

const FOR = 5000;
let current = null;
let timer = null;
const listeners = new Set();

// toast shows {text, action, onAction} or {kind: "error", text}.
export function toast(t) {
  clearTimeout(timer);
  current = { kind: "message", ...t };
  if (current.kind === "message") timer = setTimeout(dismiss, FOR);
  listeners.forEach((f) => f(current));
}

export function dismiss() {
  clearTimeout(timer);
  current = null;
  listeners.forEach((f) => f(null));
}

export function ToastHost() {
  const [t, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => listeners.delete(set);
  }, []);
  if (!t) return null;
  const act = () => {
    dismiss();
    t.onAction?.();
  };
  return html`<${Toast} kind=${t.kind} text=${t.text} action=${t.action} onAction=${act} onClose=${dismiss} />`;
}
