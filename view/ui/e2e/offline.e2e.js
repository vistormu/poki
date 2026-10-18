// offline is not a mode (decisions/0001): what is done with no connection is
// kept on the phone and reaches the server once it is back.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import { engines, kitchen, open, press, synced, tap, type } from "./kitchen.js";

for (const [engine, launch] of Object.entries(engines)) {
  describe(`offline (${engine})`, () => {
    let browser, k;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    after(() => k?.stop());

    test("changes made offline reach the server when it is back", async () => {
      k = await kitchen();
      const page = await open(browser, k.url);
      await page.context().setOffline(true);
      await tap(page, "List");
      await tap(page, "Spinach");
      await tap(page, "Meals");
      await press(page, "Search");
      await type(page, "Shakshuka");
      await tap(page, "Create “Shakshuka”");
      await page.waitForTimeout(2000);
      assert.doesNotMatch(k.op("meal", "list"), /Shakshuka/); // not yet
      await page.context().setOffline(false);
      await synced(page);
      assert.match(k.op("meal", "list"), /Shakshuka/);
      assert.match(k.op("list", "show").split("Bought")[1], /Spinach/);
    });
  });
}
