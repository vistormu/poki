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

## env

| var         | default | what              |
| ----------- | ------- | ----------------- |
| `POKI_ADDR` | `:8091` | listen address    |
| `POKI_DB`   | `poki.db` | the sqlite file, created and migrated on boot |
