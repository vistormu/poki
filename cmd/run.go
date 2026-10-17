package cmd

import (
	"github.com/spf13/cobra"

	"poki/view/http/server"
)

func runCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "start the web server",
		Long:  `start the web server. POKI_ADDR sets the listen address (default :8091).`,
		Example: `  poki run
  POKI_ADDR=:3000 poki run`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			srv := server.New(server.Config{
				Addr: getenv("POKI_ADDR", ":8091"),
			})
			return srv.Run(cmd.Context())
		},
	}
}
