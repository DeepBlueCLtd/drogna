/**
 * A planted violation, held here permanently: an explainer that authors its own
 * colour instead of asking the mark vocabulary for a category. Two shapes drawn
 * apart by hue alone read as one shape in greyscale, which is the fault FR-011 makes
 * unwritable. It exists so check-background-marks has been watched catching it.
 * Never imported by anything.
 */
export function inlineColour() {
  return (
    <svg viewBox="0 0 10 10">
      <circle cx="3" cy="3" r="2" fill="#b4650f" />
      <circle cx="7" cy="7" r="2" fill="rgb(31, 108, 99)" />
      <rect x="1" y="1" width="8" height="8" stroke="darkorange" fill="none" />
    </svg>
  );
}
