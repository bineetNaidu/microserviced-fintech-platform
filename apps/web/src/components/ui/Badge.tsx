import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
}

export function Badge({
  className = "",
  variant = "neutral",
  children,
  ...props
}: BadgeProps) {
  const baseClass = "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border transition-colors";
  
  const variants = {
    success: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50/50 text-amber-800",
    error: "border-red-200 bg-red-50/50 text-red-800",
    info: "border-blue-200 bg-blue-50/50 text-blue-800",
    neutral: "border-zinc-200 bg-zinc-50/50 text-zinc-800"
  };

  const dots = {
    success: "bg-emerald-600",
    warning: "bg-amber-600",
    error: "bg-red-600",
    info: "bg-blue-600",
    neutral: "bg-zinc-600"
  };

  const combinedClass = `${baseClass} ${variants[variant]} ${className}`.trim();

  return (
    <span className={combinedClass} {...props}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[variant]}`} />
      {children}
    </span>
  );
}
