import Link from "next/link";
import type { ReactNode } from "react";

export function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="none">
      <path
        d="M3.5 10h12m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span aria-hidden="true" className="relative inline-block size-6 -rotate-[14deg]">
      <span className="bg-accent absolute top-[3px] left-[3px] h-[5px] w-[21px] rotate-[7deg] rounded-[8px_2px_8px_2px]" />
      <span className="bg-accent absolute top-[10px] left-[3px] h-[5px] w-4 -rotate-[10deg] rounded-[8px_2px_8px_2px]" />
      <span className="bg-accent absolute top-[17px] left-[3px] h-[5px] w-[11px] -rotate-[26deg] rounded-[8px_2px_8px_2px]" />
    </span>
  );
}

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Recent home"
      className="inline-flex items-center gap-2.5 text-[23px] leading-none font-extrabold tracking-[-.075em] text-ink"
    >
      <BrandMark />
      <span>recent</span>
    </Link>
  );
}

export function PrimaryLink({ children, href = "/auth" }: { children: ReactNode; href?: string }) {
  return (
    <Link
      href={href}
      className="bg-accent text-night inline-flex min-h-12 items-center justify-between gap-10 rounded-lg px-5 text-[13px] font-semibold transition duration-200 hover:-translate-y-0.5 hover:bg-[#c0beff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      {children}
      <ArrowIcon />
    </Link>
  );
}
