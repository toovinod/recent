export function FooterWordmark() {
  const depth = [
    { y: 18.4, fill: "#aaa79f" },
    { y: 18.05, fill: "#b5b2aa" },
    { y: 17.7, fill: "#c1beb5" },
    { y: 17.35, fill: "#cbc8bf" },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto mt-10 w-full max-w-[1600px] overflow-hidden px-4 pb-3 select-none md:px-8"
    >
      <svg
        viewBox="0 0 100 20"
        preserveAspectRatio="xMidYMin meet"
        role="presentation"
        className="block h-auto w-full max-w-full font-sans drop-shadow-[0_11px_13px_rgba(36,35,44,0.12)]"
      >
        {depth.map((layer) => (
          <text
            key={layer.y}
            x="0"
            y={layer.y}
            textLength="100"
            lengthAdjust="spacingAndGlyphs"
            fill={layer.fill}
            fontSize="18"
            fontWeight="750"
          >
            RECENT
          </text>
        ))}
        <text
          x="0"
          y="17"
          textLength="100"
          lengthAdjust="spacingAndGlyphs"
          fill="#ADB2D4"
          fontSize="18"
          fontWeight="750"
          className="[text-shadow:0_1px_0_rgba(255,255,255,0.55),0_3px_5px_rgba(44,42,51,0.06)]"
        >
          RECENT
        </text>
      </svg>
    </div>
  );
}
