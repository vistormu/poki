package service

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"

	"poki/adapter/store"
	"poki/domain/model"
)

func newSync(t *testing.T) (*Sync, *Groups, *store.Store) {
	t.Helper()
	groups, _, st := newServices(t)
	return NewSync(st), groups, st
}

// ops builds ops from "put table id k=v k=v" and "del table id" lines. values
// are strings, numbers (a leading #) or null (nil). the op ids are o1, o2…
func ops(lines ...string) []model.Op {
	var out []model.Op
	for i, line := range lines {
		f := strings.Fields(line)
		op := model.Op{Op: fmt.Sprintf("o%d", i+1), Type: f[0], Table: f[1], ID: f[2]}
		for _, kv := range f[3:] {
			if op.Fields == nil {
				op.Fields = map[string]any{}
			}
			k, v, _ := strings.Cut(kv, "=")
			v = strings.ReplaceAll(v, "_", " ")
			switch {
			case v == "nil":
				op.Fields[k] = nil
			case strings.HasPrefix(v, "#"):
				var n float64
				fmt.Sscan(v[1:], &n)
				op.Fields[k] = n
			default:
				op.Fields[k] = v
			}
		}
		out = append(out, op)
	}
	return out
}

func syncOK(t *testing.T, s *Sync, since int64, lines ...string) Synced {
	t.Helper()
	out, err := s.Sync(context.Background(), since, ops(lines...))
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	for _, r := range out.Rejected {
		t.Errorf("op %s rejected: %v", r.Op, r.Err)
	}
	return out
}

// rejected syncs the lines and returns the rejected op ids and why.
func rejected(t *testing.T, s *Sync, lines ...string) string {
	t.Helper()
	out, err := s.Sync(context.Background(), 0, ops(lines...))
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	var r []string
	for _, rj := range out.Rejected {
		r = append(r, rj.Op+": "+rj.Err.Error())
	}
	return strings.Join(r, "; ")
}

// live says the live rows of a table: "id field=value …", sorted.
func liveRows(t *testing.T, s *Sync, table string) string {
	t.Helper()
	out, err := s.Sync(context.Background(), 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	var rows []string
	for _, c := range out.Changes {
		if c.Table != table || c.Deleted || c.ID == model.NoMeal {
			continue
		}
		var fs []string
		for k, v := range c.Fields {
			fs = append(fs, fmt.Sprintf("%s=%v", k, v))
		}
		slices.Sort(fs)
		rows = append(rows, c.ID+" "+strings.Join(fs, " "))
	}
	slices.Sort(rows)
	return strings.Join(rows, " / ")
}

func TestAFreshPhoneGetsNoMeal(t *testing.T) {
	s, _, _ := newSync(t)
	out := syncOK(t, s, 0)
	if len(out.Changes) != 1 || out.Changes[0].ID != model.NoMeal || out.Changes[0].Fields["name"] != "No meal" {
		t.Errorf("changes %+v, want no meal", out.Changes)
	}
	if out.Rev < 1 {
		t.Errorf("rev %d", out.Rev)
	}
}

func TestTheItemPickerOffline(t *testing.T) {
	s, _, _ := newSync(t)
	// a new item and its use, in one outbox: the sweep runs after both
	syncOK(t, s, 0,
		"put meals m name=lasagna",
		"put items i name=mozzarella unit=g group_id=nil",
		"put ingredients n meal_id=m item_id=i amount=#200",
	)
	if got := liveRows(t, s, "ingredients"); got != "n amount=200 item_id=i meal_id=m" {
		t.Errorf("ingredients %q", got)
	}
	if got := liveRows(t, s, "items"); got != "i group_id=<nil> name=mozzarella unit=g" {
		t.Errorf("items %q", got)
	}
}

func TestPutChangesSomeFields(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0, "put items i name=mozarella unit=g", "put meals m name=lasagna",
		"put ingredients n meal_id=m item_id=i amount=#200")
	syncOK(t, s, 0, "put items i name=mozzarella", "put ingredients n amount=nil")
	if got := liveRows(t, s, "items"); got != "i group_id=<nil> name=mozzarella unit=g" {
		t.Errorf("items %q", got)
	}
	if got := liveRows(t, s, "ingredients"); got != "n amount=<nil> item_id=i meal_id=m" {
		t.Errorf("ingredients %q", got)
	}
}

