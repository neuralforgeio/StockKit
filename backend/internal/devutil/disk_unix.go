//go:build !windows

package devutil

import "syscall"

// DiskUsage returns free and total bytes for a path on unix.
func DiskUsage(path string) (free, total uint64, ok bool) {
	var fs syscall.Statfs_t
	if err := syscall.Statfs(path, &fs); err != nil {
		return 0, 0, false
	}
	free = uint64(fs.Bavail) * uint64(fs.Bsize)
	total = uint64(fs.Blocks) * uint64(fs.Bsize)
	return free, total, true
}
