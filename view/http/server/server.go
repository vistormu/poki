package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"poki/view/ui"
)

type Config struct {
	Addr string
	Sync Syncer
	Ping func(context.Context) error // the db answers: /healthz
}

type Server struct {
	http *http.Server
}

func New(cfg Config) *Server {
	return &Server{http: &http.Server{
		Addr:              cfg.Addr,
		Handler:           routes(cfg),
		ReadHeaderTimeout: 5 * time.Second,
	}}
}

func routes(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /", noListing(http.FileServerFS(ui.Static())))
	mux.HandleFunc("POST /api/sync", syncHandler(cfg.Sync))
	mux.HandleFunc("GET /healthz", healthz(cfg.Ping))
	return mux
}

// Run serves until the context ends or the process gets SIGINT/SIGTERM, then
// gives in-flight requests a few seconds to finish.
func (s *Server) Run(ctx context.Context) error {
	ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errc := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", s.http.Addr)
		if err := s.http.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
		close(errc)
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.http.Shutdown(shutdownCtx)
}

// noListing 404s directory paths but the root (index.html), so no folder
// lists its files.
func noListing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
