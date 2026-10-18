// the meals tab (spec → meals; figma, Screens, section Meals): every meal,
// searched in place from the deck's key (Create first); a meal's page, always
// editable and saved at once, and placed on the plan from there; its name;
// the item picker for its ingredients.
// phone: one page at a time. desktop: the meals in columns, the open page in
// the sidebar (decisions/0011).
import { useEffect, useRef, useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Deck } from "../ui/deck.js";
import { Block } from "../ui/block.js";
import { Row } from "../ui/row.js";
import { AddRow } from "../ui/add-row.js";
import { Field } from "../ui/field.js";
import { SubHeader } from "../ui/sub-header.js";
import { Ticks } from "../ui/ticks.js";
import { format, typed } from "../data/amount.js";
import { rank, same } from "../data/match.js";
import * as meals from "../data/meals.js";
import { Layout, DeckHead, Empty } from "./layout.js";
import { ItemPicker } from "./picker.js";
import { toast } from "./toasts.js";

// a page is {name: "meal" | "name" | "pick", id, editing?}, or null for the
// meals themselves.
export function MealsTab({ data, desktop, nav, sync, page, setPage, app }) {
  const [query, setQuery] = useState(null); // null: not searching
  const open = page && data.get("meals", page.id) ? page : null; // gone when deleted elsewhere
  const deck = html`<${Deck} kind="Meals" title="Meals" sync=${sync} onSearch=${() => setQuery(query === null ? "" : null)} />`;
  const go = (p) => setPage(p);

  const create = async (name) => {
    const id = await meals.createMeal(data, name);
    if (!id) return;
    setQuery(null);
    go({ name: "meal", id });
  };
  const search = query !== null && html`<${Search} data=${data} query=${query} setQuery=${setQuery} onCreate=${create} onOpen=${(id) => go({ name: "meal", id })} />`;

  const pageParts = open && parts(data, open, go, app);
  if (desktop) {
    return html`<${Layout}
      desktop
      nav=${nav}
      deck=${deck}
      side=${pageParts && html`${pageParts.head}<div class="px-2">${pageParts.body}</div>`}
      main=${html`${search && html`<div class="mb-6 w-[366px]">${search}</div>`}<${Columns}
          data=${data}
          query=${query}
          open=${open?.id}
          onOpen=${(id) => go({ name: "meal", id })}
        />`}
    />`;
  }
  if (pageParts) return html`<${Layout} nav=${nav} head=${pageParts.head} body=${pageParts.body} />`;
  return html`<${Layout}
    nav=${nav}
    head=${html`<${DeckHead}>${deck}</${DeckHead}>`}
    body=${search || html`<${List} data=${data} onOpen=${(id) => go({ name: "meal", id })} />`}
  />`;
}

// parts are an open page's head (its sub header) and body.
function parts(data, page, go, app) {
  const meal = data.get("meals", page.id);
  const toMeal = () => go({ name: "meal", id: meal.id });
  if (page.name === "name") {
    return {
      head: html`<${SubHeader} title="Name" subtitle=${meal.name.toUpperCase()} onBack=${toMeal} />`,
      body: html`<${Rename} data=${data} meal=${meal} />`,
    };
  }
  if (page.name === "pick") {
    const n = page.editing && data.get("ingredients", page.editing);
    const item = n && data.get("items", n.item_id);
    const pick = async (p) => {
      await meals.setIngredient(data, meal.id, n ? n.id : null, p);
      toMeal();
    };
    const remove = async () => {
      await meals.removeIngredient(data, n.id);
      toMeal();
    };
    return {
      head: html`<${SubHeader} title=${item ? item.name : "Add ingredient"} subtitle=${meal.name.toUpperCase()} onBack=${toMeal} />`,
      body: html`<${ItemPicker}
        key=${page.editing || "new"}
        data=${data}
        initial=${item ? `${item.name.toLowerCase()} ${typed(n.amount, item.unit)}`.trim() : ""}
        onPick=${pick}
        after=${item && html`<${Block} tone="pink" fill="soft" text="Remove from meal" leading="close" onClick=${remove} />`}
      />`,
    };
  }
  const del = async () => {
    const undo = await meals.deleteMeal(data, meal.id);
    go(null);
    toast({ text: `${meal.name} deleted`, action: "Undo", onAction: undo });
  };
  return {
    head: html`<${SubHeader}
      title=${meal.name}
      onBack=${() => go(null)}
      actions=${[{ icon: "edit", label: "Rename", onClick: () => go({ name: "name", id: meal.id }) }]}
    />`,
    body: html`
      ${meals.ingredients(data, meal.id).map(
        (n) => html`<${Row}
          key=${n.id}
          name=${n.item.name}
          amount=${format(n.amount, n.item.unit)}
          tone=${meals.toneOf(data, n.item)}
          trailing="chevron"
          onClick=${() => go({ name: "pick", id: meal.id, editing: n.id })}
        />`,
      )}
      <${AddRow} label="Add ingredient" onClick=${() => go({ name: "pick", id: meal.id, editing: null })} />
      <div class="flex flex-col gap-2 pt-6">
        <${Block} tone="gold" fill="soft" text="Place on the plan" leading="plus" onClick=${() => app.place(meal.id)} />
        <${Block} tone="pink" fill="soft" text="Delete meal" leading="close" onClick=${del} />
      </div>
    `,
  };
}

// List is every meal, alphabetical; a meal opens its page.
function List({ data, onOpen }) {
  const all = meals.meals(data);
  if (!all.length) return html`<${Empty} text="No meals yet" />`;
  return all.map((m) => html`<${Row} key=${m.id} name=${m.name} trailing="chevron" onClick=${() => onOpen(m.id)} />`);
}

// Search is the field in place, under the deck: Create first (unless a meal
// has that name), then the closest meals. an empty field that loses focus
// closes it, as the key does.
function Search({ data, query, setQuery, onCreate, onOpen }) {
  const name = query.trim();
  const found = rank(name, meals.meals(data));
  const fresh = name && !found.some((m) => same(m.name, name));
  return html`
    <${Field} icon="search" value=${query} onInput=${setQuery} autofocus enterkeyhint="go" onBlur=${() => !query.trim() && setQuery(null)} />
    ${fresh && html`<div class="pt-2"><${Block} tone="sky" fill="soft" text=${`Create “${name}”`} leading="plus" onClick=${() => onCreate(name)} /></div>`}
    <div class="pt-2">${found.map((m) => html`<${Row} key=${m.id} name=${m.name} trailing="chevron" onClick=${() => onOpen(m.id)} />`)}</div>
  `;
}

// Rename edits the name in place, saved a moment after typing stops and when
// leaving; an empty or taken name is not saved.
function Rename({ data, meal }) {
  const [name, setName] = useState(meal.name);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => {
    const t = setTimeout(() => meals.renameMeal(data, meal.id, name), 600);
    return () => clearTimeout(t);
  }, [name]);
  useEffect(() => () => meals.renameMeal(data, meal.id, latest.current), []);
  return html`<${Field} value=${name} onInput=${setName} autofocus enterkeyhint="done" />`;
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
              (x, j) => html`<${Row} key=${x.id} name=${x.item.name} amount=${format(x.amount, x.item.unit)} tone=${meals.toneOf(data, x.item)} divider=${j < ins.length - 1} />`,
            )}
          </button>`;
        })}
      </div>`,
    )}
  </div>`;
}
