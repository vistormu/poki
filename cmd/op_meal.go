package cmd

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"poki/domain/model"
)

func opMealCmd() *cobra.Command {
	meal := &cobra.Command{
		Use:   "meal",
		Short: "meals: the dishes we cook, with their ingredients",
	}

	add := &cobra.Command{
		Use:     "add <name>",
		Short:   "add a meal",
		Example: `  poki op meal add lasagna`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			m, err := sv.meals.Add(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s  %s\n", model.ShortID(m.ID), m.Name)
			return nil
		},
	}

	list := &cobra.Command{
		Use:   "list",
		Short: "list the meals, alphabetical",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			meals, err := sv.meals.List(cmd.Context())
			if err != nil {
				return err
			}
			for _, m := range meals {
				fmt.Fprintf(cmd.OutOrStdout(), "%s  %s\n", model.ShortID(m.ID), m.Name)
			}
			return nil
		},
	}

	show := &cobra.Command{
		Use:     "show <meal>",
		Short:   "a meal and its ingredients",
		Example: `  poki op meal show lasagna`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			m, ins, err := sv.meals.Ingredients(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			fmt.Fprintf(out, "%s  %s\n", model.ShortID(m.ID), m.Name)
			for _, in := range ins {
				line := fmt.Sprintf("  %-24s  %s", in.Item.Name, model.FormatAmount(in.Amount, in.Item.Unit))
				fmt.Fprintln(out, strings.TrimRight(line, " "))
			}
			return nil
		},
	}

	rename := &cobra.Command{
		Use:     "rename <meal> <name>",
		Short:   "rename a meal",
		Example: `  poki op meal rename lasagna "lasagna bolognese"`,
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.meals.Rename(cmd.Context(), args[0], args[1])
		},
	}

	rm := &cobra.Command{
		Use:   "rm <meal>",
		Short: "delete a meal and its plan entries; what they put on the list stays",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.meals.Remove(cmd.Context(), args[0])
		},
	}

	meal.AddCommand(add, list, show, rename, rm, opIngredientCmd())
	return meal
}

func opIngredientCmd() *cobra.Command {
	ingredient := &cobra.Command{
		Use:   "ingredient",
		Short: "a meal's ingredients: items with an amount in their unit",
	}

	add := &cobra.Command{
		Use:   "add <meal> <item> [amount]",
		Short: "add an item to a meal",
		Long: `add an item to a meal, with an amount in the item's unit: 200 (g), 6, 0.5,
0,5 or 1/2. an item of unit none takes no amount.`,
		Example: `  poki op meal ingredient add lasagna mozzarella 200
  poki op meal ingredient add lasagna onion 1/2`,
		Args: cobra.RangeArgs(2, 3),
		RunE: func(cmd *cobra.Command, args []string) error {
			amount, err := amountArg(args)
			if err != nil {
				return err
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.meals.AddIngredient(cmd.Context(), args[0], args[1], amount)
		},
	}

	set := &cobra.Command{
		Use:     "set <meal> <item> [amount]",
		Short:   "change an ingredient's amount; none takes it away",
		Example: `  poki op meal ingredient set lasagna mozzarella 250`,
		Args:    cobra.RangeArgs(2, 3),
		RunE: func(cmd *cobra.Command, args []string) error {
			amount, err := amountArg(args)
			if err != nil {
				return err
			}
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.meals.SetIngredient(cmd.Context(), args[0], args[1], amount)
		},
	}

	rm := &cobra.Command{
		Use:   "rm <meal> <item>",
		Short: "take an item off a meal (it goes if nothing else keeps it)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sv, done, err := openServices(cmd)
			if err != nil {
				return err
			}
			defer done()
			return sv.meals.RemoveIngredient(cmd.Context(), args[0], args[1])
		},
	}

	ingredient.AddCommand(add, set, rm)
	return ingredient
}

// amountArg is the optional third argument: nil when absent.
func amountArg(args []string) (*float64, error) {
	if len(args) < 3 {
		return nil, nil
	}
	a, err := parseAmount(args[2])
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// parseAmount reads 200, 0.5, 0,5 or 1/2.
func parseAmount(s string) (float64, error) {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", ".")
	if num, den, ok := strings.Cut(s, "/"); ok {
		n, err1 := strconv.ParseFloat(num, 64)
		d, err2 := strconv.ParseFloat(den, 64)
		if err1 == nil && err2 == nil && d != 0 {
			return n / d, nil
		}
	} else if a, err := strconv.ParseFloat(s, 64); err == nil {
		return a, nil
	}
	return 0, fmt.Errorf("amount %q is not a number", s)
}
