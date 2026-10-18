// the item picker (spec → the item picker, decisions/0006, 0012): name and
// amount typed together; the closest items first; last, the typed name as a
// new item, unless an item has that name. a meal's ingredients use it, and
// the list's adding by hand will.
import { useState } from "preact/hooks";

import { html } from "../ui/html.js";
import { Field } from "../ui/field.js";
import { Row } from "../ui/row.js";
import { parse, format } from "../data/amount.js";
import { rank, same, capital } from "../data/match.js";
import { toneOf } from "../data/meals.js";

const SHOW = 12;

// ItemPicker calls onPick with {item, amount} or a new {name, unit, amount}.
// initial fills the field (changing an ingredient); after goes below the rows.
export function ItemPicker({ data, initial = "", onPick, after }) {
  const [text, setText] = useState(initial);
  const typed = parse(text);
  const found = rank(typed.name, data.all("items")).slice(0, SHOW);
  const fresh = typed.name && !found.some((it) => same(it.name, typed.name));
  const rows = [
    ...found.map((it) => ({
      key: it.id,
      name: it.name,
      amount: it.unit === "none" ? "" : format(typed.amount, it.unit),
      tone: toneOf(data, it),
      pick: () => onPick({ item: it, amount: typed.amount }),
    })),
    ...(fresh
      ? [
          {
            key: "new",
            name: capital(typed.name),
            amount: format(typed.amount, typed.unit),
            tone: toneOf(data, null),
            trailing: "plus",
            pick: () => onPick({ name: typed.name, unit: typed.unit, amount: typed.amount }),
          },
        ]
      : []),
  ];
  return html`
    <${Field} icon="search" value=${text} onInput=${setText} autofocus enterkeyhint="done" />
    <div class="pt-2">
      ${rows.map(
        (r) => html`<${Row} key=${r.key} name=${r.name} amount=${r.amount} tone=${r.tone} trailing=${r.trailing} onClick=${r.pick} />`,
      )}
    </div>
    ${after && html`<div class="pt-6">${after}</div>`}
  `;
}
