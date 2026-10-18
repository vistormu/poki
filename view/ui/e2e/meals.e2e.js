// the meals, in place (m18): search and create, an ingredient changed and
// added, rename, delete and its undo.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import { engines, kitchen, open, press, synced, tap, type } from "./kitchen.js";

for (const [engine, launch] of Object.entries(engines)) {
  describe(`meals (${engine})`, () => {
    let browser, k, page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    after(() => k?.stop());
    const fresh = async () => {
      k?.stop();
      k = await kitchen();
      page = await open(browser, k.url);
      await tap(page, "Meals");
    };
    const meal = (name) => k.op("meal", "show", name);

    test("search, and create from it", async () => {
      await fresh();
      await press(page, "Search");
      await type(page, "Shakshuka");
      await tap(page, "Create “Shakshuka”");
      await synced(page);
      assert.match(k.op("meal", "list"), /Shakshuka/);
    });

    test("an ingredient changed, and one added", async () => {
      await fresh();
      await tap(page, "Lasagna");
      await tap(page, "Mozzarella");
      await type(page, "mozzarella 300", { replace: true });
      await tap(page, "Mozzarella");
      await press(page, "Add ingredient");
      await type(page, "ricotta 250g");
      await tap(page, "Ricotta");
      await synced(page);
      const m = meal("Lasagna");
      assert.match(m, /Mozzarella\s+300 g/);
      assert.match(m, /Ricotta\s+250 g/);
    });

    test("rename", async () => {
      await fresh();
      await tap(page, "Lasagna");
      await tap(page, "Rename");
      await type(page, "Lasagna bolognese", { replace: true });
      await page.keyboard.press("Enter");
      await synced(page);
      assert.match(k.op("meal", "list"), /Lasagna bolognese/);
    });

    test("delete, its undo, then delete for good", async () => {
      await fresh();
      await tap(page, "Omelette");
      await tap(page, "Delete");
      await tap(page, "Undo");
      await synced(page);
      assert.match(k.op("meal", "list"), /Omelette/);
      await tap(page, "Omelette");
      await tap(page, "Delete");
      await synced(page);
      assert.doesNotMatch(k.op("meal", "list"), /Omelette/);
    });
  });
}
