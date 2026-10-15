import { featuredThread } from "./featured-thread-data";
import { ArrowIcon, PrimaryLink } from "./primitives";
import { SourceAvatar } from "./source-avatar";
import { SourceSticker } from "./source-sticker";

function SourceSheet() {
  const posts = [featuredThread.original, featuredThread.related[0], featuredThread.related[2]];

  return (
    <div className="relative z-10 mx-auto h-full w-full max-w-[380px] bg-white p-6 shadow-[0_25px_65px_#22222224] sm:p-8 lg:-mr-10">
      <SourceSticker />
      <div className="border-b border-ink/15 pb-5">
        <span className="text-[13px] font-semibold">Original posts on X</span>
        <p className="mt-1 text-xs text-muted">Start with the original, then read the responses.</p>
      </div>
      <div>
        {posts.map((post, index) => (
          <a
            key={post.href}
            href={post.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3.5 border-b border-ink/10 py-5 transition hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <SourceAvatar src={post.avatar} name={post.author} size={42} className="size-10" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                <strong>{post.author}</strong>
                <span className="text-muted">{post.handle}</span>
              </span>
              <span className="mt-2 block text-[14px] leading-5 font-medium">{post.title}</span>
              <span className="mt-2 block text-[11px] text-[#655bbb]">
                {index === 0 ? "Original post" : index === 1 ? "Counterpoint" : "Author follow-up"}
              </span>
            </span>
          </a>
        ))}
      </div>
      <p className="pt-4 text-[11px] leading-5 text-muted">
        Open any post to read the author&apos;s full conversation on X.
      </p>
    </div>
  );
}

function StorySheet() {
  return (
    <div className="relative flex min-h-[560px] flex-col bg-[#dddaf0] px-7 pt-14 pb-8 text-ink shadow-[0_25px_65px_#22222212] sm:px-12 sm:pt-18 lg:pl-22">
      <div className="flex items-center justify-between gap-3 border-b border-ink/15 pb-5 text-xs font-medium">
        <span>Newsletter software</span>
        <span className="text-muted">Posts and reactions on X</span>
      </div>
      <div className="my-auto py-11">
        <h2 className="max-w-[690px] text-[clamp(40px,4.5vw,65px)] leading-[1.03] font-medium tracking-[-.07em]">
          A weekend build.
          <br />
          The work that follows.
        </h2>
        <p className="mt-7 max-w-[580px] text-[15px] leading-7 text-[#565663]">
          Tyler Denk describes the delivery, editor, payments, and operations behind a newsletter
          platform. Other builders respond with different views on what a smaller product needs.
        </p>
      </div>
      <div className="flex flex-col gap-5 border-t border-ink/15 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-[340px] text-xs leading-5 text-[#686775]">
          Denk&apos;s original post, a counterpoint, and his follow-up are shown together.
        </p>
        <a
          href="#featured-thread"
          className="inline-flex shrink-0 items-center gap-3 text-xs font-semibold transition hover:gap-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Read the reactions <ArrowIcon className="size-4" />
        </a>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="overflow-hidden bg-[#f2f0eb] px-6 pt-20 pb-25 text-ink sm:pt-26 md:px-10"
    >
      <div className="mx-auto max-w-[1220px]">
        <div className="grid gap-7 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
          <h1
            id="hero-title"
            className="max-w-[850px] text-[clamp(49px,6.3vw,91px)] leading-[1.04] font-medium tracking-[-.075em]"
          >
            Tech updates, grouped into stories.
          </h1>
          <div className="max-w-[400px] pb-1 lg:ml-auto">
            <p className="text-[15px] leading-7 text-[#666772]">
              Recent collects posts from selected X accounts and feeds, connects related updates,
              and publishes short news posts with source links and attributed reactions.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-6">
              <PrimaryLink>Open the feed</PrimaryLink>
              <a
                href="#how-it-works"
                className="text-xs font-medium text-ink/70 transition hover:text-ink"
              >
                How it works ↗
              </a>
            </div>
          </div>
        </div>
        <div className="relative mt-25 grid items-stretch gap-8 lg:grid-cols-[.38fr_.62fr] lg:gap-0 motion-safe:animate-[landing-card-enter_750ms_ease-out_both]">
          <SourceSheet />
          <StorySheet />
        </div>
      </div>
    </section>
  );
}
