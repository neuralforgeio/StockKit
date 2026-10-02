package version

import "runtime"

// Build metadata is injected via -ldflags at release time.
var (
	version   = "1.0.0"
	commit    = "dev"
	buildDate = "unknown"
	env       = "development"
)

type Runtime struct {
	Go            string `json:"go"`
	Next          string `json:"next"`
	Postgres      string `json:"postgres"`
	Redis         string `json:"redis"`
	ObjectStorage string `json:"object_storage"`
}

type Info struct {
	Version     string  `json:"version"`
	Commit      string  `json:"commit"`
	BuildDate   string  `json:"build_date"`
	Environment string  `json:"environment"`
	License     string  `json:"license"`
	Runtime     Runtime `json:"runtime"`
}

// Get returns the build and runtime metadata exposed by GET /api/v1/version.
func Get() Info {
	return Info{
		Version:     version,
		Commit:      commit,
		BuildDate:   buildDate,
		Environment: env,
		License:     "MIT",
		Runtime: Runtime{
			Go:            runtime.Version(),
			Next:          "16.3.4",
			Postgres:      "18.6",
			Redis:         "7",
			ObjectStorage: "minio",
		},
	}
}
