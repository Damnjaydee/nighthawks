import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "solid";
};

export default function Button({
  variant = "solid",
  className = "",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-full px-4 py-2 transition";
  const styles =
    variant === "ghost"
      ? "border border-white/15 bg-white/5 hover:bg-white/10 text-white/80"
      : "bg-white text-black hover:bg-white/90";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
