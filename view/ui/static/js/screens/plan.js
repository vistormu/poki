// the plan tab (spec → plan; figma, Screens, section Plan): one day, opening
// on today, its lunch and dinner; the meal picker from a slot's +; a planned
// meal straight onto its marks; moving a meal and placing one from the meals
// tab, chosen on the plan itself. phone: one page at a time. desktop: the
// board of the shown day's week, the open page in the sidebar
// (decisions/0011).
import { useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Deck } from "../ui/deck.js";
import { Block } from "../ui/block.js";
import { Row } from "../ui/row.js";
import { AddRow } from "../ui/add-row.js";
import { Field } from "../ui/field.js";
import { SubHeader } from "../ui/sub-header.js";
import { IngredientRow } from "../ui/ingredient-row.js";
import { Ticks } from "../ui/ticks.js";
import { NO_MEAL } from "../data/data.js";
import { format } from "../data/amount.js";
import { rank, same } from "../data/match.js";
import * as meals from "../data/meals.js";
import * as plan from "../data/plan.js";
import { Layout, DeckHead } from "./layout.js";
import { toast, dismiss } from "./toasts.js";

const slotNames = { lunch: "Lunch", dinner: "Dinner" };
const slotTones = { lunch: "gold", dinner: "periwinkle" };

// a page is {date, open, mode}: the shown day (null: today); open is
// {name: "planned", id} or {name: "pick", date, slot}; mode, while a meal
// is moved or placed, is {kind: "move" | "place", id} (an entry, a meal).
// app opens a meal in the meals tab (✎).
export function PlanTab({ data, desktop, nav, sync, page, setPage, app }) {
  const today = plan.today();
  const date = page?.date || today;
  const open = valid(data, page?.open);
  const mode = page?.mode && validMode(data, page.mode);
  const set = (p) => setPage((old) => ({ date, ...old, ...p }));
  const show = (d) => set({ date: d });

  const startMove = (id) => {
    const e = data.get("plan_entries", id);
    setPage({ date: e.date, mode: { kind: "move", id } });
    toast({ text: `Moving ${data.get("meals", e.meal_id).name}`, action: "Cancel", onAction: () => set({ mode: null }), stay: true });
  };
  const end = () => {
    dismiss();
    set({ mode: null });
  };
  const act = {
    open: (o) => set({ open: o }),
    pick: (d, slot) => set({ open: { name: "pick", date: d, slot } }),
    planned: (id) => set({ open: { name: "planned", id } }),
    swap: async (id) => {
      await plan.swap(data, mode.id, id);
      end();
    },
    here: async (d, slot) => {
      if (mode.kind === "move") {
        await plan.move(data, mode.id, d, slot);
        return end();
      }
      await plan.place(data, d, slot, mode.id);
      end();
    },
  };

  const days = plan.week(date).map((d) => ({
    letter: plan.local(d).toLocaleDateString("en-GB", { weekday: "narrow" }),
    number: plan.local(d).getDate(),
    state: d === date ? "picked" : d === today ? "today" : "default",
    onClick: () => show(d),
  }));
  const deck = html`<${Deck}
    kind="Plan"
    title=${date === today ? "Today" : plan.local(date).toLocaleDateString("en-GB", { weekday: "short" })}
    subtitle=${plan.label(date)}
    sync=${sync}
    days=${days}
    onBack=${() => show(plan.addDays(date, -7))}
    onForward=${() => show(plan.addDays(date, 7))}
  />`;

  const pageParts = open && parts(data, open, { back: () => set({ open: null }), startMove, act, app });
  if (desktop) {
    return html`<${Layout}
      desktop
      nav=${nav}
      deck=${deck}
      side=${pageParts && html`${pageParts.head}<div class="px-2">${pageParts.body}</div>`}
      main=${html`<${Board} data=${data} date=${date} today=${today} open=${open} mode=${mode} act=${act} />`}
    />`;
  }
  if (pageParts) return html`<${Layout} nav=${nav} head=${pageParts.head} body=${pageParts.body} />`;
  return html`<${Layout}
    nav=${nav}
    head=${html`<${DeckHead}>${deck}</${DeckHead}>`}
    body=${html`<${Swipe} onDay=${(n) => show(plan.addDays(date, n))}>
      ${plan.slots.map((slot, i) => html`<div class=${i ? "pt-5" : ""}><${Slot} data=${data} date=${date} slot=${slot} mode=${mode} act=${act} chevrons /></div>`)}
    </${Swipe}>`}
  />`;
}

