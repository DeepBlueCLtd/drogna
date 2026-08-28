/**
 * A pane's statement of the standard that delivered its contents.
 *
 * The cheapest orientation the client can offer (FR-008): a small badge naming the
 * delivering standard, linking to that standard's primer on the published site where the
 * destination has declared one. The link is a navigation a viewer follows; the page never
 * fetches it. Where no site root is declared the badge still names the standard and says
 * there is no link — a stated absence, not a guessed location and not a hidden badge.
 *
 * A badge is a static architectural fact about a pane's delivery channel. It cannot light
 * anything, and it says nothing about whether any data has actually arrived — that is
 * each pane's own honest business.
 */
import { primerUrl } from "./standards";
import type { Standard } from "./standards";

export interface StandardBadgeProps {
  /** The standard that delivers this pane's contents. */
  readonly standard: Standard;
  /** The site's standards root, from the served configuration document, or undefined. */
  readonly standardsUrl: string | undefined;
}

export function StandardBadge({ standard, standardsUrl }: StandardBadgeProps): JSX.Element {
  const href = primerUrl(standardsUrl, standard);
  return (
    <span className="standard-badge" data-testid={`standard-badge-${standard.name}`} title={standard.delivers}>
      <span className="standard-badge-words">delivered by</span>{" "}
      {href === null ? (
        <span data-testid="standard-badge-unlinked">
          {standard.name}
          <span className="standard-badge-words"> — this destination declares no site root, so there is no primer link</span>
        </span>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" data-testid="standard-badge-link">
          {standard.name}
        </a>
      )}
    </span>
  );
}
