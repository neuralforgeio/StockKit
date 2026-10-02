//go:build windows

package devutil

import "golang.org/x/sys/windows"

// DiskUsage returns free and total bytes for a path on Windows.
func DiskUsage(path string) (free, total uint64, ok bool) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, false
	}
	var freeBytes, totalBytes, avail uint64
	err = windows.GetDiskFreeSpaceEx(p, &freeBytes, &totalBytes, &avail)
	if err != nil {
		return 0, 0, false
	}
	return freeBytes, totalBytes, true
}