// valid is the open page, or null when what it shows is gone (deleted, or
// moved off by another phone).
function valid(data, open) {
  if (open?.name === "planned") return data.get("plan_entries", open.id) ? open : null;
  return open || null;
}

function validMode(data, mode) {
  return (mode.kind === "move" ? data.get("plan_entries", mode.id) : data.get("meals", mode.id)) ? mode : null;
}

// Swipe moves a day at a time with a sideways swipe across the day.
function Swipe({ onDay, children }) {
  const [start, setStart] = useState(null);
  const down = (e) => setStart([e.touches[0].clientX, e.touches[0].clientY]);
  const up = (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start[0];
    const dy = e.changedTouches[0].clientY - start[1];
    setStart(null);
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onDay(dx < 0 ? 1 : -1);
  };
  return html`<div class="min-h-full" onTouchStart=${down} onTouchEnd=${up}>${children}</div>`;
}

// Slot is a slot's header and what it holds: its meals, or no meal, then
// its + (nothing after no meal); while moving or placing, Move here or Place
// here instead, and the other meals swap.
function Slot({ data, date, slot, mode, act, chevrons = false }) {
  const inSlot = plan.entries(data, date, slot);
  const noMeal = inSlot.find((p) => p.meal_id === NO_MEAL);
  const rows = inSlot.filter((p) => p.meal_id !== NO_MEAL);
  return html`
    <${Block} tone=${slotTones[slot]} text=${slotNames[slot]} trailing=${html`<${Ticks} />`} />
    <${Meals} rows=${rows} mode=${mode} act=${act} chevrons=${chevrons} />
    ${noMeal &&
    html`<div class="pt-2">
      <${Block} tone="orchid" fill="soft" text="No meal" leading="no-meal" trailing=${chevrons ? "chevron" : null} onClick=${!mode && (() => act.planned(noMeal.id))} />
    </div>`}
    ${mode && html`<div class="pt-2"><${Here} mode=${mode} onClick=${() => act.here(date, slot)} /></div>`}
    ${!mode && !noMeal && html`<div class="pt-2"><${AddRow} label=${`Add to ${slotNames[slot]}`} onClick=${() => act.pick(date, slot)} /></div>`}
  `;
}

// Meals are a slot's meal rows: each opens its planned meal; while moving,
// the one moved is muted and the others swap with it.
function Meals({ rows, mode, act, chevrons, open }) {
  return rows.map((p, i) => {
    const moved = mode?.kind === "move" && p.id === mode.id;
    const swaps = mode?.kind === "move" && !moved;
    const onClick = !mode ? () => act.planned(p.id) : swaps ? () => act.swap(p.id) : null;
    const trailing = swaps ? "swap" : !mode && chevrons ? "chevron" : null;
    return html`<div key=${p.id} class=${moved ? "opacity-40" : ""}>
      <${Row} name=${p.meal.name} trailing=${trailing} selected=${open === p.id} divider=${i < rows.length - 1} onClick=${onClick} />
    </div>`;
  });
}

// Here is Move here or Place here, while a meal is moved or placed.
function Here({ mode, onClick }) {
  const [text, icon] = mode.kind === "move" ? ["Move here", "move"] : ["Place here", "plus"];
  return html`<${Block} tone="gold" fill="soft" text=${text} leading=${icon} onClick=${onClick} />`;
}

// parts are an open page's head (its sub header) and body.
function parts(data, open, { back, startMove, act, app }) {
  if (open.name === "pick") {
    return {
      head: html`<${SubHeader} title=${slotNames[open.slot]} subtitle=${plan.label(open.date)} onBack=${back} />`,
      body: html`<${MealPicker} key=${open.date + open.slot} data=${data} date=${open.date} slot=${open.slot} act=${act} />`,
    };
  }
  const e = data.get("plan_entries", open.id);
  const meal = data.get("meals", e.meal_id);
  const remove = async () => {
    await plan.remove(data, e.id);
    back();
  };
  const noMeal = e.meal_id === NO_MEAL;
  const ins = noMeal ? [] : plan.planned(data, e.id);
  return {
    head: html`<${SubHeader}
      title=${meal.name}
      subtitle=${`${e.slot.toUpperCase()} · ${plan.label(e.date)}`}
      onBack=${back}
      actions=${noMeal
        ? []
        : [
            { icon: "move", label: "Move", onClick: () => startMove(e.id) },
            { icon: "edit", label: "Edit meal", onClick: () => app.toMeal(meal.id) },
          ]}
    />`,
    body: html`
      ${ins.map(
        (n, i) => html`<${IngredientRow}
          key=${n.id}
          name=${n.item.name}
          detail=${format(n.amount, n.item.unit)}
          mark=${n.mark}
          onMark=${(v) => plan.mark(data, e.id, n, v)}
          divider=${i < ins.length - 1}
        />`,
      )}
      <div class=${ins.length ? "pt-6" : ""}><${Block} tone="pink" fill="soft" text="Remove from plan" leading="close" onClick=${remove} /></div>
    `,
  };
}

