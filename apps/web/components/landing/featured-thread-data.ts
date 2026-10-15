export const featuredThread = {
  original: {
    author: "Tyler Denk",
    handle: "@denk_tweets",
    avatar: "/avatars/denk_tweets.jpg",
    href: "https://x.com/denk_tweets/status/2110371582153748942",
    title: "The backlog behind a beehiiv alternative",
    summary:
      "Denk responds to claims that someone could build a beehiiv alternative in a weekend. His post lists the delivery, editing, automation, payments, and operational work such a product would need.",
  },
  related: [
    {
      kind: "Counterpoint",
      author: "ILIAS ISM",
      handle: "@illyism",
      avatar: "/avatars/illyism.jpg",
      title: "A narrower product may need less infrastructure",
      summary:
        "In a quote post, ILIAS argues that a simpler stack could serve a narrower newsletter workflow and challenges the need for a long list of services.",
      href: "https://x.com/illyism/status/2110391249341755454",
    },
    {
      kind: "Reaction",
      author: "Arvid Kahl",
      handle: "@arvidkahl",
      avatar: "/avatars/arvidkahl.jpg",
      title: "A joke about handing the backlog to Claude",
      summary:
        "Kahl quote-posts Denk's list with a one-line joke about asking Claude to implement every item without mistakes.",
      href: "https://x.com/arvidkahl/status/2110424278109962670",
    },
    {
      kind: "Author follow-up",
      author: "Tyler Denk",
      handle: "@denk_tweets",
      avatar: "/avatars/denk_tweets.jpg",
      title: "What Denk learned by building instead of buying",
      summary:
        "Denk says he built software for his wellness club rather than pay for an existing product, then describes the time, ongoing software bill, and support work involved.",
      href: "https://x.com/denk_tweets/status/2110525853138637007",
    },
  ],
} as const;
