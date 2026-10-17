package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"poki/domain/model"
)

func opItemCmd() *cobra.Command {
	item := &cobra.Command{
		Use:   "item",
		Short: "items: anything we buy, made where meals and the list use them",
	}

	var unit, groupRef string
	add := &cobra.Command{
		Use:   "add <name>",
		Short: "add an item",
		Example: `  poki op item add mozzarella --unit g --group dairy
  poki op item add "toilet paper"`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			it, err := sv.items.Add(cmd.Context(), args[0], unit, groupRef)
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s  %s\n", model.ShortID(it.ID), it.Name)
			return nil
		},
	}
	add.Flags().StringVar(&unit, "unit", model.UnitNone, "its unit: "+strings.Join(model.Units, ", "))
	add.Flags().StringVar(&groupRef, "group", "", "its group (none: Other)")

	list := &cobra.Command{
		Use:   "list",
		Short: "list the items in path order, Other last",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			groups, err := sv.groups.List(cmd.Context())
			if err != nil {
				return err
			}
			names := map[string]string{"": "Other"}
			for _, g := range groups {
				names[g.ID] = g.Name
			}
			items, err := sv.items.List(cmd.Context())
			if err != nil {
				return err
			}
			for _, it := range items {
				fmt.Fprintf(cmd.OutOrStdout(), "%s  %-24s  %-5s  %s\n", model.ShortID(it.ID), it.Name, it.Unit, names[it.GroupID])
			}
			return nil
		},
	}

	var other bool
	group := &cobra.Command{
		Use:   "group <item> <group> | <item> --other",
		Short: "give an item its group, or send it to Other (it goes if nothing uses it)",
		Example: `  poki op item group mozzarella dairy
  poki op item group mozzarella --other`,
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if other == (len(args) == 2) {
				return fmt.Errorf("give a group or --other")
			}
			groupRef := ""
			if !other {
				groupRef = args[1]
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.items.Group(cmd.Context(), args[0], groupRef)
		},
	}
	group.Flags().BoolVar(&other, "other", false, "no group: Other")

	var name, editUnit string
	edit := &cobra.Command{
		Use:   "edit <item> [--name] [--unit]",
		Short: "fix an item's name or unit; what is not given stays",
		Long: `fix an item's name or unit; what is not given stays. a new unit reinterprets
the item's amounts as they are, unconverted.`,
		Example: `  poki op item edit mozarella --name mozzarella`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var n, u *string
			if cmd.Flags().Changed("name") {
				n = &name
			}
			if cmd.Flags().Changed("unit") {
				u = &editUnit
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			_, err = sv.items.Edit(cmd.Context(), args[0], n, u)
			return err
		},
	}
	edit.Flags().StringVar(&name, "name", "", "the new name")
	edit.Flags().StringVar(&editUnit, "unit", "", "the new unit: "+strings.Join(model.Units, ", "))

	rm := &cobra.Command{
		Use:   "rm <item>",
		Short: "delete an item; refused while a meal or the list uses it",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.items.Remove(cmd.Context(), args[0])
		},
	}

	item.AddCommand(add, list, group, edit, rm)
	return item
}
