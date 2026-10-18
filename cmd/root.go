package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/spf13/cobra"

	"poki/adapter/store"
)

// version is set by the image build (-ldflags "-X poki/cmd.version=v0.1.0").
var version = "dev"

func Execute() {
	root := &cobra.Command{
		Use:     "poki",
		Short:   "the basket — meals, a plan and the grocery list for two",
		Version: version,
		// errors are printed once, below, without the usage dump
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(runCmd(), migrateCmd(), healthCmd(), backupCmd(), opCmd())

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

// openDB opens POKI_DB (default poki.db), creating and migrating it.
func openDB(cmd *cobra.Command) (db *sqlx.DB, path string, version int64, err error) {
	path = getenv("POKI_DB", "poki.db")
	db, err = store.Open(path)
	if err != nil {
		return nil, "", 0, err
	}
	version, err = store.Migrate(cmd.Context(), db)
	if err != nil {
		db.Close()
		return nil, "", 0, err
	}
	return db, path, version, nil
}
