// Package service holds the use cases. it talks to storage through the
// interfaces it declares, and knows nothing of sql or http.
package service

import (
	"fmt"
	"strings"

	"poki/domain/model"
)

// find picks the row a person means by ref, as typed in the terminal: its id,
// its name (ignoring case) when no other row has it, or the start of its id.
func find[T any](all []T, ref, what string, id, name func(T) string) (T, error) {
	var zero T
	ref = strings.TrimSpace(ref)
	var named, prefixed []T
	for _, r := range all {
		switch {
		case id(r) == ref:
			return r, nil
		case strings.EqualFold(name(r), ref):
			named = append(named, r)
		case len(ref) >= 4 && strings.HasPrefix(id(r), strings.ToLower(ref)):
			prefixed = append(prefixed, r)
		}
	}
	switch {
	case len(named) == 1:
		return named[0], nil
	case len(named) > 1:
		return zero, model.Invalid("%d %s are called “%s”: use the id", len(named), plural(what), ref)
	case len(prefixed) == 1:
		return prefixed[0], nil
	case len(prefixed) > 1:
		return zero, model.Invalid("more than one %s's id starts with %s", what, ref)
	}
	return zero, fmt.Errorf("%s “%s”: %w", what, ref, model.ErrNotFound)
}

// plural is what's plural: groups, entries.
func plural(what string) string {
	if strings.HasSuffix(what, "y") {
		return what[:len(what)-1] + "ies"
	}
	return what + "s"
}

// checkName trims a name and checks it is there and not too long.
func checkName(name, what string, max int) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", model.Invalid("A %s needs a name", what)
	case len([]rune(name)) > max:
		return "", model.Invalid("The name is longer than %d characters", max)
	}
	return name, nil
}
