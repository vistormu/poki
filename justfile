preact-version := "10.29.8"
htm-version := "3.1.1"

run: css
    go run . run

test: test-js
    go test -race ./...

# the client's pure modules (sync, outbox, …), without a browser
test-js:
    node --test 'view/ui/test/*.test.js'

# the milestone gate
check: lint css-check test

# gofmt over the go files git knows about (tracked and new, minus ignored), then vet
lint:
    #!/usr/bin/env bash
    set -euo pipefail
    files=$(git ls-files --cached --others --exclude-standard '*.go' | while read -r f; do [ -f "$f" ] && echo "$f"; done)
    unformatted=$(gofmt -l $files)
    if [ -n "$unformatted" ]; then echo "gofmt needed (run: gofmt -w <file>):"; echo "$unformatted"; exit 1; fi
    go vet ./...

# re-download the pinned vendor modules, verifying each against a second cdn
vendor:
    #!/usr/bin/env bash
    set -euo pipefail
    dir=view/ui/static/js/vendor
    for f in preact@{{preact-version}}/dist/preact.module.js preact@{{preact-version}}/hooks/dist/hooks.module.js htm@{{htm-version}}/dist/htm.module.js; do
        out="$dir/$(basename "$f")"
        curl -sf "https://unpkg.com/$f" -o "$out"
        if [ "$(sha256sum < "$out" | cut -d' ' -f1)" != "$(curl -sf "https://cdn.jsdelivr.net/npm/$f" | sha256sum | cut -d' ' -f1)" ]; then
            echo "$f: hash mismatch between cdns, removing download" >&2; rm "$out"; exit 1
        fi
        echo "$f ok (sha256 matches across unpkg and jsdelivr)"
    done

# site.css is committed and embedded, so go builds without node. compile it
# after touching input.css or adding a class.
css: _node
    npm run css

css-watch: _node
    npm run css:watch

# fail if the committed site.css is stale against input.css + the sources it
# scans (a new class with no rebuild ships unstyled). builds to a temp file.
css-check: _node
    #!/usr/bin/env bash
    set -euo pipefail
    fresh=$(mktemp "${TMPDIR:-/tmp}/poki-css.XXXXXX")
    trap 'rm -f "$fresh"' EXIT
    npx tailwindcss -i view/ui/static/css/input.css -o "$fresh" --minify 2>/dev/null
    cmp -s "$fresh" view/ui/static/css/site.css || { echo "site.css is stale — run: just css"; exit 1; }
    echo "site.css is current"

# copy the self-hosted fonts out of the pinned @fontsource packages (latin)
fonts: _node
    cp node_modules/@fontsource/chango/files/chango-latin-400-normal.woff2 view/ui/static/fonts/
    cp node_modules/@fontsource/bagel-fat-one/files/bagel-fat-one-latin-400-normal.woff2 view/ui/static/fonts/
    cp node_modules/@fontsource/fredoka/files/fredoka-latin-{600,700}-normal.woff2 view/ui/static/fonts/
    cp node_modules/@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2 view/ui/static/fonts/

# install node_modules from the lockfile when it is missing (it is not synced)
# or was built for another os (tailwind loads native binaries per os/cpu).
_node:
    #!/usr/bin/env bash
    set -euo pipefail
    node -e 'require("@tailwindcss/oxide"); require("@parcel/watcher")' 2>/dev/null && exit 0
    echo "node_modules is missing or built for another os — npm ci for $(uname -sm)"
    npm ci --no-audit --no-fund
