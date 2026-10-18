// the meals tab (spec → meals; figma, Screens, section Meals): every meal,
// searched in place from the deck's key (Create first). a meal opens in place
// (d3), as a planned meal does on the plan: frosted gold, its ingredients
// (each opens into the item picker, filled with it, and Remove from meal), a +
// for another, then Place · Rename · Delete. phone: under its row. desktop: the
// meals in columns, the open one in the sidebar (decisions/0011).
import { useEffect, useRef, useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Deck } from "../ui/deck.js";
import { Block } from "../ui/block.js";
import { Row } from "../ui/row.js";
import { AddRow } from "../ui/add-row.js";
import { Field } from "../ui/field.js";
import { Action } from "../ui/action.js";
import { Ticks } from "../ui/ticks.js";
import { format, typed } from "../data/amount.js";
import { rank, same } from "../data/match.js";
import * as meals from "../data/meals.js";
import { Layout, DeckHead, Empty, Unfold } from "./layout.js";
import { useAway } from "./hooks.js";
import { ItemPicker } from "./picker.js";
import { toast } from "./toasts.js";

// a page is null (no meal open) or {id, edit}: the open meal, and what of it is
// unfolded: {name: "ingredient", id}, {name: "add"} or {name: "rename"}.
export function MealsTab({ data, desktop, nav, sync, page, setPage, app }) {
  const [query, setQuery] = useState(null); // null: not searching
  const open = page && data.get("meals", page.id) ? page : null; // gone when deleted elsewhere
  const deck = html`<${Deck} kind="Meals" title="Meals" sync=${sync} onSearch=${() => setQuery(query === null ? "" : null)} />`;
  // a tap on the open meal folds it
  const toggle = (id) => setPage(open?.id === id ? null : { id });
  const create = async (name) => {
    const id = await meals.createMeal(data, name);
    if (id) setPage({ id });
  };
  const ctx = { data, open, set: (edit) => setPage({ id: open.id, edit }), fold: () => setPage(null), app };
  const search = query !== null && html`<${Search} data=${data} query=${query} setQuery=${setQuery} onCreate=${create} />`;
  if (desktop) {
    return html`<${Layout}
      desktop
      nav=${nav}
      deck=${deck}
      side=${open && html`<div class="px-2"><${Head} ...${ctx} onTap=${() => toggle(open.id)} /><${Meal} key=${open.id} ...${ctx} /></div>`}
      main=${html`${search && html`<div class="mb-6 w-[366px]">${search}</div>`}<${Columns} data=${data} query=${query} open=${open?.id} onOpen=${toggle} />`}
    />`;
  }
  return html`<${Layout} nav=${nav} head=${html`<${DeckHead}>${deck}</${DeckHead}>`} body=${html`${search}<${List} ...${ctx} query=${query} onTap=${toggle} />`} />`;
}

// List is every meal, alphabetical, or, searching, the closest to what is
// typed; the open one unfolds under its row.
function List({ data, open, onTap, query, ...ctx }) {
  const all = query?.trim() ? rank(query.trim(), meals.meals(data)) : meals.meals(data);
  if (!all.length) return query?.trim() ? null : html`<${Empty} text="No meals yet" />`;
  return all.map((m) =>
    m.id === open?.id
      ? html`<div key=${m.id}>
          <${Head} data=${data} open=${open} onTap=${() => onTap(m.id)} ...${ctx} />
          <${Unfold} key=${"open" + m.id}><${Meal} data=${data} open=${open} ...${ctx} /></${Unfold}>
        </div>`
      : html`<${Row} key=${m.id} name=${m.name} onClick=${() => onTap(m.id)} />`,
  );
}

// Head is the open meal's row on frosted gold (a tap folds it), or, renaming,
// the field it turns into.
function Head({ data, open, onTap, set }) {
  const meal = data.get("meals", open.id);
  const ref = useRef(null);
  // opened from elsewhere (the plan's Edit), it may be out of sight
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest" }), [open.id]);
  if (open.edit?.name === "rename") return html`<${Rename} key=${meal.id} data=${data} meal=${meal} onDone=${() => set(null)} />`;
  return html`<div ref=${ref}><${Row} name=${meal.name} selected onClick=${onTap} /></div>`;
}

