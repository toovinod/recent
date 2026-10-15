import { featuredThread } from "./featured-thread-data";
import { ArrowIcon } from "./primitives";
import { SourceAvatar } from "./source-avatar";

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs font-semibold text-[#5f55af] transition hover:gap-3 focus-visible:outline-2 focus-visible:outline-accent"
    >
      Read the original on X <ArrowIcon className="size-4" />
    </a>
  );
}

export function FeaturedThread() {
  const { original, related } = featuredThread;

  return (
    <section
      id="featured-thread"
      aria-labelledby="featured-thread-title"
      className="bg-[#f0efe9] px-6 py-25 text-ink md:px-10 md:py-32"
    >
      <div className="mx-auto max-w-[1260px]">
        <div className="grid gap-6 md:grid-cols-[1fr_.8fr] md:items-end">
          <h2
            id="featured-thread-title"
            className="max-w-[690px] text-[clamp(43px,5vw,70px)] leading-[1.06] font-medium tracking-[-.07em]"
          >
            Read the reactions beside the original.
          </h2>
          <p className="max-w-[520px] text-sm leading-7 text-muted md:ml-auto">
            Tyler Denk describes the work behind a newsletter platform. Read his post beside the
            responses from other builders, with every voice linked to X.
          </p>
        </div>
        <div className="mt-16 grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-22">
          <article className="border-t-[3px] border-[#938bef] pt-7">
            <div className="flex items-center gap-3">
              <SourceAvatar
                src={original.avatar}
                name={original.author}
                size={56}
                className="size-14"
              />
              <div className="leading-tight">
                <strong className="block text-sm">{original.author}</strong>
                <span className="mt-1 block text-xs text-muted">
                  {original.handle} / Original post
                </span>
              </div>
            </div>
            <h3 className="mt-10 max-w-[560px] text-[clamp(37px,3.6vw,54px)] leading-[1.07] font-medium tracking-[-.06em]">
              {original.title}
            </h3>
            <p className="mt-6 max-w-[540px] text-[15px] leading-7 text-[#686972]">
              {original.summary}
            </p>
            <div className="mt-8">
              <SourceLink href={original.href} />
            </div>
          </article>
          <div className="border-t border-ink/15">
            {related.map((post) => (
              <article key={post.href} className="border-b border-ink/15 py-7 first:pt-7">
                <div className="flex items-center gap-3">
                  <SourceAvatar
                    src={post.avatar}
                    name={post.author}
                    size={46}
                    className="size-11"
                  />
                  <div className="leading-tight">
                    <strong className="block text-[13px]">{post.author}</strong>
                    <span className="mt-1 block text-xs text-muted">
                      {post.handle} / {post.kind}
                    </span>
                  </div>
                </div>
                <h3 className="mt-5 max-w-[590px] text-[clamp(23px,2.2vw,30px)] leading-[1.16] font-medium tracking-[-.045em]">
                  {post.title}
                </h3>
                <p className="mt-3 max-w-[590px] text-sm leading-6 text-[#686972]">
                  {post.summary}
                </p>
                <div className="mt-5">
                  <SourceLink href={post.href} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
