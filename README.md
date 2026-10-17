# poki

*poki* is toki pona for container, basket: the one you fill at the supermarket. meal
planning and groceries for two people: meals with their ingredients, a day-by-day
plan of lunches and dinners, and a grocery list sorted along our path through the
store. offline-first: it opens and works with no connection.

go + net/http + sqlite, one binary, self-hosted behind tailscale.

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

a row is named by its id, its name (when no other row has it), or the first
characters of its id (4 or more; `list` shows 8).

## env

| var         | default | what              |
| ----------- | ------- | ----------------- |
| `POKI_ADDR` | `:8091` | listen address    |
| `POKI_DB`   | `poki.db` | the sqlite file, created and migrated on boot |
