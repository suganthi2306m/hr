/**
 * Brand wordmark: "Live" uses primary; "Track" inherits parent text color.
 */
export function LiveTrackWordmark({ as: Component = 'span', className = '', ...rest }) {
  return (
    <Component className={className} {...rest}>
      <span className="text-primary">Live</span>
      <span>Track</span>
    </Component>
  );
}
