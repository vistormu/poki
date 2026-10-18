import { test } from "node:test";
import assert from "node:assert/strict";

import { parse, format, typed } from "../static/js/data/amount.js";

test("parse: a trailing amount and the unit it implies", () => {
  const cases = [
    ["mozzarella 500g", "mozzarella", 500, "g"],
    ["mozzarella 500 g", "mozzarella", 500, "g"],
    ["Mozzarella 500G", "Mozzarella", 500, "g"],
    ["eggs 6", "eggs", 6, "count"],
    ["onion 0.5", "onion", 0.5, "count"],
    ["onion 0,5", "onion", 0.5, "count"],
    ["onion 1/2", "onion", 0.5, "count"],
    ["  green   beans  200g ", "green beans", 200, "g"],
    ["salt", "salt", null, "none"],
    ["7up", "7up", null, "none"], // a number inside a name is the name
    ["300", "300", null, "none"], // nothing but a number: a name
    ["onion 0", "onion 0", null, "none"],
    ["onion 1/0", "onion 1/0", null, "none"],
    ["", "", null, "none"],
  ];
  for (const [text, name, amount, unit] of cases) {
    assert.deepEqual(parse(text), { name, amount, unit }, text);
  }
});

test("format and typed: as shown and as typed back", () => {
  assert.equal(format(200, "g"), "200 g");
  assert.equal(format(6, "count"), "6");
  assert.equal(format(0.1 + 0.2, "count"), "0.3");
  assert.equal(format(1 / 3, "g"), "0.33 g");
  assert.equal(format(null, "g"), "");
  assert.equal(format(3, "none"), "");
  assert.equal(typed(250, "g"), "250g");
  assert.equal(typed(6, "count"), "6");
  assert.equal(typed(null, "count"), "");
});
