package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"poki/domain/model"
	"poki/domain/service"
)

func opListCmd() *cobra.Command {
	list := &cobra.Command{
		Use:   "list",
		Short: "the grocery list: to check, to buy along the path, bought",
	}

	add := &cobra.Command{
		Use:   "add <item> [amount]",
		Short: "put an item on the list by hand, to buy",
		Example: `  poki op list add "toilet paper"
  poki op list add milk 2`,
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			var amount *float64
			if len(args) == 2 {
				a, err := parseAmount(args[1])
				if err != nil {
					return err
				}
				amount = &a
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.list.Add(cmd.Context(), args[0], amount)
		},
	}

	show := &cobra.Command{
		Use:   "show",
		Short: "the list: the ? entries, the items to buy in path order, the bought ones",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			sheet, err := sv.list.Show(cmd.Context())
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			row := func(prefix string, it model.Item, amount *float64, suffix string) {
				line := fmt.Sprintf("  %s%-24s  %-8s  %s", prefix, it.Name, model.FormatAmount(amount, it.Unit), suffix)
				fmt.Fprintln(out, strings.TrimRight(line, " "))
			}
			if len(sheet.Check) > 0 {
				fmt.Fprintln(out, "To check")
				for _, c := range sheet.Check {
					row(model.ShortID(c.ID)+"  ", c.Item, c.Amount, c.Meal)
				}
			}
			for _, sh := range sheet.Groups {
				fmt.Fprintln(out, sh.Group.Name)
				for _, r := range sh.Rows {
					row("", r.Item, r.Total, "")
				}
			}
			if len(sheet.Bought) > 0 {
				fmt.Fprintln(out, "Bought")
				for _, r := range sheet.Bought {
					row("", r.Item, r.Total, "")
				}
			}
			return nil
		},
	}

	resolve := &cobra.Command{
		Use:   "resolve <entry> buy|have",
		Short: "settle a ? entry: buy it, or we have it (off the list)",
		Long: `settle a ? entry: buy puts it to buy, have takes it off the list. the entry is
its id (show prints it) or its item, when only one ? entry has it.`,
		Example: `  poki op list resolve onion have
  poki op list resolve 3f2a buy`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.list.Resolve(cmd.Context(), args[0], args[1])
		},
	}

	tick := &cobra.Command{
		Use:   "tick <item>",
		Short: "an item to buy is bought",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return withList(cmd, func(l *service.List) error { return l.Tick(cmd.Context(), args[0]) })
		},
	}

	untick := &cobra.Command{
		Use:   "untick <item>",
		Short: "a bought item is back to buy",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return withList(cmd, func(l *service.List) error { return l.Untick(cmd.Context(), args[0]) })
		},
	}

	var yes bool
	clearList := &cobra.Command{
		Use:   "clear [-y]",
		Short: "empty the whole list, whatever its state (asks first)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if !yes && !confirm(cmd.InOrStdin(), cmd.OutOrStdout(), "clear the whole list?") {
				return nil
			}
			return withList(cmd, func(l *service.List) error { return l.Clear(cmd.Context()) })
		},
	}
	clearList.Flags().BoolVarP(&yes, "yes", "y", false, "don't ask")

	list.AddCommand(add, show, resolve, tick, untick, clearList)
	return list
}

func withList(cmd *cobra.Command, fn func(*service.List) error) error {
	sv, done, err := openServices(cmd)
	if err != nil {
		return err
	}
	defer done()
	return fn(sv.list)
}
