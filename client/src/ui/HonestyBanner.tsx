/**
 * FR-01, and the first thing on the page.
 *
 * Not a footer, not a tooltip, not behind a link: the statement is above the fold at
 * desktop and at phone width, and it is in the initial HTML payload rather than arriving
 * with the script, so a viewer who never runs the bundle still reads it (SC-009). The
 * same words appear in `index.html`; a test compares the two so they cannot drift apart.
 *
 * Constitution V is why this is load-bearing. Numerics here are deliberately fake and the
 * data synthetic, and no artefact of the harness may imply otherwise. A page that looked
 * like a working system and said nothing would be the whole prohibition, broken, in the
 * one place people actually look.
 */
export const HONESTY_STATEMENT =
  "drogna is a learning harness. Its data is synthetic and its numerics are deliberately " +
  "fake. It is not a candidate system, and nothing shown here is evidence about any real " +
  "environment.";

export function HonestyBanner(): JSX.Element {
  return (
    <p className="honesty" data-testid="honesty-statement">
      {HONESTY_STATEMENT}
    </p>
  );
}
