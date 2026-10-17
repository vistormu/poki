package ui

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
)

// every local file index.html and the js modules point to is there: a missing
// one is a blank app on the phone, not a failing build.
func TestEveryReferenceIsThere(t *testing.T) {
	static := Static()
	index, err := fs.ReadFile(static, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	refs := regexp.MustCompile(`(?:href|src)="(/[^"]*)"|"(/js/[^"]*)"`).FindAllStringSubmatch(string(index), -1)
	if len(refs) < 5 {
		t.Fatalf("found %d references in index.html, want the css, app.js and the import map's three", len(refs))
	}
	check := func(from, path string) {
		if _, err := fs.Stat(static, strings.TrimPrefix(path, "/")); err != nil {
			t.Errorf("%s points to %s, which is not there", from, path)
		}
	}
	for _, r := range refs {
		check("index.html", r[1]+r[2])
	}

	// relative imports between our modules (bare ones go through the import map)
	imports := regexp.MustCompile(`from\s*"(\.[^"]+)"`)
	err = fs.WalkDir(static, "js", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".js") || strings.HasPrefix(path, "js/vendor/") {
			return err
		}
		src, err := fs.ReadFile(static, path)
		if err != nil {
			return err
		}
		dir := path[:strings.LastIndex(path, "/")]
		for _, m := range imports.FindAllStringSubmatch(string(src), -1) {
			check(path, "/"+cleanJoin(dir, m[1]))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func cleanJoin(dir, rel string) string {
	parts := strings.Split(dir, "/")
	for _, p := range strings.Split(rel, "/") {
		switch p {
		case ".":
		case "..":
			parts = parts[:len(parts)-1]
		default:
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, "/")
}
