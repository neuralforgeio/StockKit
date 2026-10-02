package logging

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	cReset  = "\033[0m"
	cGray   = "\033[90m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cRed    = "\033[31m"
	cCyan   = "\033[36m"
	cBold   = "\033[1m"
)

var sensitiveKeys = map[string]bool{
	"password": true, "password_hash": true, "token": true, "access_token": true,
	"refresh_token": true, "csrf": true, "csrf_token": true, "credit_card": true,
	"card_number": true, "bank_account": true, "secret": true, "authorization": true,
	"cookie": true, "otp": true, "pin": true,
}

func NewLogID() string { return uuid.NewString()[:8] }

func Redact(key, value string) string {
	if sensitiveKeys[key] {
		return "[REDACTED]"
	}
	return value
}

func levelColor(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return cRed
	case l >= slog.LevelWarn:
		return cYellow
	case l >= slog.LevelInfo:
		return cGreen
	default:
		return cGray
	}
}

func levelLabel(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "ERROR"
	case l >= slog.LevelWarn:
		return "WARN"
	case l >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}

// rotatingFile appends to a daily file: stockkit-YYYY-MM-DD<ext>.
type rotatingFile struct {
	mu  sync.Mutex
	dir string
	ext string
	day string
	f   *os.File
}

func (r *rotatingFile) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	today := time.Now().Format("2006-01-02")
	if r.f == nil || today != r.day {
		if r.f != nil {
			_ = r.f.Close()
		}
		if err := os.MkdirAll(r.dir, 0o755); err != nil {
			return 0, err
		}
		f, err := os.OpenFile(filepath.Join(r.dir, "stockkit-"+today+r.ext), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return 0, err
		}
		r.f, r.day = f, today
	}
	return r.f.Write(p)
}

// coloredHandler writes aligned, colored, redacted lines to any writer.
type coloredHandler struct {
	mu    *sync.Mutex
	w     io.Writer
	attrs []slog.Attr
	level slog.Level
}

func newColoredHandler(w io.Writer, level slog.Level) *coloredHandler {
	return &coloredHandler{mu: &sync.Mutex{}, w: w, level: level}
}

// NewConsoleHandler returns a colored handler writing to stdout.
// Kept exported so middleware.ColoredLogger can build a request logger.
func NewConsoleHandler(level slog.Level) slog.Handler {
	return newColoredHandler(os.Stdout, level)
}

func (h *coloredHandler) Enabled(_ context.Context, l slog.Level) bool { return l >= h.level }
func (h *coloredHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	n := *h
	n.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return &n
}
func (h *coloredHandler) WithGroup(string) slog.Handler { return h }

func (h *coloredHandler) Handle(_ context.Context, r slog.Record) error {
	var sb []byte
	sb = append(sb, cGray...)
	sb = append(sb, r.Time.Format("2006-01-02 15:04:05")...)
	sb = append(sb, cReset...)
	sb = append(sb, " │ "...)
	sb = append(sb, levelColor(r.Level)...)
	sb = append(sb, cBold...)
	sb = append(sb, fmt.Sprintf("%-5s", levelLabel(r.Level))...)
	sb = append(sb, cReset...)
	sb = append(sb, cReset...)
	sb = append(sb, " │ "...)
	sb = append(sb, cCyan...)
	sb = append(sb, "["+NewLogID()+"]"...)
	sb = append(sb, cReset...)
	sb = append(sb, " │ "...)
	sb = append(sb, cBold...)
	sb = append(sb, r.Message...)
	sb = append(sb, cReset...)

	appendAttr := func(a slog.Attr) {
		sb = append(sb, " "...)
		sb = append(sb, cGray...)
		sb = append(sb, a.Key...)
		sb = append(sb, "="...)
		sb = append(sb, cReset...)
		sb = append(sb, Redact(a.Key, a.Value.String())...)
	}
	for _, a := range h.attrs {
		appendAttr(a)
	}
	r.Attrs(func(a slog.Attr) bool {
		appendAttr(a)
		return true
	})
	sb = append(sb, '\n')

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.w.Write(sb)
	return err
}

// multiHandler fans out to several handlers.
type multiHandler struct{ hs []slog.Handler }

func (m multiHandler) Enabled(ctx context.Context, l slog.Level) bool {
	for _, h := range m.hs {
		if h.Enabled(ctx, l) {
			return true
		}
	}
	return false
}
func (m multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.hs {
		if h.Enabled(ctx, r.Level) {
			_ = h.Handle(ctx, r)
		}
	}
	return nil
}
func (m multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	hs := make([]slog.Handler, len(m.hs))
	for i, h := range m.hs {
		hs[i] = h.WithAttrs(attrs)
	}
	return multiHandler{hs}
}
func (m multiHandler) WithGroup(g string) slog.Handler {
	hs := make([]slog.Handler, len(m.hs))
	for i, h := range m.hs {
		hs[i] = h.WithGroup(g)
	}
	return multiHandler{hs}
}

// NewLogger writes colored lines to stdout + colored .log + JSON .jsonl (daily).
func NewLogger(level slog.Level, dir string) *slog.Logger {
	console := newColoredHandler(os.Stdout, level)
	coloredFile := newColoredHandler(&rotatingFile{dir: dir, ext: ".log"}, level)
	jsonFile := slog.NewJSONHandler(&rotatingFile{dir: dir, ext: ".jsonl"}, &slog.HandlerOptions{Level: level})
	return slog.New(multiHandler{hs: []slog.Handler{console, coloredFile, jsonFile}})
}

// LogError emits a structured ERROR with redacted-safe error context.
func LogError(logger *slog.Logger, ctx context.Context, msg string, err error, attrs ...any) {
	args := append([]any{"error_type", fmt.Sprintf("%T", err), "error", err.Error()}, attrs...)
	args = append(args, "log_id", NewLogID())
	logger.Log(ctx, slog.LevelError, msg, args...)
}
