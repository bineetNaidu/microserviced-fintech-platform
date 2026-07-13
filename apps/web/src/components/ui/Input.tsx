import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, helperText, type = "text", ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {label}
          </label>
        )}
        <input
          type={type}
          className={`swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? "border-red-500 focus:border-red-500" : ""
          } ${className}`.trim()}
          ref={ref}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-600">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span className="text-xs text-zinc-500">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
