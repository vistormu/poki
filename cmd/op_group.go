package cmd

import (
	"fmt"
	"strconv"

	"github.com/spf13/cobra"

	"poki/domain/model"
)

func opGroupCmd() *cobra.Command {
	group := &cobra.Command{
		Use:   "group",
		Short: "groups: the stretches of the store, in the order we walk them",
	}

	add := &cobra.Command{
		Use:     "add <name>",
		Short:   "add a group, last on the path",
		Example: `  poki op group add Dairy`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			g, err := sv.groups.Add(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%d  %s  %s\n", g.Position, model.ShortID(g.ID), g.Name)
			return nil
		},
	}

	list := &cobra.Command{
		Use:   "list",
		Short: "list the groups, in path order",
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
			for i, g := range groups {
				fmt.Fprintf(cmd.OutOrStdout(), "%d  %s  %s\n", i+1, model.ShortID(g.ID), g.Name)
			}
			return nil
		},
	}

	rename := &cobra.Command{
		Use:     "rename <group> <name>",
		Short:   "rename a group; its items stay in it",
		Example: `  poki op group rename dairy "Milk and cheese"`,
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.groups.Rename(cmd.Context(), args[0], args[1])
		},
	}

	move := &cobra.Command{
		Use:     "move <group> <position>",
		Short:   "move a group to a position on the path (1 is first)",
		Example: `  poki op group move dairy 1`,
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			position, err := strconv.Atoi(args[1])
			if err != nil {
				return fmt.Errorf("position %q is not a number", args[1])
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.groups.Move(cmd.Context(), args[0], position)
		},
	}

	rm := &cobra.Command{
		Use:   "rm <group>",
		Short: "delete a group: its items go to Other, and those nothing uses go",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.groups.Remove(cmd.Context(), args[0])
		},
	}

	group.AddCommand(add, list, rename, move, rm)
	return group
}
