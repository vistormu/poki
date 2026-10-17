package store

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/jmoiron/sqlx"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"poki/domain/model"
)

// columns are the synced tables' own columns, past id, rev and deleted. they
// are spliced into sql: a name is only ever one of these.
var columns = map[string][]string{
	"groups":       {"name", "position"},
	"items":        {"name", "unit", "group_id"},
	"meals":        {"name"},
	"ingredients":  {"meal_id", "item_id", "amount"},
	"plan_entries": {"date", "slot", "meal_id", "position"},
	"list_entries": {"item_id", "amount", "plan_entry_id", "state"},
}

// Sync runs the ops in one write, each in a savepoint: a rejected op is
// undone alone. then it reads every row past since, in the same transaction.
func (s *Store) Sync(ctx context.Context, since int64, ops []model.Op, apply func(model.SyncTx, model.Op) error,
	rejectable func(error) bool) (rev int64, changes []model.Change, rejected []model.Rejected, err error) {
	if len(ops) == 0 {
		// a poll writes nothing, so it bumps nothing. rev is read first: a
		// write landing between the two reads comes now and again next time
		if rev, err = s.Rev(ctx); err != nil {
			return 0, nil, nil, err
		}
		changes, err = changesSince(ctx, s.db, since)
		return rev, changes, nil, err
	}
	err = s.write(ctx, func(t *tx) error {
		st := &syncTx{ctx: ctx, tx: t}
		for _, op := range ops {
			if _, err := t.ExecContext(ctx, `SAVEPOINT op`); err != nil {
				return err
			}
			before := len(t.mayBeUnused)
			err := apply(st, op)
			if err != nil && (rejectable(err) || isConstraint(err)) {
				if _, err := t.ExecContext(ctx, `ROLLBACK TO op`); err != nil {
					return err
				}
				t.mayBeUnused = t.mayBeUnused[:before]
				rejected = append(rejected, model.Rejected{Op: op.Op, Err: err})
			} else if err != nil {
				return err
			}
			if _, err := t.ExecContext(ctx, `RELEASE op`); err != nil {
				return err
			}
		}
		// the sweep runs before commit, inside write; its rows carry this
		// rev, so read the changes after it
		if err := t.sweep(ctx); err != nil {
			return err
		}
		t.mayBeUnused = nil
		rev = t.rev
		changes, err = changesSince(ctx, t, since)
		return err
	})
	if err != nil {
		return 0, nil, nil, err
	}
	return rev, changes, rejected, nil
}

func changesSince(ctx context.Context, q sqlx.QueryerContext, since int64) ([]model.Change, error) {
	changes := []model.Change{}
	names := make([]string, 0, len(columns))
	for name := range columns {
		names = append(names, name)
	}
	sort.Strings(names) // a stable order; the client applies by table, not order
	for _, table := range names {
		rows, err := q.QueryxContext(ctx, `SELECT id, rev, deleted, `+strings.Join(columns[table], ", ")+
			` FROM `+table+` WHERE rev > ? ORDER BY rev, id`, since)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			r := map[string]any{}
			if err := rows.MapScan(r); err != nil {
				rows.Close()
				return nil, err
			}
			normalize(r)
			c := model.Change{Table: table, ID: r["id"].(string), Rev: r["rev"].(int64), Deleted: r["deleted"].(int64) == 1, Fields: model.Row{}}
			for _, col := range columns[table] {
				c.Fields[col] = r[col]
			}
			changes = append(changes, c)
		}
		if err := rows.Close(); err != nil {
			return nil, err
		}
	}
	return changes, nil
}

// normalize makes sqlite's values sync's: text as string, numbers as int64
// or float64.
func normalize(r map[string]any) {
	for k, v := range r {
		if b, ok := v.([]byte); ok {
			r[k] = string(b)
		}
	}
	// amounts are REAL: a whole one may come back as int64
	if a, ok := r["amount"].(int64); ok {
		r["amount"] = float64(a)
	}
}

func isConstraint(err error) bool {
	var se *sqlite.Error
	return errors.As(err, &se) && se.Code()&0xff == sqlite3.SQLITE_CONSTRAINT
}

// syncTx is model.SyncTx on a write.
type syncTx struct {
	ctx context.Context
	tx  *tx
}

func (s *syncTx) cols(table string) ([]string, error) {
	cols, ok := columns[table]
	if !ok {
		return nil, fmt.Errorf("sync: unknown table %q", table)
	}
	return cols, nil
}

func (s *syncTx) Get(table, id string) (model.Row, bool, bool, error) {
	cols, err := s.cols(table)
	if err != nil {
		return nil, false, false, err
	}
	rows, err := s.tx.QueryxContext(s.ctx, `SELECT id, deleted, `+strings.Join(cols, ", ")+` FROM `+table+` WHERE id = ?`, id)
	if err != nil {
		return nil, false, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false, false, rows.Err()
	}
	r := map[string]any{}
	if err := rows.MapScan(r); err != nil {
		return nil, false, false, err
	}
	normalize(r)
	deleted := r["deleted"].(int64) == 1
	delete(r, "deleted")
	return r, deleted, true, nil
}

func (s *syncTx) Live(table string, where model.Row) ([]model.Row, error) {
	cols, err := s.cols(table)
	if err != nil {
		return nil, err
	}
	q := `SELECT id, ` + strings.Join(cols, ", ") + ` FROM ` + table + ` WHERE deleted = 0`
	var args []any
	keys := make([]string, 0, len(where))
	for k := range where {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if !slices.Contains(cols, k) {
			return nil, fmt.Errorf("sync: %s has no column %q", table, k)
		}
		q += ` AND ` + k + ` = ?`
		args = append(args, where[k])
	}
	rows, err := s.tx.QueryxContext(s.ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Row
	for rows.Next() {
		r := map[string]any{}
		if err := rows.MapScan(r); err != nil {
			return nil, err
		}
		normalize(r)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *syncTx) Put(table, id string, row model.Row) error {
	cols, err := s.cols(table)
	if err != nil {
		return err
	}
	var names []string
	var args []any
	for _, c := range cols {
		if v, ok := row[c]; ok {
			names = append(names, c)
			args = append(args, v)
		}
	}
	for k := range row {
		if !slices.Contains(cols, k) {
			return fmt.Errorf("sync: %s has no column %q", table, k)
		}
	}
	// update a row that is there (some columns of it), insert one that isn't
	// (all of them: the not nulls say so)
	res, err := s.tx.ExecContext(s.ctx, `UPDATE `+table+` SET `+strings.Join(append(updates(names), "deleted = 0", "rev = ?"), ", ")+` WHERE id = ?`,
		append(append([]any{}, args...), s.tx.rev, id)...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = s.tx.ExecContext(s.ctx, `INSERT INTO `+table+` (id, rev, `+strings.Join(names, ", ")+`) VALUES (?, ?`+
		strings.Repeat(", ?", len(names))+`)`, append([]any{id, s.tx.rev}, args...)...)
	return err
}

func updates(names []string) []string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = n + " = ?"
	}
	return out
}

func (s *syncTx) Del(table, id string) error {
	return s.tx.del(s.ctx, table, id)
}

func (s *syncTx) MayBeUnused(itemIDs ...string) {
	s.tx.mayBeUnused = append(s.tx.mayBeUnused, itemIDs...)
}
