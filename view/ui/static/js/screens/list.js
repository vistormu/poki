// the list tab (spec → list; figma, Screens, section List): shopping and
// editing apart (d2). shopping: the ? entries to settle, the items to buy along
// the path (the current group pinned while scrolling), each ticked with a tap,
// the bought ones apart; clearing with undo. editing (✎ latched): rows trade
// their tick for ↕ (dragged into another group), a + under each group widens
// into the item picker in place; the Path latch turns the body into the
// groups, in place: a tap unfolds a group's name and Delete group, the + at
// the end a new group. phone and desktop alike (desktop: the list in columns).
import { useEffect, useRef, useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Deck } from "../ui/deck.js";
import { Block } from "../ui/block.js";
import { Row } from "../ui/row.js";
import { AddRow } from "../ui/add-row.js";
import { Field } from "../ui/field.js";
import { Action } from "../ui/action.js";
import { IngredientRow } from "../ui/ingredient-row.js";
import { Position } from "../ui/position.js";
import { Ticks } from "../ui/ticks.js";
import { Icon } from "../ui/icon.js";
import { format } from "../data/amount.js";
import * as list from "../data/list.js";
import { Layout, DeckHead, Empty, Unfold } from "./layout.js";
import { useAway } from "./hooks.js";
import { ItemPicker } from "./picker.js";
import { toast } from "./toasts.js";

// a page is null (shopping) or {edit: true, path, open}: path, the groups
// shown instead of the items; open, what is unfolded: {name: "add", group}
// (a group's key: its id, or "other"), {name: "group", id}, {name: "new"}.
export function ListTab({ data, desktop, nav, sync, page, setPage }) {
  const editing = !!page?.edit;
  const path = editing && !!page.path;
  const open = editing ? valid(data, page.open) : null;
  const set = (o) => setPage({ edit: true, path, open: o });
  const clear = async () => {
    const undo = await list.clear(data);
    if (undo) toast({ text: "List cleared", action: "Undo", onAction: undo });
  };
  const deck = html`<${Deck}
    kind="List"
    title="List"
    sync=${sync}
    editing=${editing}
    path=${path}
    onEdit=${() => setPage(editing ? null : { edit: true })}
    onPath=${() => setPage({ edit: true, path: !path })}
    onClear=${clear}
  />`;
  const body = path
    ? html`<${Path} data=${data} open=${open} set=${set} />`
    : html`<${Sheet} data=${data} sheet=${list.sheet(data, editing)} editing=${editing} open=${open} set=${set} columns=${desktop} />`;
  if (desktop) return html`<${Layout} desktop nav=${nav} deck=${deck} main=${body} />`;
  return html`<${Layout} nav=${nav} head=${html`<${DeckHead}>${deck}</${DeckHead}>`} body=${body} />`;
}

// valid is what is unfolded, or null when it is gone (deleted on the other
// phone).
function valid(data, open) {
  if (open?.name === "group" && !data.get("groups", open.id)) return null;
  if (open?.name === "add" && open.group !== "other" && !data.get("groups", open.group)) return null;
  return open || null;
}

