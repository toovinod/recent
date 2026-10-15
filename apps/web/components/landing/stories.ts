export type Story = {
  handle: string;
  author: string;
  avatar: string;
  type: "Product" | "Opinion" | "Hands-on" | "In progress";
  topic: string;
  headline: string;
  summary: string;
  source: string;
};

export const stories: Story[] = [
  {
    handle: "@denk_tweets",
    author: "Tyler Denk",
    avatar: "/avatars/denk_tweets.jpg",
    type: "Opinion",
    topic: "AI-built products",
    headline: "The hidden work behind a weekend clone",
    summary:
      "Denk lists the delivery, editing, payments, analytics, and infrastructure work behind a beehiiv alternative in a critique of quick vibe-coded clones.",
    source: "https://x.com/denk_tweets/status/2110371582153748942",
  },
  {
    handle: "@poteto",
    author: "Lauren",
    avatar: "/avatars/poteto.jpg",
    type: "Product",
    topic: "Agent workflows",
    headline: "Lauren shares pstack for agent engineering",
    summary:
      "She describes pstack as her evolving set of skills for rigorous, autonomous engineering with agents and gives a short setup path.",
    source: "https://x.com/poteto/status/2110757066709356851",
  },
  {
    handle: "@badlogicgames",
    author: "Mario Zechner",
    avatar: "/avatars/badlogicgames.jpg",
    type: "In progress",
    topic: "Agent architecture",
    headline: "A new plugin system shaped by pi-durable",
    summary:
      "Zechner says he is designing a plugin system and finding that its ideas keep returning to pi-durable concepts.",
    source: "https://x.com/badlogicgames/status/2110462202188533862",
  },
  {
    handle: "@thsottiaux",
    author: "Tibo",
    avatar: "/avatars/thsottiaux.jpg",
    type: "Product",
    topic: "Model capacity",
    headline: "Changes aimed at fewer capacity interruptions",
    summary:
      "Tibo says additional compute and a series of changes have significantly reduced disruptive model-capacity messages.",
    source: "https://x.com/thsottiaux/status/2110750421367287996",
  },
  {
    handle: "@dhh",
    author: "DHH",
    avatar: "/avatars/dhh.jpg",
    type: "Opinion",
    topic: "Software work",
    headline: "DHH's case for the future of making software",
    summary:
      "DHH argues that writing code by hand is losing economic value at many companies while remaining optimistic about making software.",
    source: "https://x.com/dhh/status/2102936073642869121",
  },
  {
    handle: "@karpathy",
    author: "Andrej Karpathy",
    avatar: "/avatars/karpathy.jpg",
    type: "Opinion",
    topic: "AI capability",
    headline: "The gap in understanding LLMs is widening",
    summary:
      "Karpathy revisits an earlier post and says people are diverging further in their understanding of current language-model capability.",
    source: "https://x.com/karpathy/status/2109361546505966046",
  },
  {
    handle: "@thdxr",
    author: "Dax",
    avatar: "/avatars/thdxr.jpg",
    type: "Product",
    topic: "OpenCode",
    headline: "OpenCode 2.0 and a usage milestone",
    summary:
      "Dax says usage has climbed since OpenCode 2.0 and that the project is approaching two million daily active users.",
    source: "https://x.com/thdxr/status/2110544790764794231",
  },
  {
    handle: "@LowLevelTweets",
    author: "Low Level",
    avatar: "/avatars/LowLevelTweets.jpg",
    type: "Hands-on",
    topic: "Reverse engineering",
    headline: "A firmware task completed with GLM-5.3",
    summary:
      "Low Level reports using GLM-5.3 to finish a firmware reverse-engineering task in 15 minutes that previously took one to three days.",
    source: "https://x.com/LowLevelTweets/status/2108185681118068882",
  },
  {
    handle: "@samlambert",
    author: "Sam Lambert",
    avatar: "/avatars/samlambert.jpg",
    type: "Opinion",
    topic: "Cloud architecture",
    headline: "A warning against tight cloud coupling",
    summary:
      "Lambert argues that binding an architecture too tightly to a single cloud is a poor choice in the current era.",
    source: "https://x.com/samlambert/status/2110117612462235973",
  },
  {
    handle: "@mattpocockuk",
    author: "Matt Pocock",
    avatar: "/avatars/mattpocockuk.jpg",
    type: "Opinion",
    topic: "Agent skills",
    headline: "What skills add to a good process",
    summary:
      "Pocock says a strong process can work without agent skills, but skills make that process easier to follow.",
    source: "https://x.com/mattpocockuk/status/2110400432132530260",
  },
];
