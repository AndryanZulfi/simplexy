import type { HTMLAttributes } from "react";

interface PaperclipLockupProps extends HTMLAttributes<HTMLDivElement> {
  decorative?: boolean;
  title?: string;
}

export function PaperclipLockup({
  decorative = false,
  title = "Simplexy",
  className,
  ...rest
}: PaperclipLockupProps) {
  return (
    <div
      {...rest}
      className={`inline-flex items-center gap-2 font-bold tracking-tight text-foreground select-none ${className ?? ""}`}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      <img src="/simplexy-brand-symbol.png" alt="" className="h-7 w-auto object-contain" width="28" height="32" />
      <span className="text-xl font-bold tracking-tight">
        Simplexy<span className="text-primary">.</span>
      </span>
    </div>
  );
}
