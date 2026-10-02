import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-solid text-white hover:bg-accent-solid-hover focus-visible:ring-accent/40 shadow-[0_1px_2px_rgba(16,20,26,0.12)]",
  secondary:
    "bg-bg text-fg border border-border hover:bg-bg-subtle hover:border-border-strong focus-visible:ring-border-strong",
  danger:
    "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/40",
  ghost:
    "bg-transparent text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:ring-border-strong",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-md",
  md: "px-3.5 py-2 text-sm rounded-lg",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
