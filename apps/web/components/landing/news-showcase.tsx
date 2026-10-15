"use client";

import { useEffect, useState } from "react";
import { ArrowIcon } from "./primitives";
import { SourceAvatar } from "./source-avatar";
import { type Story, stories } from "./stories";

const enterDelay = [
  "[animation-delay:0ms]",
  "[animation-delay:70ms]",
  "[animation-delay:140ms]",
  "[animation-delay:210ms]",
  "[animation-delay:280ms]",
] as const;

function SourceRow({ story, index }: { story: Story; index: number }) {
  return (
    <a
      href={story.source}
      target="_blank"
      rel="noopener noreferrer"
      className={`group grid gap-5 border-t border-ink/15 px-2 py-7 text-ink transition-colors duration-300 hover:bg-[#eeecfa] focus-visible:bg-[#eeecfa] focus-visible:outline-2 focus-visible:outline-accent md:grid-cols-[205px_minmax(0,1fr)_minmax(230px,.8fr)_24px] md:items-center md:gap-7 md:px-4 md:py-8 motion-safe:animate-[landing-card-enter_500ms_ease-out_both] ${enterDelay[index] ?? ""}`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <SourceAvatar src={story.avatar} name={story.author} size={54} className="size-13" />
        <span className="min-w-0 leading-tight">
          <strong className="block truncate text-[14px] font-semibold">{story.author}</strong>
          <span className="mt-1 block truncate text-xs text-muted">{story.handle}</span>
        </span>
      </div>
      <div>
        <span className="text-[11px] font-medium text-[#655bbb]">
          {story.type} / {story.topic}
        </span>
        <h3 className="mt-2 max-w-[550px] text-[clamp(23px,2.1vw,31px)] leading-[1.13] font-medium tracking-[-.05em]">
          {story.headline}
        </h3>
      </div>
      <p className="max-w-[380px] text-[13px] leading-6 text-[#686972]">{story.summary}</p>
      <ArrowIcon className="hidden size-5 text-ink/50 transition-transform group-hover:translate-x-1 md:block" />
      <span className="inline-flex items-center gap-2 text-xs font-semibold md:hidden">
        Read the original post <ArrowIcon className="size-4" />
      </span>
    </a>
  );
}

export function NewsShowcase() {
  const [batch, setBatch] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (hovered || focused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setBatch((current) => 1 - current), 14000);
    return () => window.clearInterval(timer);
  }, [hovered, focused]);

  const visibleStories = stories.slice(batch * 5, batch * 5 + 5);

  return (
    <section
      id="story-preview"
      aria-labelledby="stories-title"
      className="bg-paper px-6 py-26 text-ink md:px-10 md:py-32"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onTouchStart={() => setHovered(true)}
    >
      <div className="mx-auto max-w-[1260px]">
        <div className="grid gap-7 md:grid-cols-[1fr_.8fr] md:items-end">
          <h2
            id="stories-title"
            className="max-w-[750px] text-[clamp(43px,5vw,70px)] leading-[1.05] font-medium tracking-[-.07em]"
          >
            People first. Original posts attached.
          </h2>
          <p className="max-w-[450px] text-sm leading-7 text-muted md:ml-auto">
            These posts cover product changes, hands-on work, and opinions about AI and software.
            Open any one to read the author&apos;s original words.
          </p>
        </div>
        <div key={batch} className="mt-14 border-b border-ink/15" aria-live="off">
          {visibleStories.map((story, index) => (
            <SourceRow key={story.source} story={story} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
