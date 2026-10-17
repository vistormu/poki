package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRoutes(t *testing.T) {
	tests := []struct {
		method, path string
		status       int
		body         string
	}{
		{"GET", "/", http.StatusOK, "<body>poki</body>"},
		{"GET", "/nope", http.StatusNotFound, ""},
		{"POST", "/", http.StatusMethodNotAllowed, ""},
	}
	h := routes()
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d", rec.Code, tt.status)
			}
			if !strings.Contains(rec.Body.String(), tt.body) {
				t.Fatalf("body %q lacks %q", rec.Body.String(), tt.body)
			}
		})
	}
}
