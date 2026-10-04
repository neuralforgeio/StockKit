package httperr

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

var debugMode bool

// SetDebugMode mengaktifkan/menonaktifkan mode debug untuk error responses.
// Dipanggil sekali saat startup berdasarkan APP_ENV.
func SetDebugMode(enabled bool) {
	debugMode = enabled
}

// Error is the domain error rendered as the StockKit error envelope.
type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Status  int            `json:"-"`
	Err     error          `json:"-"` // underlying root cause (exposed only in debug mode)
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Code + ": " + e.Message
}

// New builds a domain error with its HTTP status and catalog code.
func New(code string, status int, message string) *Error {
	return &Error{Code: code, Status: status, Message: message}
}

// Wrap attaches an underlying root cause to the Error.
func Wrap(code string, status int, message string, err error) *Error {
	return &Error{Code: code, Status: status, Message: message, Err: err}
}

// WithDetails attaches structured context such as available stock.
func (e *Error) WithDetails(key string, value any) *Error {
	if e.Details == nil {
		e.Details = make(map[string]any)
	}
	e.Details[key] = value
	return e
}

// Write renders err as the envelope; unknown errors become INTERNAL.
// In debug mode, stack trace and raw error are exposed; in production, sanitized.
func Write(w http.ResponseWriter, err error) {
	var de *Error
	if !errors.As(err, &de) {
		de = New("INTERNAL", http.StatusInternalServerError, "Internal server error")
		if debugMode {
			de.Message = err.Error()
			de.Err = err
		}
	}

	// Build response with optional debug fields
	resp := map[string]any{
		"code":    de.Code,
		"message": de.Message,
		"details": de.Details,
	}
	if debugMode && de.Err != nil {
		resp["stack"] = fmt.Sprintf("%+v", de.Err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(de.Status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": resp})
}
