package cmd

import (
	"log"

	"github.com/spf13/cobra"

	"poki/adapter/store"
	"poki/domain/service"
	"poki/view/http/server"
)

func runCmd() *cobra.Command {
	var dev bool
	cmd := &cobra.Command{
		Use:   "run [--dev]",
		Short: "start the web server",
		Long: `start the web server. POKI_ADDR sets the listen address (default :8091),
POKI_DB the database file (default poki.db), created and migrated on boot.
--dev serves a build that is always fresh: no offline shell, and a browser
that kept an old one drops it.`,
		Example: `  poki run
  poki run --dev
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
				Sync: service.NewSync(store.New(db)),
				Ping: db.PingContext,
				Dev:  dev,
			})
			return srv.Run(cmd.Context())
		},
	}
	cmd.Flags().BoolVar(&dev, "dev", false, "always fresh: no offline shell (just run)")
	return cmd
}
