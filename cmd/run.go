package cmd

import (
	"log"

	"github.com/spf13/cobra"

	"poki/view/http/server"
)

func runCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "start the web server",
		Long: `start the web server. POKI_ADDR sets the listen address (default :8091),
POKI_DB the database file (default poki.db), created and migrated on boot.`,
		Example: `  poki run
  POKI_ADDR=:3000 POKI_DB=/data/poki.db poki run`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			db, path, v, err := openDB(cmd)
			if err != nil {
				return err
			}
			defer db.Close()
			log.Printf("db %s at version %d", path, v)

			srv := server.New(server.Config{
				Addr: getenv("POKI_ADDR", ":8091"),
			})
			return srv.Run(cmd.Context())
		},
	}
}
