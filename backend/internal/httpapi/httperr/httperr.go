package httperr

import (
	"encoding/json"
	"errors"
	"net/http"
)

// Error is the domain error rendered as the StockKit error envelope.
type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Status  int            `json:"-"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// New builds a domain error with its HTTP status and catalog code.
func New(code string, status int, message string) *Error {
	return &Error{Code: code, Status: status, Message: message}
}

// WithDetails attaches structured context such as available stock.
func (e *Error) WithDetails(key string, value any) *Error {
	if e.Details == nil {
		e.Details = make(map[string]any)
	}
	e.Details[key] = value
	return e
}

type envelope struct {
	Error *Error `json:"error"`
}

// Write renders err as the envelope; unknown errors become INTERNAL.
func Write(w http.ResponseWriter, err error) {
	var de *Error
	if !errors.As(err, &de) {
		de = New("INTERNAL", http.StatusInternalServerError, "Internal server error")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(de.Status)
	_ = json.NewEncoder(w).Encode(envelope{Error: de})
}
