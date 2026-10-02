"use client";

import { ErrorDisplay } from "@/components/error-display";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const status = Number((error as any)?.status ?? 0) || 500;
  return (
    <ErrorDisplay status={status} message={error.message} onRetry={reset} />
  );
}
