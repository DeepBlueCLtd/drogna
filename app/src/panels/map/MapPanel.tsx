/**
 * The Map tab. Deck.gl and the arc's closing scene land at beat 109 (FR-40); until
 * then this panel says so instead of pretending. No fixture data, no placeholder
 * ocean: a surface that draws nothing real draws nothing (Constitution VII).
 */
export function MapPanel() {
  return (
    <div className="panel panel-prose map-pending">
      <h2>The map lands at beat 109</h2>
      <p>
        This tab will render the fields, the uncertainty decaying and refreshing, the
        planned route as a four-dimensional curve, and the advisories — once there is
        a generator to draw from and a seam to draw through. Nothing is shown until
        it can be shown truthfully.
      </p>
    </div>
  );
}