// MealPicker places a meal in a slot and goes back to the day (figma: Meal
// picker): Create first (unless a meal has the typed name), then No meal (an
// empty slot only), then the closest meals, or all of them before anything
// is typed.
function MealPicker({ data, date, slot, act }) {
  const [query, setQuery] = useState("");
  const name = query.trim();
  const all = meals.meals(data);
  const found = name ? rank(name, all) : all;
  const fresh = name && !found.some((m) => same(m.name, name));
  const empty = plan.entries(data, date, slot).length === 0;
  const pick = async (mealID) => {
    if (mealID) await plan.place(data, date, slot, mealID);
    act.open(null);
  };
  return html`
    <${Field} icon="search" value=${query} onInput=${setQuery} autofocus enterkeyhint="go" />
    ${fresh && html`<div class="pt-2"><${Block} tone="sky" fill="soft" text=${`Create “${name}”`} leading="plus" onClick=${async () => pick(await meals.createMeal(data, name))} /></div>`}
    ${empty && html`<div class="pt-2"><${Block} tone="orchid" fill="soft" text="No meal" leading="no-meal" onClick=${() => pick(NO_MEAL)} /></div>`}
    <div class="pt-2">${found.map((m, i) => html`<${Row} key=${m.id} name=${m.name} divider=${i < found.length - 1} onClick=${() => pick(m.id)} />`)}</div>
  `;
}

// Board is the desktop's plan (figma: Plan — Desktop): the shown day's week
// under quiet date labels (today in full ink, a gold mark), then Lunch and
// Dinner, each half the height, every other day on a faint paper wash.
function Board({ data, date, today, open, mode, act }) {
  const days = plan.week(date);
  const openID = open?.name === "planned" ? open.id : null;
  return html`<div class="flex h-full min-h-fit flex-col">
    <div class="flex pb-2">
      ${days.map(
        (d) => html`<div class="flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1">
          <span class="type-mono-small ${d === today ? "" : "opacity-60"}">${plan.label(d, true)}</span>
          ${d === today && html`<span class="h-[3px] w-6 rounded-[2px] bg-gold"></span>`}
        </div>`,
      )}
    </div>
    ${plan.slots.map(
      (slot, i) => html`<section class="flex flex-1 flex-col gap-2 ${i ? "pt-4" : ""}">
        <${Block} tone=${slotTones[slot]} text=${slotNames[slot]} trailing=${html`<${Ticks} />`} />
        <div class="flex flex-1">
          ${days.map((d, j) => html`<${Cell} data=${data} date=${d} slot=${slot} wash=${j % 2 === 1} open=${openID} mode=${mode} act=${act} />`)}
        </div>
      </section>`,
    )}
  </div>`;
}

// Cell is one day's slot on the board: its meals (no chevrons), or no meal
// centred like a meal row, then its +, or Move here / Place here.
function Cell({ data, date, slot, wash, open, mode, act }) {
  const inSlot = plan.entries(data, date, slot);
  const noMeal = inSlot.find((p) => p.meal_id === NO_MEAL);
  const rows = inSlot.filter((p) => p.meal_id !== NO_MEAL);
  return html`<div class="flex min-w-0 flex-1 flex-col gap-2 rounded-sm px-2 pt-2 ${wash ? "bg-paper/40" : ""}">
    ${rows.length > 0 && html`<div><${Meals} rows=${rows} mode=${mode} act=${act} open=${open} /></div>`}
    ${noMeal &&
    html`<div class="flex h-[54px] items-center">
      <${Block} tone=${open === noMeal.id ? "gold" : "orchid"} fill="soft" text="No meal" leading="no-meal" onClick=${!mode && (() => act.planned(noMeal.id))} />
    </div>`}
    ${mode && html`<${Here} mode=${mode} onClick=${() => act.here(date, slot)} />`}
    ${!mode && !noMeal && html`<${AddRow} label=${`Add to ${slotNames[slot]}`} onClick=${() => act.pick(date, slot)} />`}
  </div>`;
}
