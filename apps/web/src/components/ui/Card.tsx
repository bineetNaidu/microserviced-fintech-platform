import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ className = "", hoverable = false, children, ...props }: CardProps) {
  const baseClass = "swiss-card p-6 rounded-none bg-transparent";
  const hoverClass = hoverable ? "hover:border-foreground cursor-pointer transition-colors duration-150" : "";
  const combinedClass = `${baseClass} ${hoverClass} ${className}`.trim();
  
  return (
    <div className={combinedClass} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-1.5 mb-4 ${className}`.trim()} {...props} />;
}

export function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-lg font-medium leading-none tracking-tight ${className}`.trim()}
      {...props}
    />
  );
}

export function CardDescription({ className = "", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-sm text-zinc-500 ${className}`.trim()}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`${className}`.trim()} {...props} />;
}

export function CardFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center pt-4 mt-4 border-t border-zinc-200 ${className}`.trim()}
      {...props}
    />
  );
}
