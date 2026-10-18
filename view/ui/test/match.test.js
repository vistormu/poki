import { test } from "node:test";
import assert from "node:assert/strict";

import { fold, same, rank, capital } from "../static/js/data/match.js";

const names = (rows) => rows.map((r) => r.name);
const items = ["Mozzarella", "Plátano", "Tomate", "Tomato sauce", "Limón", "Green salad", "Lasagna", "Lamb curry", "Salt", "Sliced bread"].map((name) => ({ name }));

test("fold: case, accents, spaces", () => {
  assert.equal(fold("  Plátano   Macho "), "platano macho");
  assert.equal(fold("LIMÓN"), "limon");
});

test("same: an exact match, as far as typing can tell", () => {
  assert.ok(same("mozzarella", "Mozzarella"));
  assert.ok(same("platano", "plátano"));
  assert.ok(same("tomates", "Tomate"));
  assert.ok(same("limones", "limón"));
  assert.ok(!same("mozz", "mozzarella"));
  assert.ok(!same("tomato", "tomate"));
});

test("rank: the same, a prefix, inside, a typo; then alphabetical", () => {
  const cases = [
    ["la", ["Lamb curry", "Lasagna", "Green salad", "Mozzarella", "Plátano"]], // figma's example, and the rest that hold "la"
    ["mozz", ["Mozzarella"]],
    ["mozarella", ["Mozzarella"]], // a typo
    ["mozzarela", ["Mozzarella"]],
    ["platano", ["Plátano"]],
    ["tomates", ["Tomate", "Tomato sauce"]], // the plural first, then the prefix
    ["limones", ["Limón"]],
    ["sal", ["Salt", "Green salad"]], // a word's start, then inside
    ["bread", ["Sliced bread"]],
    ["xyz", []],
    ["", []],
    ["   ", []],
  ];
  for (const [q, want] of cases) assert.deepEqual(names(rank(q, items)), want, q);
});

test("rank: short queries take no typos", () => {
  assert.deepEqual(names(rank("sx", items)), []);
  assert.deepEqual(names(rank("salr", items)), ["Salt"]); // four letters: one typo
});

test("capital", () => {
  assert.equal(capital("mozz"), "Mozz");
  assert.equal(capital("ñame"), "Ñame");
  assert.equal(capital(""), "");
});
