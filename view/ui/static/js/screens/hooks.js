import { useEffect, useState } from "preact/hooks";

// useData re-renders on every change to the local store, local or synced.
export function useData(data) {
  const [, tick] = useState(0);
  useEffect(() => data.subscribe(() => tick((n) => n + 1)), [data]);
  return data;
}

// desktop is figma's breakpoint: a sidebar and a main area from 768 px.
const desktop = matchMedia("(min-width: 768px)");

export function useDesktop() {
  const [on, set] = useState(desktop.matches);
  useEffect(() => {
    const f = () => set(desktop.matches);
    desktop.addEventListener("change", f);
    return () => desktop.removeEventListener("change", f);
  }, []);
  return on;
}

// useAway is what opened in place (ref): it scrolls up to near the top, above
// the keyboard, and a pointerdown anywhere outside it calls onAway (fold).
// blur would fold it before a tap on what it holds lands (safari focuses no
// buttons). no onAway: nothing.
export function useAway(ref, onAway) {
  useEffect(() => {
    if (!onAway) return;
    const scroller = ref.current.closest(".scroll");
    if (scroller) scroller.scrollBy({ top: ref.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120, behavior: "smooth" });
    const away = (e) => !ref.current?.contains(e.target) && onAway();
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
}
