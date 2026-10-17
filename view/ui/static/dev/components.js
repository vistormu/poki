// /dev/components: every component in every variant, in figma's order (page
// Components), to compare with figma side by side.
import { render } from "preact";
import { useState } from "preact/hooks";

import { html } from "/js/ui/html.js";
import { Icon } from "/js/ui/icon.js";
import { SyncLight } from "/js/ui/sync-light.js";
import { Stripes } from "/js/ui/stripes.js";
import { Day } from "/js/ui/day.js";
import { Amount } from "/js/ui/amount.js";
import { Mark } from "/js/ui/mark.js";
import { Tick } from "/js/ui/tick.js";
import { Tab } from "/js/ui/tab.js";
import { Position } from "/js/ui/position.js";
import { Block } from "/js/ui/block.js";
import { Deck } from "/js/ui/deck.js";
import { Row } from "/js/ui/row.js";
import { IconButton } from "/js/ui/icon-button.js";
import { IngredientRow } from "/js/ui/ingredient-row.js";
import { SubHeader } from "/js/ui/sub-header.js";
import { AddRow } from "/js/ui/add-row.js";
import { TabBar } from "/js/ui/tab-bar.js";
import { TabRail } from "/js/ui/tab-rail.js";
import { Toast } from "/js/ui/toast.js";
import { Field } from "/js/ui/field.js";

const icons = ["plus", "chevron", "no-meal", "search", "reel", "check", "move", "swap", "edit", "back", "close", "rewind", "forward", "eject"];
const tones = ["sky", "pink", "gold", "periwinkle", "orchid"];
const tabs = ["Plan", "List", "Meals"];
const week = ["M", "T", "W", "T", "F", "S", "S"].map((letter, i) => ({ letter, number: 12 + i, state: i === 5 ? "picked" : "default" }));

function Section({ title, children }) {
  return html`<section class="flex flex-col gap-4">
    <h2 class="type-heading">${title}</h2>
    <div class="flex flex-wrap items-start gap-6">${children}</div>
  </section>`;
}

const Col = ({ children }) => html`<div class="flex w-[366px] flex-col gap-3">${children}</div>`;

function Live() {
  const [mark, setMark] = useState("none");
  const [tick, setTick] = useState(false);
  const [text, setText] = useState("lasa");
  return html`<${Col}>
    <${IngredientRow} name="Mozzarella" detail="200 g" mark=${mark} onMark=${setMark} />
    <${Row} name="Mozzarella" amount="325 g" tick=${tick} onClick=${() => setTick(!tick)} />
    <${Field} icon="search" value=${text} onInput=${setText} />
    <${Field} value="200" unit="g" inputmode="decimal" />
  </${Col}>`;
}

function Page() {
  return html`<main class="mx-auto flex max-w-[1200px] flex-col gap-10 p-6">
    <h1 class="type-display">poki — components</h1>

    <${Section} title="Icons">
      ${icons.map((n) => html`<span class=${n === "reel" ? "rounded-full bg-dusk p-1" : ""}><${Icon} name=${n} /></span>`)}
    </${Section}>

    <${Section} title="Sync light">
      ${["synced", "waiting", "off"].map((s) => html`<${SyncLight} status=${s} />`)}
    </${Section}>

    <${Section} title="Stripes"><${Stripes} class="w-[240px]" /></${Section}>

    <${Section} title="Day">
      ${["default", "today", "picked"].map((s) => html`<${Day} letter="S" number="17" state=${s} />`)}
    </${Section}>

    <${Section} title="Amount">${tones.map((t) => html`<${Amount} value="325 g" tone=${t} />`)}</${Section}>

    <${Section} title="Mark · Tick">
      ${["none", "buy", "check"].map((v) => html`<${Mark} value=${v} />`)}
      <${Tick} on=${false} /><${Tick} on=${true} />
    </${Section}>

    <${Section} title="Tab">
      <div class="flex rounded-full bg-dusk p-2"><${Tab} label="Plan" /></div>
      <div class="flex rounded-full bg-dusk p-2"><${Tab} label="Plan" on /></div>
    </${Section}>

    <${Section} title="Position · Block">
      <${Position} n=${1} />
      <${Col}>
        ${tones.map((t) => html`<${Block} tone=${t} text="Lunch" />`)}
        ${tones.map((t) => html`<${Block} tone=${t} fill="soft" text="Lunch" />`)}
        <${Block} tone="sky" text="Dairy" leading=${html`<${Position} n=${1} />`} trailing=${html`<${Icon} name="chevron" />`} />
        <${Block} tone="orchid" fill="soft" text="No meal" leading="no-meal" trailing="close" />
        <${Block} tone="sky" fill="soft" text="Create “lasagna”" leading="plus" />
        <${Block} tone="gold" fill="soft" text="Move here" leading="move" />
      </${Col}>
    </${Section}>

    <${Section} title="Deck">
      <div class="w-[366px]"><${Deck} kind="List" title="List" /></div>
      <div class="w-[366px]"><${Deck} kind="Plan" title="Today" subtitle="SAT 17 OCT" days=${week} sync=${{ status: "waiting", syncing: true }} /></div>
      <div class="w-[366px]"><${Deck} kind="Meals" title="Meals" sync=${{ status: "off" }} /></div>
    </${Section}>

    <${Section} title="Row">
      <${Col}>
        <${Row} name="Mozzarella" amount="325 g" />
        <${Row} name="Mozzarella" amount="325 g" selected />
        <${Row} name="Lasagna" trailing="chevron" />
        <${Row} name="Toilet paper" tick=${false} />
        <${Row} name="Bread" amount="2" tone="pink" tick=${true} />
      </${Col}>
    </${Section}>

    <${Section} title="Icon button">
      <${IconButton} icon="back" label="Back" />
      <${IconButton} icon="move" label="Move" />
      <${IconButton} icon="edit" label="Edit" />
    </${Section}>

    <${Section} title="Ingredient row">
      <${Col}><${IngredientRow} name="Mozzarella" detail="200 g" mark="none" /></${Col}>
    </${Section}>

    <${Section} title="Sub header">
      <div class="w-[390px]">
        <${SubHeader} title="Lasagna" subtitle="LUNCH · SAT 17 OCT" actions=${[{ icon: "move", label: "Move" }, { icon: "edit", label: "Edit" }]} />
      </div>
    </${Section}>

    <${Section} title="Add row"><${Col}><${AddRow} /></${Col}></${Section}>

    <${Section} title="Tab bar">
      <div class="flex w-[358px] flex-col gap-4">${tabs.map((t) => html`<${TabBar} tabs=${tabs} active=${t} onPick=${() => {}} />`)}</div>
    </${Section}>

    <${Section} title="Tab rail">
      ${tabs.map((t) => html`<div class="w-[240px]"><${TabRail} tabs=${tabs} active=${t} onPick=${() => {}} /></div>`)}
    </${Section}>

    <${Section} title="Toast">
      <${Col}>
        <${Toast} text="Bread couldn’t be saved" action="Undo" />
        <${Toast} kind="error" text="Bread couldn’t be saved" />
      </${Col}>
    </${Section}>

    <${Section} title="Field">
      <${Col}><${Field} icon="search" value="lasa" /></${Col}>
    </${Section}>

    <${Section} title="Live (tap them)"><${Live} /></${Section}>
  </main>`;
}

render(html`<${Page} />`, document.getElementById("dev"));
