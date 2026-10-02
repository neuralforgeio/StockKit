"use client";

import Script from "next/script";
import "@/app/globals.css";
import { ErrorDisplay } from "@/components/error-display";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("stockkit.theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=(!s||s==="system")?m:(s==="dark");var c=document.documentElement.classList;if(d){c.add("dark")}else{c.remove("dark")}}catch(e){}})();`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init-global-error"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body>
        <ErrorDisplay status={500} message={error.message} onRetry={reset} />
      </body>
    </html>
  );
}