// Meal is what an open meal unfolds: its ingredients, each a tap away from
// the item picker filled with it (and Remove from meal); a + for another; then
// Place · Rename · Delete (with an undo).
function Meal({ data, open, set, fold, app }) {
  const meal = data.get("meals", open.id);
  const edit = open.edit;
  const done = () => set(null);
  const del = async () => {
    const undo = await meals.deleteMeal(data, meal.id);
    fold();
    toast({ text: `${meal.name} deleted`, action: "Undo", onAction: undo });
  };
  return html`
    ${meals.ingredients(data, meal.id).map((n) =>
      edit?.name === "ingredient" && edit.id === n.id
        ? html`<div key=${n.id} class="py-1">
            <${ItemPicker}
              data=${data}
              inPlace
              onAway=${done}
              initial=${`${n.item.name.toLowerCase()} ${typed(n.amount, n.item.unit)}`.trim()}
              onPick=${(p) => meals.setIngredient(data, meal.id, n.id, p).then(done)}
              after=${html`<div class="flex"><${Action} icon="close" label="Remove from meal" tone="pink" onClick=${() => meals.removeIngredient(data, n.id).then(done)} /></div>`}
            />
          </div>`
        : html`<${Row}
            key=${n.id}
            name=${n.item.name}
            amount=${format(n.amount, n.item.unit)}
            tone=${meals.toneOf(data, n.item)}
            onClick=${() => set({ name: "ingredient", id: n.id })}
          />`,
    )}
    ${edit?.name === "add"
      ? html`<div class="pt-2"><${ItemPicker} data=${data} inPlace onAway=${done} onPick=${(p) => meals.setIngredient(data, meal.id, null, p).then(done)} /></div>`
      : html`<${AddRow} label="Add ingredient" onClick=${() => set({ name: "add" })} />`}
    <div class="flex gap-2 pt-2 pb-2">
      <${Action} icon="plus" label="Place" onClick=${() => app.place(meal.id)} />
      <${Action} icon="edit" label="Rename" onClick=${() => set({ name: "rename" })} />
      <${Action} icon="close" label="Delete" tone="pink" onClick=${del} />
    </div>
  `;
}

// Search is the field in place, under the deck: Create first (unless a meal
// has that name); the meals under it follow what is typed, and open there. an
// empty field that loses focus closes it, as the key does.
function Search({ data, query, setQuery, onCreate }) {
  const name = query.trim();
  const fresh = name && !meals.meals(data).some((m) => same(m.name, name));
  return html`
    <div class="widen"><${Field} icon="search" value=${query} onInput=${setQuery} autofocus enterkeyhint="go" onBlur=${() => !query.trim() && setQuery(null)} /></div>
    ${fresh && html`<div class="pt-2"><${Block} tone="sky" fill="soft" text=${`Create “${name}”`} leading="plus" onClick=${() => onCreate(name)} /></div>`}
    <div class="pt-2"></div>
  `;
}

// Rename is the gold row turned into a field: saved a moment after typing
// stops and when folding (an empty or taken name is not saved); done, or a tap
// outside, folds it back.
function Rename({ data, meal, onDone }) {
  const [name, setName] = useState(meal.name);
  const latest = useRef(name);
  const ref = useRef(null);
  latest.current = name;
  useAway(ref, onDone);
  useEffect(() => {
    const t = setTimeout(() => meals.renameMeal(data, meal.id, name), 600);
    return () => clearTimeout(t);
  }, [name]);
  useEffect(() => () => meals.renameMeal(data, meal.id, latest.current), []);
  return html`<div ref=${ref} class="py-[7px]">
    <${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" onKeyDown=${(e) => e.key === "Enter" && onDone()} />
  </div>`;
}

// the desktop's meal blocks: the open one gold, the others along sky · pink ·
// periwinkle
const cardTones = ["sky", "pink", "periwinkle"];
const COLUMN = 260;
const GAP = 24;

// Columns lays every meal (or the searched ones) out as on the list: its name
// on a Block, its ingredients under it; alphabetical, left to right.
function Columns({ data, query, open, onOpen }) {
  const box = useRef(null);
  const [n, setN] = useState(4);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setN(Math.max(1, Math.floor((e.contentRect.width + GAP) / (COLUMN + GAP)))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const all = query?.trim() ? rank(query.trim(), meals.meals(data)) : meals.meals(data);
  const cols = Array.from({ length: n }, () => []);
  all.forEach((m, i) => cols[i % n].push({ m, tone: m.id === open ? "gold" : cardTones[i % cardTones.length] }));
  return html`<div ref=${box} class="flex items-start gap-6">
    ${!all.length && html`<${Empty} text="No meals yet" />`}
    ${cols.map(
      (col) => html`<div class="flex min-w-0 flex-1 flex-col gap-6">
        ${col.map(({ m, tone }) => {
          const ins = meals.ingredients(data, m.id);
          return html`<button key=${m.id} type="button" class="flex flex-col text-left" onClick=${() => onOpen(m.id)}>
            <${Block} tone=${tone} text=${m.name} trailing=${html`<${Ticks} />`} />
            ${ins.map(
              (x) => html`<${Row} key=${x.id} name=${x.item.name} amount=${format(x.amount, x.item.unit)} tone=${meals.toneOf(data, x.item)} />`,
            )}
          </button>`;
        })}
      </div>`,
    )}
  </div>`;
}
