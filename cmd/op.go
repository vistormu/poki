package cmd

import (
	"github.com/spf13/cobra"

	"poki/adapter/store"
	"poki/domain/service"
)

// op is the operator toolbox: everything the app does, from the terminal. a
// row is named by its id, its name, or the start of its id (op … list shows
// the first 8).
func opCmd() *cobra.Command {
	op := &cobra.Command{
		Use:   "op",
		Short: "operate on the data from the terminal",
	}
	op.AddCommand(opGroupCmd(), opItemCmd())
	return op
}

// services are what the op commands write through: the app's own rules.
type services struct {
	groups *service.Groups
	items  *service.Items
}

// openServices opens POKI_DB and builds the services on it; done closes it.
func openServices(cmd *cobra.Command) (services, func(), error) {
	db, _, _, err := openDB(cmd)
	if err != nil {
		return services{}, nil, err
	}
	st := store.New(db)
	groups := service.NewGroups(st)
	return services{
		groups: groups,
		items:  service.NewItems(st, groups),
	}, func() { db.Close() }, nil
}
