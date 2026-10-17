package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"poki/domain/model"
	"poki/domain/service"
)

// fakeSync answers every sync with one change, and rejects ops named "bad".
type fakeSync struct {
	since int64
	ops   []model.Op
	err   error
}

func (f *fakeSync) Sync(_ context.Context, since int64, ops []model.Op) (service.Synced, error) {
	f.since, f.ops = since, ops
	out := service.Synced{Rev: 7, Changes: []model.Change{{Table: "meals", ID: "m", Rev: 7, Fields: model.Row{"name": "soup"}}}}
	for _, op := range ops {
		if op.Op == "bad" {
			out.Rejected = append(out.Rejected, model.Rejected{Op: op.Op, Err: errors.New("no")})
		}
	}
	return out, f.err
}

func TestRoutes(t *testing.T) {
	tests := []struct {
		method, path, body string
		status             int
		want               string
	}{
		{"GET", "/", "", http.StatusOK, `<div id="app">`},
		{"GET", "/js/app.js", "", http.StatusOK, "render("},
		{"GET", "/js/vendor/preact.module.js", "", http.StatusOK, "export{"},
		{"GET", "/css/site.css", "", http.StatusOK, "tailwindcss"},
		{"GET", "/js/", "", http.StatusNotFound, ""},
		{"GET", "/js/vendor/", "", http.StatusNotFound, ""},
		{"GET", "/nope", "", http.StatusNotFound, ""},
		{"POST", "/", "", http.StatusMethodNotAllowed, ""},
		{"GET", "/healthz", "", http.StatusOK, "ok"},
		{"GET", "/manifest.webmanifest", "", http.StatusOK, `"display": "standalone"`},
		{"GET", "/sw.js", "", http.StatusOK, `const FILES = ["/","/css/site.css",`},
		{"GET", "/api/sync", "", http.StatusNotFound, ""}, // falls to the files: there is none
		{"POST", "/api/sync", `{"since": 0, "ops": []}`, http.StatusOK,
			`{"rev":7,"changes":[{"table":"meals","id":"m","rev":7,"deleted":false,"fields":{"name":"soup"}}],"rejected":[]}`},
		{"POST", "/api/sync", `{"since": 3, "ops": [{"op": "bad", "type": "del", "table": "meals", "id": "m"}]}`, http.StatusOK,
			`"rejected":["bad"]`},
		{"POST", "/api/sync", `not json`, http.StatusBadRequest, "a sync is {since, ops}"},
	}
	h := routes(Config{Sync: &fakeSync{}, Ping: func(context.Context) error { return nil }})
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body)))
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d (%s)", rec.Code, tt.status, rec.Body)
			}
			if !strings.Contains(rec.Body.String(), tt.want) {
				t.Fatalf("body %q lacks %q", rec.Body.String(), tt.want)
			}
		})
	}
}

func TestSyncPassesNumbersAsFloats(t *testing.T) {
	f := &fakeSync{}
	h := routes(Config{Sync: f})
	body := `{"since": 12, "ops": [{"op": "o", "type": "put", "table": "groups", "id": "g", "fields": {"name": "Dairy", "position": 3}}]}`
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sync", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if f.since != 12 || len(f.ops) != 1 {
		t.Fatalf("since %d, ops %+v", f.since, f.ops)
	}
	if p, ok := f.ops[0].Fields["position"].(float64); !ok || p != 3 {
		t.Errorf("position = %#v, want float64 3", f.ops[0].Fields["position"])
	}
}

func TestSyncFailsWhole(t *testing.T) {
	h := routes(Config{Sync: &fakeSync{err: errors.New("disk")}})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sync", strings.NewReader(`{"since": 0, "ops": []}`)))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status %d, want 500: the phone keeps its outbox and tries again", rec.Code)
	}
}

func TestHealthzWhenTheDBIsDown(t *testing.T) {
	h := routes(Config{Ping: func(context.Context) error { return errors.New("gone") }})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/healthz", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d, want 503", rec.Code)
	}
}

func TestServiceWorker(t *testing.T) {
	h := routes(Config{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/sw.js", nil))
	body := rec.Body.String()
	for _, want := range []string{`const VERSION = "`, `"/js/app.js"`, `"/js/vendor/preact.module.js"`, `"/manifest.webmanifest"`, `caches.open(CACHE)`} {
		if !strings.Contains(body, want) {
			t.Errorf("sw.js lacks %s", want)
		}
	}
	for _, not := range []string{`"/sw.js"`, `"/css/input.css"`, `"/index.html"`} {
		if strings.Contains(body, not) {
			t.Errorf("sw.js caches %s", not)
		}
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control %q: a new worker must be seen", cc)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Errorf("Content-Type %q", ct)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/manifest.webmanifest", nil))
	if ct := rec.Header().Get("Content-Type"); ct != "application/manifest+json" {
		t.Errorf("manifest Content-Type %q", ct)
	}
}