// Sheet is the list: To check, the groups in path order (Other last),
// Bought. phone: one column, each group's header pinned while its rows
// scroll by. desktop: columns, a group never split. editing, an item to buy
// is dragged by its ↕ into another group, and each group ends with its +.
function Sheet({ data, sheet, editing, open, set, columns = false }) {
  const { check, groups, bought } = sheet;
  const drag = useItemDrag(data);
  if (!check.length && !groups.length && !bought.length) return html`<${Empty} text="Nothing on the list" />`;
  const held = drag.state?.moved ? drag.state : null;
  const rowsOf = (g) => {
    const key = g.group?.id || "other";
    const shown = g.rows.filter((r) => r.item.id !== held?.id);
    // every row keeps its element while one is held (the pointer stays with
    // the held one), which folds away
    const out = g.rows.map(
      (r) => html`<div key=${r.item.id} data-row class=${r.item.id === held?.id ? "h-0 overflow-hidden" : ""}>
        ${editing
          ? html`<${Row}
              name=${r.item.name}
              amount=${format(r.total, r.item.unit)}
              tone=${r.tone}
              trailing="move"
              trailingLabel=${`Move ${r.item.name}`}
              onTrailing=${() => {}}
              trailingProps=${{ onPointerDown: drag.start(r, key) }}
            />`
          : html`<${Row} name=${r.item.name} amount=${format(r.total, r.item.unit)} tone=${r.tone} tick=${false} onClick=${() => list.tick(data, r.item.id)} />`}
      </div>`,
    );
    if (held && held.target === key) {
      const before = shown.filter((r) => r.item.name.localeCompare(held.row.item.name) < 0).at(-1);
      out.splice(before ? g.rows.indexOf(before) + 1 : 0, 0, html`<div key="gap" class="h-[54px]"></div>`);
    }
    if (editing) {
      const name = g.group ? g.group.name : "Other";
      out.push(
        open?.name === "add" && open.group === key
          ? html`<div key="add" class="pt-2">
              <${ItemPicker} data=${data} inPlace onAway=${() => set(null)} onPick=${(p) => list.add(data, p, g.group?.id || null).then(() => set(null))} />
            </div>`
          : html`<div key="add" class=${g.rows.length ? "" : "pt-2"}><${AddRow} label=${`Add to ${name}`} onClick=${() => set({ name: "add", group: key })} /></div>`,
      );
    }
    return out;
  };
  const parts = [
    check.length > 0 &&
      html`<${Part} key="check" head=${html`<${Block} tone="orchid" text="To check" trailing=${html`<${Ticks} />`} />`} pin=${!columns}>
        ${check.map(
          (c) => html`<${IngredientRow}
            key=${c.entry.id}
            name=${c.item.name}
            detail=${[format(c.entry.amount, c.item.unit), c.meal].filter(Boolean).join(" · ")}
            mark="check"
            onMark=${(v) => list.resolve(data, c.entry.id, v === "buy" ? "buy" : "have")}
          />`,
        )}
      </${Part}>`,
    ...groups.map(
      (g) => html`<${Part}
        key=${g.group?.id || "other"}
        group=${g.group?.id || "other"}
        head=${html`<${Block}
          tone=${g.tone}
          text=${g.group ? g.group.name : "Other"}
          leading=${g.group && html`<${Position} n=${g.group.place} />`}
          trailing=${html`<${Ticks} />`}
        />`}
        pin=${!columns}
      >
        ${rowsOf(g)}
      </${Part}>`,
    ),
    bought.length > 0 &&
      html`<${Part} key="bought" head=${html`<${Block} tone="sky" fill="soft" text="Bought" leading="check" />`}>
        <div class="opacity-60">
          ${bought.map(
            (r) => html`<${Row}
              key=${r.item.id}
              name=${r.item.name}
              amount=${format(r.total, r.item.unit)}
              tone=${r.tone}
              tick=${true}
              onClick=${() => list.untick(data, r.item.id)}
            />`,
          )}
        </div>
      </${Part}>`,
  ].filter(Boolean);
  const lifted =
    held &&
    html`<div
      class="pointer-events-none fixed z-30 rounded-lg bg-paper shadow-soft"
      style=${{ left: `${held.rect.left + held.x - held.x0}px`, top: `${held.rect.top + held.y - held.y0}px`, width: `${held.rect.width}px` }}
    >
      <${Row} name=${held.row.item.name} amount=${format(held.row.total, held.row.item.unit)} tone=${held.row.tone} trailing="move" />
    </div>`;
  if (columns) return html`<div class="columns-[260px] gap-6 ${held ? "select-none" : ""}">${parts}</div>${lifted}`;
  return html`<div class=${held ? "select-none" : ""}>${parts}</div>${lifted}`;
}

// the drag starts once the pointer has moved this far; near the scroller's
// top or bottom (the tab bar's height) the list scrolls under it
const SLOP = 6;
const EDGE = 64;
const BOTTOM = 140;

