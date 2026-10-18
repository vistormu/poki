// the plan, in place (m16): picking a meal, a mark, remove and its undo, move.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import { engines, kitchen, open, press, synced, tap, type, today } from "./kitchen.js";

for (const [engine, launch] of Object.entries(engines)) {
  describe(`plan (${engine})`, () => {
    let browser, k, page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    const fresh = async () => {
      k?.stop();
      k = await kitchen();
      page = await open(browser, k.url);
    };
    after(() => k?.stop());
    const plan = () => k.op("plan", "show", "--from", today, "--days", "1");

    test("a slot's + picks a meal in place", async () => {
      await fresh();
      await press(page, "Add to Lunch");
      await type(page, "ome");
      await tap(page, "Omelette");
      await synced(page);
      assert.match(plan(), /Omelette/);
    });

    test("a planned meal's mark puts it on the list", async () => {
      await fresh();
      await tap(page, "Lasagna");
      await press(page, "Buy"); // the first ingredient: Ground beef
      await synced(page);
      assert.match(plan(), /buy Ground beef 500 g/);
    });

    test("remove, its undo, then remove for good", async () => {
      await fresh();
      await tap(page, "Green salad");
      await tap(page, "Remove");
      await tap(page, "Undo");
      await synced(page);
      assert.match(plan(), /Green salad/);
      await tap(page, "Green salad");
      await tap(page, "Remove");
      await synced(page);
      assert.doesNotMatch(plan(), /Green salad/);
    });

    test("move: a meal into the slot marked no meal", async () => {
      await fresh();
      await tap(page, "Lasagna");
      await tap(page, "Move");
      await page.getByText("Move here", { exact: true }).last().click();
      await synced(page);
      assert.match(plan(), /dinner\s+\S+\s+Lasagna/);
    });
  });
}
