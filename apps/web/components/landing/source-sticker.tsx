"use client";

import { useState } from "react";

const xMarkPath =
  "M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.153h7.594l5.243 6.932zm-1.29 19.494h2.04L6.487 3.24H4.298z";

export function SourceSticker() {
  const [shineX, setShineX] = useState<number | null>(null);

  return (
    <div
      aria-hidden="true"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setShineX(Math.max(0, Math.min(24, ((event.clientX - bounds.left) / bounds.width) * 24)));
      }}
      onPointerLeave={() => {
        setShineX(null);
      }}
      className="absolute -top-20 -right-1 z-30 size-[108px] -rotate-8 text-ink transition-transform duration-300 select-none hover:-translate-y-2 hover:rotate-0 motion-reduce:transition-none sm:-top-24 sm:-right-7 sm:size-[128px]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-full drop-shadow-[0_5px_4px_rgba(17,17,17,0.25)]"
        focusable="false"
      >
        <title>X source sticker</title>
        <defs>
          <linearGradient
            id="source-sticker-shine"
            x1={shineX === null ? -8 : shineX - 4}
            y1="0"
            x2={shineX === null ? 0 : shineX + 4}
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ea9bb6" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ea9bb6" stopOpacity="0.65" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="0.65" stopColor="#9fb3df" stopOpacity="0.65" />
            <stop offset="1" stopColor="#9fb3df" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={xMarkPath}
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
          paintOrder="stroke fill"
        />
        {shineX !== null && <path d={xMarkPath} fill="url(#source-sticker-shine)" opacity="0.55" />}
      </svg>
    </div>
  );
}
