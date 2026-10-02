import { ErrorDisplay } from "@/components/error-display";

export default function NotFound() {
  return <ErrorDisplay status={404} />;
}
