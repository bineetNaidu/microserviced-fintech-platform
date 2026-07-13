import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonProps) {
  const baseClass = "inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer";
  
  const variants = {
    primary: "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 border border-transparent",
    secondary: "border border-zinc-200 hover:bg-zinc-50 text-foreground",
    danger: "bg-red-600 text-white hover:bg-red-700 border border-transparent",
    ghost: "hover:bg-zinc-100 text-foreground"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4",
    lg: "h-12 px-6 text-base"
  };

  const combinedClass = `${baseClass} ${variants[variant]} ${sizes[size]} ${className}`.trim();

  return (
    <button className={combinedClass} {...props}>
      {children}
    </button>
  );
}
