/**
 * The four absences, each said once, in the one place both views read them from.
 *
 * FR-007 asks that absence be stated rather than left to look like health, and story 3's
 * third acceptance scenario asks something sharper: that volume mode state the empty case
 * "exactly as the flat map states it". Two components writing two sentences about the same
 * nothing is how those two sentences drift, and by the time they have drifted a reader has
 * no way to tell whether the two views are looking at different data or at the same data
 * described differently. So the sentences live here, and both views print the constant.
 *
 * They are four rather than one because they are four different facts, and a display that
 * flattened them into "no data" would have thrown away the informative half. No field
 * received is a system that has not published yet. No plan received is a planner that has
 * not recommended yet. No extent is a destination that never said where the scenario is.
 * No drawing surface is a browser that cannot draw at all, which is not a fact about the
 * harness in any way — and telling a viewer the harness is empty when the fault is in
 * their own graphics stack would be the display being confidently wrong about somebody
 * else's machine.
 *
 * None of these stands in for data. Constitution VII's extension forbids drawing what was
 * not received; the corollary is that what is shown in its place must read as an absence
 * and never as a value.
 */

/** No run has been announced, or none has been read yet. */
export const NO_FIELD_RECEIVED =
  "No field has been received. The extent and its graticule are drawn because the " +
  "destination stated where the scenario is; nothing inside them is drawn, because " +
  "nothing has been published for this page to fetch. This is the absence of data, not " +
  "the absence of a display.";

/** A run was announced and the field could not be read. */
export function fieldNotRead(collection: string, because: string): string {
  return (
    `A run was announced and its field could not be read. The page asked the query layer ` +
    `for collection ${collection} and ${because}. Nothing is drawn in its place: a field ` +
    `assembled from anything but that response would be this page inventing one.`
  );
}

/** The destination named no cube path, or no parameter, so nothing can be asked for. */
export function cannotAskForField(missing: string): string {
  return (
    `A run was announced and this page has not been told ${missing}, so it cannot ask for ` +
    `the field. The announcement is real and the request is not one this page can ` +
    `assemble; the served configuration is where that is fixed.`
  );
}

/** No plan has been published, so there is no route. */
export const NO_PLAN_RECEIVED =
  "No plan has been published, so no route is drawn. A line between two points would be " +
  "this page inventing a recommendation, which is the one thing it must not do.";

/** No extent from either source: no announcement, and no declaration. */
export const NO_EXTENT_DECLARED =
  "No extent is known. No run has been announced, so no published grid has stated its " +
  "bounds, and the served configuration declares none either. A frame drawn around " +
  "coordinates nobody served would be this page inventing geography, so none is drawn.";

/** The browser offers no drawing surface. Said in full, with the reason. */
export function noDrawingSurface(because: string): string {
  return (
    `The map cannot be drawn here: ${because}. Every other panel on this page is ` +
    `unaffected and is showing what it has received. This says nothing about the ` +
    `harness — it is a statement about the browser this page is being read in.`
  );
}
