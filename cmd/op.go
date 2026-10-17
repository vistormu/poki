package cmd

import (
	"bufio"
	"fmt"
	"io"
	"strings"

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
	op.AddCommand(opGroupCmd(), opItemCmd(), opMealCmd(), opPlanCmd(), opListCmd())
	return op
}

// services are what the op commands write through: the app's own rules.
type services struct {
	groups *service.Groups
	items  *service.Items
	meals  *service.Meals
	plan   *service.Plan
	list   *service.List
}

// openServices opens POKI_DB and builds the services on it; done closes it.
func openServices(cmd *cobra.Command) (services, func(), error) {
	db, _, _, err := openDB(cmd)
	if err != nil {
		return services{}, nil, err
	}
	st := store.New(db)
	groups := service.NewGroups(st)
	items := service.NewItems(st, groups)
	meals := service.NewMeals(st, items)
	return services{
		groups: groups,
		items:  items,
		meals:  meals,
		plan:   service.NewPlan(st, meals),
		list:   service.NewList(st, items),
	}, func() { db.Close() }, nil
}

// confirm asks a yes/no question; only "y" or "yes" says yes.
func confirm(in io.Reader, out io.Writer, question string) bool {
	fmt.Fprintf(out, "%s [y/N] ", question)
	answer, _ := bufio.NewReader(in).ReadString('\n')
	answer = strings.ToLower(strings.TrimSpace(answer))
	return answer == "y" || answer == "yes"
}
