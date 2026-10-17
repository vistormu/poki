package model

// Op is one change a phone made, from its outbox (technical-design.md → sync).
// put creates or changes the row: Fields are its columns, all of them for a
// new row, any of them for one that exists (and it comes back if deleted).
// del deletes it.
type Op struct {
	Op     string         `json:"op"`   // the op's own id: rejected ops are named by it
	Type   string         `json:"type"` // OpPut or OpDel
	Table  string         `json:"table"`
	ID     string         `json:"id"` // the row's
	Fields map[string]any `json:"fields,omitempty"`
}

const (
	OpPut = "put"
	OpDel = "del"
)

// Change is a row as it is now, sent to the phones: every row with a rev past
// theirs, deleted ones too.
type Change struct {
	Table   string         `json:"table"`
	ID      string         `json:"id"`
	Rev     int64          `json:"rev"`
	Deleted bool           `json:"deleted"`
	Fields  map[string]any `json:"fields"`
}

// Row is a row's columns by name, as sync reads and writes them: strings,
// int64, float64, or nil for null.
type Row map[string]any

// SyncTx is one sync's transaction: the ops' reads and writes, all seen by the
// ops after them.
type SyncTx interface {
	// Get is a row, deleted or not; ok is false when it never existed.
	Get(table, id string) (row Row, deleted bool, ok bool, err error)
	// Live are the live rows whose columns equal where's.
	Live(table string, where Row) ([]Row, error)
	// Put writes the columns given (all of a new row's), live, at this rev.
	Put(table, id string, cols Row) error
	// Del tombstones a live row at this rev.
	Del(table, id string) error
	// MayBeUnused hands items to the sweep (decisions/0012).
	MayBeUnused(itemIDs ...string)
}

// Rejected is an op the server refused, and why.
type Rejected struct {
	Op  string
	Err error
}
