"use client";

import { useEffect, useState } from "react";

export function PublishedTime({ value }: { value: string }) {
  const [label, setLabel] = useState(
    () => `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`,
  );
  useEffect(() => {
    setLabel(new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }));
  }, [value]);
  return (
    <time dateTime={value} className="text-muted">
      {label}
    </time>
  );
}