func TestRejected(t *testing.T) {
	tests := []struct {
		name, op, want string
	}{
		{"no such table", "put recipes r name=x", "no table"},
		{"no such type", "add meals m name=x", "no op type"},
		{"an unknown field", "put meals m2 name=x stars=#5", "has no field"},
		{"a new row missing a field", "put items i2 name=x", "needs unit"},
		{"a field of the wrong kind", "put groups g2 name=x position=first", "not what it should be"},
		{"a fractional position", "put groups g2 name=x position=#1.5", "not what it should be"},
		{"a bad unit", "put items i2 name=x unit=ml", "unit is one of"},
		{"a long name", "put meals m2 name=" + strings.Repeat("a", 41), "longer than 40"},
		{"a blank name", "put meals m2 name=_", "needs a name"},
		{"an item in a deleted group", "put items i2 name=x unit=g group_id=gone", "not found"},
		{"an ingredient of a missing meal", "put ingredients n2 meal_id=nope item_id=salt", "not found"},
		{"an ingredient of no meal", "put ingredients n2 meal_id=" + model.NoMeal + " item_id=salt", "No meal has no ingredients"},
		{"an amount on a none item", "put ingredients n2 meal_id=m item_id=salt amount=#1", "salt has no amount"},
		{"a zero amount", "put list_entries l2 item_id=onion amount=#0 state=buy", "more than 0"},
		{"the same item twice in a meal", "put ingredients n2 meal_id=m item_id=onion", "already has that item"},
		{"a bad state", "put list_entries l2 item_id=onion state=have", "no state"},
		{"a mark on a missing plan entry", "put list_entries l2 item_id=onion plan_entry_id=nope state=buy", "not found"},
		{"two marks of one ingredient", "put list_entries l2 item_id=onion plan_entry_id=p state=check", "already marked"},
		{"a bad date", "put plan_entries p2 date=2026-02-30 slot=lunch meal_id=m position=#1", "like 2026-10-17"},
		{"a bad slot", "put plan_entries p2 date=2026-10-17 slot=tea meal_id=m position=#1", "lunch or dinner"},
		{"a meal in a no meal slot", "put plan_entries p2 date=2026-10-17 slot=lunch meal_id=m position=#2", "That slot is no meal"},
		{"no meal in a slot with meals", "put plan_entries p2 date=2026-10-17 slot=dinner meal_id=" + model.NoMeal + " position=#2", "empty slot"},
		{"editing no meal", "put meals " + model.NoMeal + " name=Out", "never edited"},
		{"deleting no meal", "del meals " + model.NoMeal, "never deleted"},
		{"deleting an item in use", "del items onion", "in use"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _, _ := newSync(t)
			syncOK(t, s, 0,
				"put meals m name=lasagna",
				"put items onion name=onion unit=count",
				"put items salt name=salt unit=none",
				"put ingredients n meal_id=m item_id=onion amount=#1",
				"put plan_entries p date=2026-10-17 slot=dinner meal_id=m position=#1",
				"put plan_entries none date=2026-10-17 slot=lunch meal_id="+model.NoMeal+" position=#1",
				"put list_entries l item_id=onion amount=#1 plan_entry_id=p state=buy",
			)
			before := liveRows(t, s, "meals") + liveRows(t, s, "items") + liveRows(t, s, "list_entries")
			got := rejected(t, s, tt.op)
			if !strings.HasPrefix(got, "o1: ") || !strings.Contains(got, tt.want) {
				t.Errorf("rejected %q, want o1 for %q", got, tt.want)
			}
			if after := liveRows(t, s, "meals") + liveRows(t, s, "items") + liveRows(t, s, "list_entries"); after != before {
				t.Errorf("a rejected op changed rows:\n%s\n%s", before, after)
			}
		})
	}
}

func TestAnOpWithNoID(t *testing.T) {
	s, _, _ := newSync(t)
	out, err := s.Sync(context.Background(), 0, []model.Op{{Op: "o1", Type: "put", Table: "meals", Fields: map[string]any{"name": "x"}}})
	if err != nil || len(out.Rejected) != 1 || !strings.Contains(out.Rejected[0].Err.Error(), "no id") {
		t.Errorf("err %v, rejected %+v", err, out.Rejected)
	}
}

func TestARejectedOpLeavesTheOthers(t *testing.T) {
	s, _, _ := newSync(t)
	out, err := s.Sync(context.Background(), 0, ops(
		"put meals m name=lasagna",
		"put ingredients n meal_id=m item_id=nope",
		"put meals m2 name=soup",
	))
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rejected) != 1 || out.Rejected[0].Op != "o2" {
		t.Errorf("rejected %+v, want o2", out.Rejected)
	}
	if got := liveRows(t, s, "meals"); got != "m name=lasagna / m2 name=soup" {
		t.Errorf("meals %q", got)
	}
}

