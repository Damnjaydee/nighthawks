// src/components/ui/Card.tsx
import type { ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
};

export default function Card({ className = "", children }: Props) {
  return (
    <div className={`rounded-2xl border border-white/10 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ className = "", children }: Props) {
  return <div className={className}>{children}</div>;
}
