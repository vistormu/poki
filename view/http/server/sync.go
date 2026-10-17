package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"poki/domain/model"
	"poki/domain/service"
)

// Syncer is the sync service: ops in, changes out.
type Syncer interface {
	Sync(ctx context.Context, since int64, ops []model.Op) (service.Synced, error)
}

type syncRequest struct {
	Since int64      `json:"since"`
	Ops   []model.Op `json:"ops"`
}

type syncResponse struct {
	Rev      int64          `json:"rev"`
	Changes  []model.Change `json:"changes"`
	Rejected []string       `json:"rejected"` // op ids
	Reset    bool           `json:"reset,omitempty"`
}

// maxSync bounds a request: a phone's outbox after a long time offline is a
// few hundred ops, far below it.
const maxSync = 4 << 20

// sync is POST /api/sync (technical-design.md → sync).
func syncHandler(s Syncer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req syncRequest
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSync))
		dec.UseNumber()
		if err := decode(dec, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		res, err := s.Sync(r.Context(), req.Since, req.Ops)
		if err != nil {
			log.Printf("sync: %v", err)
			http.Error(w, "sync failed", http.StatusInternalServerError)
			return
		}
		out := syncResponse{Rev: res.Rev, Changes: res.Changes, Rejected: []string{}, Reset: res.Reset}
		for _, rj := range res.Rejected {
			log.Printf("sync: rejected op %s: %v", rj.Op, rj.Err)
			out.Rejected = append(out.Rejected, rj.Op)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(out)
	}
}

// decode reads a sync request. fields come as json.Number, made float64 here:
// the sync rules read numbers as float64.
func decode(dec *json.Decoder, req *syncRequest) error {
	if err := dec.Decode(req); err != nil {
		return errors.New("a sync is {since, ops}: " + err.Error())
	}
	for _, op := range req.Ops {
		for k, v := range op.Fields {
			if n, ok := v.(json.Number); ok {
				f, err := n.Float64()
				if err != nil {
					return errors.New("a field is not a number: " + k)
				}
				op.Fields[k] = f
			}
		}
	}
	return nil
}

// healthz answers ok while the db does: the image's healthcheck and gatus.
func healthz(ping func(context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if err := ping(r.Context()); err != nil {
			log.Printf("healthz: %v", err)
			http.Error(w, "db unreachable", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("ok\n"))
	}
}
