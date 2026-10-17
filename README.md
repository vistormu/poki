# poki

*poki* is toki pona for container, basket: the one you fill at the supermarket. meal
planning and groceries for two people: meals with their ingredients, a day-by-day
plan of lunches and dinners, and a grocery list sorted along our path through the
store. offline-first: it opens and works with no connection.

go + net/http + sqlite, one binary, self-hosted behind tailscale. the phones sync
through `POST /api/sync` (`/healthz` says the server and its db are up).

## dev loop

| recipe       | what it does                              |
| ------------ | ----------------------------------------- |
| `just run`   | start the server on `localhost:8091`      |
| `just test`  | `go test -race ./...`                     |
| `just lint`  | `gofmt` + `go vet`                        |
| `just check` | `lint` + `test`, the gate before a commit |

## cli

| command    | description          |
| ---------- | -------------------- |
| `poki run` | start the web server (migrates the db on boot) |
| `poki migrate` | apply pending migrations, print the version |
| `poki health` | ask the server on `POKI_ADDR` whether it is up and its db answers (`/healthz`); exit 1 if not |
| `poki op group add <name>` | add a group, last on the path |
| `poki op group list` | the groups in path order: position, id, name |
| `poki op group rename <group> <name>` | rename a group; its items stay |
| `poki op group move <group> <position>` | move a group on the path (1 is first) |
| `poki op group rm <group>` | delete a group: its items go to Other, the unused ones go |
| `poki op item add <name> [--unit g\|count\|none] [--group <group>]` | add an item (unit `none` and Other by default) |
| `poki op item list` | the items in path order, Other last: id, name, unit, group |
| `poki op item group <item> <group>` / `<item> --other` | give an item its group, or take it off (it goes if nothing uses it) |
| `poki op item edit <item> [--name] [--unit]` | fix a typo or the unit; amounts stay as they are |
| `poki op item rm <item>` | delete an item; refused while a meal or the list uses it |
| `poki op meal add <name>` | add a meal |
| `poki op meal list` | the meals, alphabetical (no meal is not one) |
| `poki op meal show <meal>` | a meal and its ingredients with their amounts |
| `poki op meal rename <meal> <name>` | rename a meal |
| `poki op meal rm <meal>` | delete a meal and its plan entries; their list entries stay |
| `poki op meal ingredient add <meal> <item> [amount]` | add an item to a meal, the amount in its unit: `200`, `0.5`, `0,5`, `1/2`; none for unit `none` |
| `poki op meal ingredient set <meal> <item> [amount]` | change an ingredient's amount; none takes it away |
| `poki op meal ingredient rm <meal> <item>` | take an item off a meal (it goes if nothing else keeps it) |
| `poki op plan add <date> <slot> <meal>` / `<date> <slot> --no-meal` | place a meal last in a slot (`lunch`, `dinner`), or mark it no meal |
| `poki op plan show [--from <date>] [--days <n>]` | the plan, day by day (today and 7 days by default): ids, meals, marks |
| `poki op plan move <entry> <date> <slot>` | move a planned meal last into another slot |
| `poki op plan swap <entry> <entry>` | swap two planned meals' places |
| `poki op plan rm <entry>` | take a meal or no meal off the plan; its list entries stay |
| `poki op plan mark <entry> <item> buy\|check\|none` | mark a planned meal's ingredient: on the list to buy, to check (?), or off it |
| `poki op list add <item> [amount]` | put an item on the list by hand, to buy |
| `poki op list show` | the list: ? entries with their meal, to buy by group in path order (Other last) with totals, bought |
| `poki op list resolve <entry> buy\|have` | settle a ? entry (its id, or its item when only one ? has it) |
| `poki op list tick <item>` / `untick <item>` | an item to buy is bought, or back to buy |
| `poki op list clear [-y]` | empty the whole list, whatever its state (asks first) |

a row is named by its id, its name (when no other row has it), or the first
characters of its id (4 or more; `list` shows 8). a plan entry only by its id.
dates are `YYYY-MM-DD`.

## env

| var         | default | what              |
| ----------- | ------- | ----------------- |
| `POKI_ADDR` | `:8091` | listen address    |
| `POKI_DB`   | `poki.db` | the sqlite file, created and migrated on boot |
