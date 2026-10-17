package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"poki/domain/model"
)

func opPlanCmd() *cobra.Command {
	plan := &cobra.Command{
		Use:   "plan",
		Short: "the plan: meals placed on days, lunch and dinner",
	}

	var noMeal bool
	add := &cobra.Command{
		Use:   "add <date> <slot> <meal> | <date> <slot> --no-meal",
		Short: "place a meal last in a slot, or mark the slot no meal",
		Example: `  poki op plan add 2026-10-17 dinner lasagna
  poki op plan add 2026-10-18 lunch --no-meal`,
		Args: cobra.RangeArgs(2, 3),
		RunE: func(cmd *cobra.Command, args []string) error {
			if noMeal == (len(args) == 3) {
				return fmt.Errorf("give a meal or --no-meal")
			}
			mealRef := ""
			if !noMeal {
				mealRef = args[2]
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			e, err := sv.plan.Add(cmd.Context(), args[0], args[1], mealRef)
			if err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), model.ShortID(e.ID))
			return nil
		},
	}
	add.Flags().BoolVar(&noMeal, "no-meal", false, "the slot is empty on purpose")

	var from string
	var days int
	show := &cobra.Command{
		Use:   "show [--from <date>] [--days <n>]",
		Short: "the plan, day by day: each entry's id, meal and marks",
		Example: `  poki op plan show
  poki op plan show --from 2026-10-20 --days 2`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if from == "" {
				from = time.Now().Format(model.DateLayout)
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			plan, err := sv.plan.Show(cmd.Context(), from, days)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			for _, day := range plan {
				d, _ := time.Parse(model.DateLayout, day.Date)
				fmt.Fprintf(out, "%s %s\n", d.Format("Mon"), day.Date)
				for _, slot := range model.Slots {
					planned := day.Slots[slot]
					if len(planned) == 0 {
						fmt.Fprintf(out, "  %-6s  –\n", slot)
					}
					for i, p := range planned {
						label := slot
						if i > 0 {
							label = ""
						}
						var marks []string
						for _, m := range p.Marks {
							marks = append(marks, strings.TrimSpace(markLabel(m.State)+" "+m.Item.Name+" "+model.FormatAmount(m.Amount, m.Item.Unit)))
						}
						line := fmt.Sprintf("  %-6s  %s  %s", label, model.ShortID(p.ID), p.Meal.Name)
						if len(marks) > 0 {
							line += "  (" + strings.Join(marks, ", ") + ")"
						}
						fmt.Fprintln(out, line)
					}
				}
			}
			return nil
		},
	}
	show.Flags().StringVar(&from, "from", "", "the first day (default today)")
	show.Flags().IntVar(&days, "days", 7, "how many days")

	move := &cobra.Command{
		Use:     "move <entry> <date> <slot>",
		Short:   "move a planned meal last into another slot",
		Example: `  poki op plan move 3f2a 2026-10-19 lunch`,
		Args:    cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.plan.Move(cmd.Context(), args[0], args[1], args[2])
		},
	}

	swap := &cobra.Command{
		Use:     "swap <entry> <entry>",
		Short:   "swap the places of two planned meals",
		Example: `  poki op plan swap 3f2a 9b01`,
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.plan.Swap(cmd.Context(), args[0], args[1])
		},
	}

	rm := &cobra.Command{
		Use:   "rm <entry>",
		Short: "take a meal or no meal off the plan; what it put on the list stays",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.plan.Remove(cmd.Context(), args[0])
		},
	}

	mark := &cobra.Command{
		Use:   "mark <entry> <item> buy|check|none",
		Short: "mark an ingredient of a planned meal: buy, check (?) or none (we have it)",
		Long: `mark an ingredient of a planned meal. buy and check put it on the list with
the ingredient's amount (check is ?: we don't know if we have it); none takes it
off the list.`,
		Example: `  poki op plan mark 3f2a mozzarella buy
  poki op plan mark 3f2a onion check`,
		Args: cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.plan.Mark(cmd.Context(), args[0], args[1], args[2])
		},
	}

	plan.AddCommand(add, show, move, swap, rm, mark)
	return plan
}

// markLabel is how the terminal shows a list entry's state.
func markLabel(state string) string {
	if state == model.StateCheck {
		return "?"
	}
	return state
}
