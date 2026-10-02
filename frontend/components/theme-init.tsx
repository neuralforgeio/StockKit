"use client";

import { useEffect } from "react";

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var mode = localStorage.getItem('stockkit.theme');
    if (!mode) mode = 'dark';
    if (mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {}
})();
`;

export function ThemeInit() {
  useEffect(() => {
    const script = document.createElement("script");
    script.innerHTML = THEME_INIT_SCRIPT;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return null;
}