// useItemDrag is an item's drag by its ↕: state is {id, row, from, rect, x0,
// y0, x, y, moved, target}, target the group key under the pointer ("other",
// a group's id, or null). the drop gives the item that group.
function useItemDrag(data) {
  const [state, setState] = useState(null);
  const live = useRef(null);
  live.current = state;
  const start = (row, from) => (e) => {
    const el = e.currentTarget.closest("[data-row]");
    setState({
      id: row.item.id,
      row,
      from,
      rect: el.getBoundingClientRect(),
      scroller: el.closest(".scroll"),
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      target: from,
    });
  };
  const on = !!state;
  useEffect(() => {
    if (!on) return;
    let speed = 0;
    let frame = 0;
    const hit = (x, y) => document.elementFromPoint(x, y)?.closest("[data-group]")?.dataset.group || null;
    const step = () => {
      const s = live.current;
      if (s && speed && s.scroller) {
        s.scroller.scrollTop += speed;
        setState({ ...s, target: hit(s.x, s.y) });
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const move = (e) => {
      const s = live.current;
      if (!s) return;
      const moved = s.moved || Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > SLOP;
      if (s.scroller && moved) {
        const r = s.scroller.getBoundingClientRect();
        const bottom = Math.min(r.bottom, innerHeight) - BOTTOM;
        speed = e.clientY < r.top + EDGE ? -8 : e.clientY > bottom ? 8 : 0;
      }
      setState({ ...s, x: e.clientX, y: e.clientY, moved, target: moved ? hit(e.clientX, e.clientY) : s.from });
      if (moved) e.preventDefault();
    };
    const up = async () => {
      const s = live.current;
      setState(null);
      if (!s?.moved) return;
      if (s.target && s.target !== s.from) await list.giveGroup(data, s.id, s.target === "other" ? null : s.target);
    };
    const cancel = () => setState(null);
    addEventListener("pointermove", move, { passive: false });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
    };
  }, [on]);
  return { state, start };
}

// Part is a header and its rows. pinned, the header stays at the top while
// the rows scroll under it, until the next part's takes its place. a group's
// part is where a dragged item lands (data-group).
function Part({ head, pin = false, group, children }) {
  return html`<section class="mb-5 break-inside-avoid last:mb-0" data-group=${group}>
    <div class=${pin ? "sticky top-[env(safe-area-inset-top)] z-10" : ""}>${head}</div>
    ${children}
  </section>`;
}

// Path is the groups in the order we walk the store, Other last, then a +
// for a new group. a tap on a group unfolds its name and Delete group under it
// (another tap folds it); while one is unfolded the path holds still.
// otherwise, held by ↕ and dragged (touch or mouse), a group lifts with a
// shadow and the others open a gap where it would land; the drop renumbers.
function Path({ data, open, set }) {
  const groups = list.path(data);
  const openID = open?.name === "group" ? open.id : null;
  const toggle = (id) => set(openID === id ? null : { name: "group", id });
  const end = html`<div class="pt-2">
    <${Block} tone=${list.otherTone(groups)} text="Other" />
    <div class="pt-2">
      ${open?.name === "new"
        ? html`<${NewGroup} data=${data} onDone=${() => set(null)} />`
        : html`<${AddRow} label="New group" onClick=${() => set({ name: "new" })} />`}
    </div>
  </div>`;
  if (openID) {
    return html`<div class="flex flex-col gap-2">
        ${groups.map(
          (g) => html`<div key=${g.id}>
            <${Block} tone=${g.tone} text=${g.name} leading=${html`<${Position} n=${g.place} />`} onClick=${() => toggle(g.id)} />
            ${g.id === openID && html`<${Unfold}><${Group} data=${data} group=${g} fold=${() => set(null)} /></${Unfold}>`}
          </div>`,
        )}
      </div>
      ${end}`;
  }
  return html`<${Drag} data=${data} groups=${groups} onOpen=${toggle} />${end}`;
}

// a group on the path takes 48: its 40 tall block and the 8 under it
const PITCH = 48;

// Drag is the path's groups, each dragged by its ↕ (figma: Path — dragging).
function Drag({ data, groups, onOpen }) {
  const [drag, setDrag] = useState(null); // {id, from, y0, dy}
  const to = drag && Math.max(0, Math.min(groups.length - 1, Math.round((drag.from * PITCH + drag.dy) / PITCH)));
  const down = (g, i) => (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: g.id, from: i, y0: e.clientY, dy: 0 });
  };
  const move = (e) => drag && setDrag({ ...drag, dy: e.clientY - drag.y0 });
  const up = async () => {
    if (!drag) return;
    await list.moveGroup(data, drag.id, to);
    setDrag(null);
  };
  // each group keeps its element while dragged (the held ↕ keeps the
  // pointer): the lifted one follows it, the others move to their slots
  const rest = drag ? groups.filter((g) => g.id !== drag.id) : groups;
  const slot = (g) => {
    const i = rest.indexOf(g);
    return drag && i >= to ? i + 1 : i;
  };
  return html`<div class="relative ${drag ? "select-none" : ""}" style=${{ height: `${groups.length * PITCH - 8}px` }}>
    ${groups.map((g, i) => {
      const lifted = drag?.id === g.id;
      const top = lifted ? Math.max(0, Math.min((groups.length - 1) * PITCH, drag.from * PITCH + drag.dy)) : slot(g) * PITCH;
      return html`<div key=${g.id} class="absolute inset-x-0 ${lifted ? "z-20" : "transition-[top] duration-150"}" style=${{ top: `${top}px` }}>
        <div class="relative ${lifted ? "rounded-full shadow-soft" : ""}">
          <${Block} tone=${g.tone} text=${g.name} leading=${html`<${Position} n=${g.place} />`} trailing=${html`<span class="size-5"></span>`} />
          <button type="button" class="absolute inset-0 rounded-full" aria-label=${g.name} onClick=${() => onOpen(g.id)}></button>
          <button
            type="button"
            class="absolute inset-y-0 right-0 flex items-center pr-4 pl-3 touch-none ${lifted ? "cursor-grabbing" : "cursor-grab"}"
            aria-label=${`Move ${g.name}`}
            onPointerDown=${down(g, i)}
            onPointerMove=${move}
            onPointerUp=${up}
            onPointerCancel=${up}
          >
            <${Icon} name="move" class="pointer-events-none" />
          </button>
        </div>
      </div>`;
    })}
  </div>`;
}

