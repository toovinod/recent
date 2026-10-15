import Image from "next/image";

export function SourceAvatar({
  src,
  name,
  size = 48,
  className = "",
}: {
  src: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={`${name}'s X profile photo`}
      width={size}
      height={size}
      className={`shrink-0 rounded-md object-cover ${className}`}
    />
  );
}
