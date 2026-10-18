// the list tab (spec → list; figma, Screens, section List): the ? entries to
// settle, the items to buy along the path (the current group pinned while
// scrolling), the bought ones apart; adding by hand, clearing with undo; the
// path, a group, a new group, and giving an item in Other its group. phone:
// one page at a time. desktop: the list in columns, the open page in the
// sidebar (decisions/0011). the path reorders by dragging a group's ↕.
import { useEffect, useRef, useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Deck } from "../ui/deck.js";
import { Block } from "../ui/block.js";
import { Row } from "../ui/row.js";
import { AddRow } from "../ui/add-row.js";
import { Field } from "../ui/field.js";
import { SubHeader } from "../ui/sub-header.js";
import { IngredientRow } from "../ui/ingredient-row.js";
import { Position } from "../ui/position.js";
import { Ticks } from "../ui/ticks.js";
import { Icon } from "../ui/icon.js";
import { format } from "../data/amount.js";
import * as list from "../data/list.js";
import { Layout, DeckHead, Empty } from "./layout.js";
import { ItemPicker } from "./picker.js";
import { toast } from "./toasts.js";

// a page is {name: "add" | "path" | "group" | "new" | "give", id?, item?}, or
// null for the list itself. id is a group's; item, an item in Other's (give,
// and new from give).
export function ListTab({ data, desktop, nav, sync, page, setPage }) {
  const open = valid(data, page);
  const go = (p) => setPage(p);
  const clear = async () => {
    const undo = await list.clear(data);
    if (undo) toast({ text: "List cleared", action: "Undo", onAction: undo });
  };
  const deck = html`<${Deck} kind="List" title="List" sync=${sync} onAdd=${() => go({ name: "add" })} onClear=${clear} />`;
  const sheet = list.sheet(data);
  const pageParts = open && parts(data, open, go);
  if (desktop) {
    return html`<${Layout}
      desktop
      nav=${nav}
      deck=${deck}
      side=${pageParts && html`${pageParts.head}<div class="px-2">${pageParts.body}</div>`}
      main=${html`<${Sheet} data=${data} sheet=${sheet} go=${go} columns />`}
    />`;
  }
  if (pageParts) return html`<${Layout} nav=${nav} head=${pageParts.head} body=${pageParts.body} />`;
  return html`<${Layout} nav=${nav} head=${html`<${DeckHead}>${deck}</${DeckHead}>`} body=${html`<${Sheet} data=${data} sheet=${sheet} go=${go} />`} />`;
}

// valid is the open page, or null when what it shows is gone (deleted on
// the other phone, or given a group there).
function valid(data, page) {
  if (!page) return null;
  if (page.name === "group" && !data.get("groups", page.id)) return null;
  if (page.item) {
    const it = data.get("items", page.item);
    if (!it || it.group_id) return page.name === "new" ? { name: "new" } : null;
  }
  return page;
}

