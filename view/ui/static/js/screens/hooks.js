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
