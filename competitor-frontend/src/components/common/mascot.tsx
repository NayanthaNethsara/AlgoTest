/**
 * judge_bot: a flat, single-color blocky face — square eyes, a bar mouth, no
 * shading. An original mark, not a redraw of any existing character. Reserved
 * for empty states; it should not become interface wallpaper.
 */
export function Mascot({
  variant = "default",
  size = 64,
  className,
}: {
  variant?: "default" | "muted";
  size?: number;
  className?: string;
}) {
  const outline =
    variant === "muted" ? "var(--muted-foreground)" : "var(--foreground)";
  const face = variant === "muted" ? "var(--muted)" : "var(--primary)";
  const feature = variant === "muted" ? "var(--secondary)" : "var(--teal-deep)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <rect x="0" y="0" width="8" height="1" fill={outline} />
      <rect x="0" y="1" width="1" height="1" fill={outline} />
      <rect x="1" y="1" width="6" height="1" fill={face} />
      <rect x="7" y="1" width="1" height="1" fill={outline} />
      <rect x="0" y="2" width="1" height="2" fill={outline} />
      <rect x="1" y="2" width="1" height="2" fill={face} />
      <rect x="2" y="2" width="1" height="2" fill={feature} />
      <rect x="3" y="2" width="2" height="2" fill={face} />
      <rect x="5" y="2" width="1" height="2" fill={feature} />
      <rect x="6" y="2" width="1" height="2" fill={face} />
      <rect x="7" y="2" width="1" height="2" fill={outline} />
      <rect x="0" y="4" width="1" height="1" fill={outline} />
      <rect x="1" y="4" width="6" height="1" fill={face} />
      <rect x="7" y="4" width="1" height="1" fill={outline} />
      <rect x="0" y="5" width="1" height="1" fill={outline} />
      <rect x="1" y="5" width="1" height="1" fill={face} />
      <rect x="2" y="5" width="4" height="1" fill={feature} />
      <rect x="6" y="5" width="1" height="1" fill={face} />
      <rect x="7" y="5" width="1" height="1" fill={outline} />
      <rect x="0" y="6" width="1" height="1" fill={outline} />
      <rect x="1" y="6" width="6" height="1" fill={face} />
      <rect x="7" y="6" width="1" height="1" fill={outline} />
      <rect x="0" y="7" width="8" height="1" fill={outline} />
    </svg>
  );
}