// Group is what a group unfolds: its name, saved a moment after typing stops
// and when folding (a name that can't be one is not saved), and Delete group
// (with an undo).
function Group({ data, group, fold }) {
  const [name, setName] = useState(group.name);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => {
    const t = setTimeout(() => list.renameGroup(data, group.id, name), 600);
    return () => clearTimeout(t);
  }, [name]);
  useEffect(() => () => list.renameGroup(data, group.id, latest.current), []);
  const del = async () => {
    const undo = await list.deleteGroup(data, group.id);
    fold();
    toast({ text: `${group.name} deleted`, action: "Undo", onAction: undo });
  };
  return html`<div class="flex flex-col gap-2 pt-2 pb-2">
    <${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" onKeyDown=${(e) => e.key === "Enter" && fold()} />
    <div class="flex"><${Action} icon="close" label="Delete group" tone="pink" onClick=${del} /></div>
  </div>`;
}

// NewGroup is the + at the end of the path widened into a field: done adds
// the group last on the path; a tap outside folds it.
function NewGroup({ data, onDone }) {
  const [name, setName] = useState("");
  const ref = useRef(null);
  useAway(ref, onDone);
  const add = async () => {
    if (!name.trim() || (await list.addGroup(data, name))) onDone();
  };
  return html`<div ref=${ref} class="widen">
    <${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" onKeyDown=${(e) => e.key === "Enter" && add()} />
  </div>`;
}
