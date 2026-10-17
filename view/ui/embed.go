// Package ui is the client: the html, js, css and vendored modules the phones
// run, embedded into the binary and served from the root.
package ui

import (
	"embed"
	"io/fs"
)

//go:embed static
var files embed.FS

// Static is the static/ tree, served at /: index.html, js/, css/.
func Static() fs.FS {
	f, err := fs.Sub(files, "static")
	if err != nil {
		panic(err) // only on a bad literal dir name
	}
	return f
}
