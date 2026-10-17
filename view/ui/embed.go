// Package ui is the client: the html, js, css and vendored modules the phones
// run, embedded into the binary and served from the root.
package ui

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"slices"
	"strings"
)

//go:embed static
var files embed.FS

// Static is the static/ tree, served at /: index.html, js/, css/, icons/.
func Static() fs.FS {
	f, err := fs.Sub(files, "static")
	if err != nil {
		panic(err) // only on a bad literal dir name
	}
	return f
}

// notCached are the static files the app never asks for: the service worker
// (served apart, with the version) and tailwind's input.
var notCached = []string{"sw.js", "css/input.css"}

// Shell is what the service worker keeps for opening with no connection
// (technical-design.md → offline): every file the app loads, as urls ("/" is
// index.html), and a version that changes whenever any of them does, so a
// release brings a new cache.
func Shell() (version string, urls []string) {
	h := sha256.New()
	static := Static()
	err := fs.WalkDir(static, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || slices.Contains(notCached, path) {
			return err
		}
		b, err := fs.ReadFile(static, path)
		if err != nil {
			return err
		}
		h.Write([]byte(path + "\x00"))
		h.Write(b)
		if path == "index.html" {
			path = ""
		}
		urls = append(urls, "/"+path)
		return nil
	})
	if err != nil {
		panic(err) // an embed always walks
	}
	slices.SortFunc(urls, strings.Compare)
	return hex.EncodeToString(h.Sum(nil))[:12], urls
}
