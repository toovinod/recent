export function ProcessSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="process-title"
      className="bg-night px-6 py-24 text-white md:px-10 md:py-32"
    >
      <div className="mx-auto max-w-[1220px]">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-24">
          <div>
            <p className="mb-8 text-sm text-white/55">How Recent works</p>
            <h2
              id="process-title"
              className="max-w-[680px] text-[clamp(48px,6vw,84px)] leading-[1.03] font-medium tracking-[-.07em]"
            >
              Follow the story from the first update to the latest reaction.
            </h2>
          </div>
          <div className="flex flex-col justify-end gap-10 lg:pb-2">
            <p className="max-w-[500px] border-t border-white/20 pt-5 text-[16px] leading-7 text-white/75">
              Recent brings together posts from selected X accounts and news sites. You can see who
              posted each update, when it appeared, and where to read it in full.
            </p>
            <p className="max-w-[500px] border-t border-white/20 pt-5 text-[16px] leading-7 text-white/75">
              Updates about the same event appear together, so you can see what happened first and
              what changed later.
            </p>
            <p className="max-w-[500px] border-t border-white/20 pt-5 text-[16px] leading-7 text-white/75">
              Short news posts make each development easy to scan. Original sources and attributed
              reactions stay with the story.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
