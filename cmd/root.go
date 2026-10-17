package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
)

func Execute() {
	root := &cobra.Command{
		Use:   "poki",
		Short: "the basket — meals, a plan and the grocery list for two",
		// errors are printed once, below, without the usage dump
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(runCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// getenv is the only place env is read: cmd/ passes values down, nothing below
// touches os.Getenv.
func getenv(key, def string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	return v
}