func TestDelTakesWhatGoesWithIt(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0,
		"put groups g name=Dairy position=#1",
		"put items milk name=milk unit=count group_id=g",
		"put items moz name=mozzarella unit=g group_id=g",
		"put meals m name=lasagna",
		"put ingredients n meal_id=m item_id=moz amount=#200",
		"put plan_entries p date=2026-10-17 slot=dinner meal_id=m position=#1",
		"put list_entries l item_id=moz amount=#200 plan_entry_id=p state=buy",
	)
	rev := syncOK(t, s, 0).Rev

	// the group: its items to Other, the unused one goes
	out := syncOK(t, s, rev, "del groups g")
	if got := liveRows(t, s, "items"); got != "moz group_id=<nil> name=mozzarella unit=g" {
		t.Errorf("items after the group %q", got)
	}
	var said []string
	for _, c := range out.Changes {
		said = append(said, fmt.Sprintf("%s %s %v", c.Table, c.ID, c.Deleted))
	}
	slices.Sort(said)
	if got := strings.Join(said, ", "); got != "groups g true, items milk true, items moz false" {
		t.Errorf("changes %q: the phones hear of all of it", got)
	}

	// the meal: its ingredients and plan entries; the list entry stays
	syncOK(t, s, 0, "del meals m")
	for table, want := range map[string]string{"ingredients": "", "plan_entries": "", "meals": ""} {
		if got := liveRows(t, s, table); got != want {
			t.Errorf("%s after the meal %q", table, got)
		}
	}
	if got := liveRows(t, s, "list_entries"); !strings.HasPrefix(got, "l ") {
		t.Errorf("list entries %q, want l to stay", got)
	}
	if got := liveRows(t, s, "items"); got == "" {
		t.Error("mozzarella went while the list uses it")
	}

	// the list entry, last use of an ungrouped item: the item goes
	syncOK(t, s, 0, "del list_entries l")
	if got := liveRows(t, s, "items"); got != "" {
		t.Errorf("items %q, want none", got)
	}
}

func TestDelTwiceIsFine(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0, "put meals m name=soup", "del meals m", "del meals m", "del meals never")
}

func TestPutBringsADeletedRowBack(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0, "put meals m name=soup", "put items i name=onion unit=count",
		"put ingredients n meal_id=m item_id=i amount=#2")
	syncOK(t, s, 0, "del meals m")
	// undo: the phone puts back what it deleted, in order
	syncOK(t, s, 0, "put items i name=onion", "put meals m name=soup", "put ingredients n meal_id=m")
	if got := liveRows(t, s, "meals") + " | " + liveRows(t, s, "ingredients"); got != "m name=soup | n amount=2 item_id=i meal_id=m" {
		t.Errorf("after the undo %q", got)
	}
}

func TestRepickingLetsTheStrayGo(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0, "put meals m name=lasagna", "put items typo name=mozarella unit=g",
		"put ingredients n meal_id=m item_id=typo amount=#200")
	syncOK(t, s, 0, "put items i name=mozzarella unit=g", "put ingredients n item_id=i")
	if got := liveRows(t, s, "items"); got != "i group_id=<nil> name=mozzarella unit=g" {
		t.Errorf("items %q, want the typo gone", got)
	}
}

func TestTakingAnItemOffItsGroup(t *testing.T) {
	s, _, _ := newSync(t)
	syncOK(t, s, 0, "put groups g name=Dairy position=#1", "put items i name=milk unit=count group_id=g")
	syncOK(t, s, 0, "put items i group_id=nil")
	if got := liveRows(t, s, "items"); got != "" {
		t.Errorf("items %q: unused and ungrouped, it goes", got)
	}
}

func TestChangesSince(t *testing.T) {
	ctx := context.Background()
	s, groups, _ := newSync(t)
	first := syncOK(t, s, 0, "put meals m name=soup")
	second := syncOK(t, s, first.Rev, "put meals m2 name=curry", "del meals m")
	var ids []string
	for _, c := range second.Changes {
		ids = append(ids, fmt.Sprintf("%s:%v", c.ID, c.Deleted))
	}
	slices.Sort(ids)
	if got := strings.Join(ids, " "); got != "m2:false m:true" {
		t.Errorf("changes since %d: %q", first.Rev, got)
	}
	if second.Rev <= first.Rev {
		t.Errorf("rev %d after %d", second.Rev, first.Rev)
	}

	// a poll writes nothing and bumps nothing
	if poll := syncOK(t, s, second.Rev); poll.Rev != second.Rev || len(poll.Changes) != 0 {
		t.Errorf("poll: rev %d, %d changes", poll.Rev, len(poll.Changes))
	}

	// a terminal edit reaches the phones
	must[model.Group](t)(groups.Add(ctx, "Dairy"))
	if poll := syncOK(t, s, second.Rev); len(poll.Changes) != 1 || poll.Changes[0].Table != "groups" {
		t.Errorf("after the terminal: %+v", poll.Changes)
	}
}

func TestAPhonePastTheServerResets(t *testing.T) {
	s, _, _ := newSync(t)
	rev := syncOK(t, s, 0, "put meals m name=soup").Rev
	out := syncOK(t, s, rev+100) // the db came back from an older backup
	if !out.Reset || len(out.Changes) != 2 {
		t.Errorf("reset %v, %d changes: want everything", out.Reset, len(out.Changes))
	}
}
