package model

import (
	"crypto/rand"
	"fmt"
)

// NewID makes a random (v4) uuid, the id of every row. phones make their own
// with crypto.randomUUID(), so ids never need the server.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:]) // never fails (crypto/rand)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// ShortID is how the terminal shows an id: enough of it to name the row.
func ShortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
