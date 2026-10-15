import type { Metadata } from "next";
import { LandingFooter, LandingHeader } from "../components/landing/chrome";
import { FeaturedThread } from "../components/landing/featured-thread";
import { LandingHero } from "../components/landing/hero";
import { NewsShowcase } from "../components/landing/news-showcase";
import { ProcessSection } from "../components/landing/process";

export const metadata: Metadata = {
  title: "Recent | Tech updates, grouped into stories",
  description:
    "Recent groups technology updates into stories with links to the original posts and reactions.",
};

export default function HomePage() {
  return (
    <main className="bg-paper text-ink overflow-x-hidden font-sans">
      <LandingHeader />
      <LandingHero />
      <NewsShowcase />
      <ProcessSection />
      <FeaturedThread />
      <LandingFooter />
    </main>
  );
}
