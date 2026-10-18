package server

import (
	"encoding/json"
	"io/fs"
	"mime"
	"net/http"

	"poki/view/ui"
)

// the stdlib knows no web manifest: browsers want this type for it (pwa).
func init() { mime.AddExtensionType(".webmanifest", "application/manifest+json") }

// serviceWorker is /sw.js: the worker with this build's version and files
// above it, read once at boot. never cached by the browser: a new version must
// be seen to be installed.
func serviceWorker() http.HandlerFunc {
	version, urls := ui.Shell()
	files, _ := json.Marshal(urls)
	src, err := fs.ReadFile(ui.Static(), "sw.js")
	if err != nil {
		panic(err) // embedded: always there
	}
	body := []byte("const VERSION = \"" + version + "\";\nconst FILES = " + string(files) + ";\n\n")
	body = append(body, src...)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(body)
	}
}

// devWorkerSrc replaces whatever worker a browser kept (run --dev): it takes
// over at once, drops every cached build, unregisters, and reloads the open
// pages if it dropped one, so they load from the server. with nothing cached
// it only unregisters: the app registers it on every launch, and it goes.
const devWorkerSrc = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith("poki-"));
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      if (keys.length) for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
    })(),
  );
});
`

// devWorker is /sw.js in a dev build.
func devWorker(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write([]byte(devWorkerSrc))
}
