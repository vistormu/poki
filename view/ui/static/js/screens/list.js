// the list tab (spec → list; figma, Screens, section List): the ? entries to
// settle, the items to buy along the path (the current group pinned while
// scrolling), the bought ones apart; adding by hand, clearing with undo; the
// path, a group, a new group, and giving an item in Other its group. phone:
// one page at a time. desktop: the list in columns, the open page in the
// sidebar (decisions/0011).
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
// scroll by. desktop: columns, a group never split.
function Sheet({ data, sheet, go, columns = false }) {
  const { check, groups, bought } = sheet;
  if (!check.length && !groups.length && !bought.length) return html`<${Empty} text="Nothing on the list" />`;
  const path = () => go({ name: "path" });
  const parts = [
    check.length > 0 &&
      html`<${Part} key="check" head=${html`<${Block} tone="orchid" text="To check" trailing=${html`<${Ticks} />`} />`} pin=${!columns}>
        ${check.map(
          (c, i) => html`<${IngredientRow}
            key=${c.entry.id}
            name=${c.item.name}
            detail=${[format(c.entry.amount, c.item.unit), c.meal].filter(Boolean).join(" · ")}
            mark="check"
            onMark=${(v) => list.resolve(data, c.entry.id, v === "buy" ? "buy" : "have")}
            divider=${i < check.length - 1}
          />`,
        )}
      </${Part}>`,
    ...groups.map(
      (g) => html`<${Part}
        key=${g.group?.id || "other"}
        head=${html`<${Block}
          tone=${g.tone}
          text=${g.group ? g.group.name : "Other"}
          leading=${g.group && html`<${Position} n=${g.group.place} />`}
          trailing=${html`<${Ticks} />`}
          onClick=${path}
        />`}
        pin=${!columns}
      >
        ${g.rows.map(
          (r, i) => html`<${Row}
            key=${r.item.id}
            name=${r.item.name}
            amount=${format(r.total, r.item.unit)}
            tone=${r.tone}
            tick=${false}
            trailing=${g.group ? null : "move"}
            trailingLabel="Give a group"
            onTrailing=${g.group ? null : () => go({ name: "give", item: r.item.id })}
            divider=${i < g.rows.length - 1}
            onClick=${() => list.tick(data, r.item.id)}
          />`,
        )}
      </${Part}>`,
    ),
    bought.length > 0 &&
      html`<${Part} key="bought" head=${html`<${Block} tone="sky" fill="soft" text="Bought" leading="check" />`}>
        <div class="opacity-60">
          ${bought.map(
            (r, i) => html`<${Row}
              key=${r.item.id}
              name=${r.item.name}
              amount=${format(r.total, r.item.unit)}
              tone=${r.tone}
              tick=${true}
              divider=${i < bought.length - 1}
              onClick=${() => list.untick(data, r.item.id)}
            />`,
          )}
        </div>
      </${Part}>`,
  ].filter(Boolean);
  if (columns) return html`<div class="columns-[260px] gap-6">${parts}</div>`;
  return html`<div>${parts}</div>`;
}

// Part is a header and its rows. pinned, the header stays at the top while
// the rows scroll under it, until the next part's takes its place.
function Part({ head, pin = false, children }) {
  return html`<section class="mb-5 break-inside-avoid last:mb-0">
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
    const groups = list.path(data);
    return {
      head: html`<${SubHeader} title="Path" onBack=${back} />`,
      body: html`<div class="flex flex-col gap-2">
          ${groups.map(
            (g) => html`<${Block} key=${g.id} tone=${g.tone} text=${g.name} leading=${html`<${Position} n=${g.place} />`} onClick=${() => go({ name: "group", id: g.id })} />`,
          )}
          <${Block} tone=${list.otherTone(groups)} text="Other" />
        </div>
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