// Sheet is the list: To check, the groups in path order (Other last),
// Bought. phone: one column, each group's header pinned while its rows
// scroll by. desktop: columns, a group never split. an item to buy is
// dragged by its ↕ into another group; a tap on ↕ opens Give a group.
function Sheet({ data, sheet, go, columns = false }) {
  const { check, groups, bought } = sheet;
  const drag = useItemDrag(data);
  if (!check.length && !groups.length && !bought.length) return html`<${Empty} text="Nothing on the list" />`;
  const path = () => go({ name: "path" });
  const held = drag.state?.moved ? drag.state : null;
  const rowsOf = (g) => {
    const key = g.group?.id || "other";
    const shown = g.rows.filter((r) => r.item.id !== held?.id);
    // every row keeps its element while one is held (the pointer stays with
    // the held one), which folds away
    const out = g.rows.map(
      (r) => html`<div key=${r.item.id} data-row class=${r.item.id === held?.id ? "h-0 overflow-hidden" : ""}>
        <${Row}
          name=${r.item.name}
          amount=${format(r.total, r.item.unit)}
          tone=${r.tone}
          tick=${false}
          trailing="move"
          trailingLabel=${`Move ${r.item.name}`}
          onTrailing=${() => drag.tapped() && go({ name: "give", item: r.item.id })}
          trailingProps=${{ onPointerDown: drag.start(r, key) }}
          onClick=${() => list.tick(data, r.item.id)}
        />
      </div>`,
    );
    if (held && held.target === key) {
      const before = shown.filter((r) => r.item.name.localeCompare(held.row.item.name) < 0).at(-1);
      out.splice(before ? g.rows.indexOf(before) + 1 : 0, 0, html`<div key="gap" class="h-[54px]"></div>`);
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
          onClick=${path}
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
      <${Row} name=${held.row.item.name} amount=${format(held.row.total, held.row.item.unit)} tone=${held.row.tone} tick=${false} trailing="move" />
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
// a group's id, or null). the drop gives the item that group. tapped() says
// whether the click that follows was a tap, not the end of a drag.
function useItemDrag(data) {
  const [state, setState] = useState(null);
  const live = useRef(null);
  const dragged = useRef(false);
  live.current = state;
  const start = (row, from) => (e) => {
    const el = e.currentTarget.closest("[data-row]");
    dragged.current = false;
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
      dragged.current = true;
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
  const tapped = () => {
    const was = dragged.current;
    dragged.current = false;
    return !was;
  };
  return { state, start, tapped };
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

// parts are an open page's head (its sub header) and body.
function parts(data, page, go) {
  const back = () => go(null);
  const toPath = () => go({ name: "path" });
  if (page.name === "add") {
    const add = async (p) => {
      await list.add(data, p);
      back();
    };
    return {
      head: html`<${SubHeader} title="Add to list" onBack=${back} />`,
      body: html`<${ItemPicker} data=${data} onPick=${add} />`,
    };
  }
  if (page.name === "path") {
    return {
      head: html`<${SubHeader} title="Path" onBack=${back} />`,
      body: html`<${Path} data=${data} onOpen=${(id) => go({ name: "group", id })} />
        <div class="pt-2"><${AddRow} label="New group" onClick=${() => go({ name: "new" })} /></div>`,
    };
  }
  if (page.name === "group") {
    const g = list.path(data).find((x) => x.id === page.id);
    const del = async () => {
      const undo = await list.deleteGroup(data, g.id);
      toPath();
      toast({ text: `${g.name} deleted`, action: "Undo", onAction: undo });
    };
    return {
      head: html`<${SubHeader} title=${g.name} subtitle=${String(g.place).padStart(2, "0")} onBack=${toPath} />`,
      body: html`<${GroupName} key=${g.id} data=${data} group=${g} />
        <div class="pt-6"><${Block} tone="pink" fill="soft" text="Delete group" leading="close" onClick=${del} /></div>`,
    };
  }
  if (page.name === "new") {
    const added = page.item ? back : toPath;
    return {
      head: html`<${SubHeader} title="New group" onBack=${page.item ? () => go({ name: "give", item: page.item }) : toPath} />`,
      body: html`<${NewGroup} data=${data} item=${page.item} onAdded=${added} />`,
    };
  }
  // give: the groups to give an item in Other
  const item = data.get("items", page.item);
  const give = async (id) => {
    await list.giveGroup(data, item.id, id);
    back();
  };
  return {
    head: html`<${SubHeader} title=${item.name} subtitle="OTHER" onBack=${back} />`,
    body: html`<div class="flex flex-col gap-2">
        ${list.path(data).map(
          (g) => html`<${Block} key=${g.id} tone=${g.tone} text=${g.name} leading=${html`<${Position} n=${g.place} />`} onClick=${() => give(g.id)} />`,
        )}
      </div>
      <div class="pt-2"><${AddRow} label="New group" onClick=${() => go({ name: "new", item: item.id })} /></div>`,
  };
}

// a group on the path takes 48: its 40 tall block and the 8 under it
const PITCH = 48;

// Path is the groups in the order we walk the store, Other last; a group
// opens its page. held by ↕ and dragged (touch or mouse), it lifts with a
// shadow and the others open a gap where it would land; the drop renumbers
// (figma: Path — dragging).
function Path({ data, onOpen }) {
  const groups = list.path(data);
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
  return html`<div class="relative ${drag ? "select-none" : ""}" style=${{ height: `${groups.length * PITCH}px` }}>
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
    </div>
    <${Block} tone=${list.otherTone(groups)} text="Other" />`;
}

// GroupName edits a group's name in place, saved a moment after typing stops
// and when leaving; a name that can't be one is not saved.
function GroupName({ data, group }) {
  const [name, setName] = useState(group.name);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => {
    const t = setTimeout(() => list.renameGroup(data, group.id, name), 600);
    return () => clearTimeout(t);
  }, [name]);
  useEffect(() => () => list.renameGroup(data, group.id, latest.current), []);
  return html`<${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" />`;
}

// NewGroup names a group and adds it last on the path; from Give a group,
// the item takes it at once.
function NewGroup({ data, item, onAdded }) {
  const [name, setName] = useState("");
  const add = async () => {
    if (await list.addGroup(data, name, item || null)) onAdded();
  };
  return html`<${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" />
    <div class="pt-4"><${Block} tone="sky" fill="soft" text="Add to the path" leading="plus" onClick=${add} /></div>`;
}
