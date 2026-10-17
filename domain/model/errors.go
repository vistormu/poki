package model

import (
	"errors"
	"fmt"
)

var (
	// ErrNotFound: the thing asked for does not exist, or is deleted.
	ErrNotFound = errors.New("not found")
	// ErrInvalid matches every validation error: errors.Is(err, ErrInvalid).
	ErrInvalid = errors.New("invalid")
	// ErrInUse: a meal or the list still uses it.
	ErrInUse = errors.New("in use")
)

// InvalidError is a validation error whose message is written for people: the
// app shows it in a toast, the terminal prints it.
type InvalidError struct{ Msg string }

func (e InvalidError) Error() string        { return e.Msg }
func (e InvalidError) Is(target error) bool { return target == ErrInvalid }

// Invalid builds an InvalidError, fmt.Sprintf style.
func Invalid(format string, args ...any) error {
	return InvalidError{Msg: fmt.Sprintf(format, args...)}
}
