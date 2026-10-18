// the list (m17): shopping (tick, clear and its undo) and editing (adding
// under a group, dragging into one, the path in place).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import { engines, kitchen, open, press, synced, tap, type } from "./kitchen.js";

for (const [engine, launch] of Object.entries(engines)) {
  describe(`list (${engine})`, () => {
    let browser, k, page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    after(() => k?.stop());
    const fresh = async () => {
      k?.stop();
      k = await kitchen();
      page = await open(browser, k.url);
      await tap(page, "List");
    };
    const list = () => k.op("list", "show");
    const bought = () => list().split("Bought")[1] || "";

    test("a tap ticks an item", async () => {
      await fresh();
      await tap(page, "Spinach");
      await synced(page);
      assert.match(bought(), /Spinach/);
    });

    test("clear, and its undo", async () => {
      await fresh();
      await press(page, "Clear the list");
      await tap(page, "Undo");
      await synced(page);
      assert.match(list(), /Spinach/);
    });

    test("editing: an item added under a group takes it", async () => {
      await fresh();
      await press(page, "Edit the list");
      await press(page, "Add to Dairy");
      await type(page, "butter 250g");
      await tap(page, "Butter");
      await synced(page);
      assert.match(list(), /Dairy\n\s+Butter\s+250 g/);
    });

    test("editing: an item dragged into another group", async () => {
      await fresh();
      await press(page, "Edit the list");
      const from = await page.getByLabel("Move Spinach", { exact: true }).boundingBox();
      const to = await page.getByText("Dairy", { exact: true }).first().boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y + 20, { steps: 5 });
      await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 });
      await page.mouse.up();
      await synced(page);
      assert.match(list(), /Dairy\n\s+Spinach/);
    });

    test("the path: rename, delete and its undo, a new group", async () => {
      await fresh();
      await press(page, "Edit the list");
      await press(page, "The path");
      await press(page, "Bakery");
      await type(page, "Bread & cakes", { replace: true });
      await page.keyboard.press("Enter");
      await press(page, "Pantry");
      await tap(page, "Delete group");
      await tap(page, "Undo");
      await press(page, "New group");
      await type(page, "Freezer");
      await page.keyboard.press("Enter");
      await synced(page);
      const groups = k.op("group", "list");
      assert.match(groups, /Bread & cakes/);
      assert.match(groups, /Pantry/);
      assert.match(groups, /5\s+\S+\s+Freezer/);
    });
  });
}
