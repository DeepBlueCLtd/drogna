/**
 * The provenance record that travels beside a curated image.
 *
 * Two obligations, and they pull in opposite directions, which is why this is its own
 * module with its own tests.
 *
 * **Enough to take the shot again** (FR-016). A picture on a blog outlives the machine it
 * was taken on, and a year later "what was this?" has to have an answer: which seeded run,
 * at what simulated time, through what size of window, at what device scale factor, with
 * which version of the capture procedure.
 *
 * **Nothing that leaks** (Constitution V, PR-01). A provenance record is a text file next
 * to a public image and it is exactly the kind of file that quietly carries an absolute
 * path with somebody's name in it, or the hostname of a deployment. So the record is
 * assembled from a fixed list of fields rather than from whatever the caller happened to
 * have, and `scrub` checks the result against the shapes that leak and refuses rather than
 * redacting: a record that had to be redacted is a record whose author did not know what
 * was in it.
 */

/** Fields a provenance record carries. Anything not here does not reach the file. */
export const PROVENANCE_FIELDS = [
  "image",
  "seed",
  "simTime",
  "viewport",
  "deviceScaleFactor",
  "entryPointVersion",
  "browser",
  "clockPinned",
  "litComponents",
  "caption",
];

/**
 * The shapes that leak, and the fields each does not apply to.
 *
 * The exemptions are the interesting part, and there are exactly two. Both exist because a
 * pattern drawn around a shape catches other things with that shape, and a check that
 * cries wolf is a check somebody turns off.
 *
 * - A simulation instant contains `hh:mm`, which reads as a host and port. It is
 *   simulation time from the clock, it is required by FR-016, and it names nothing.
 * - A browser version is four dot-separated numbers, which reads as an IPv4 address. It is
 *   required by the record for the same reason and names nothing either.
 *
 * Every other field is checked against every pattern, which is what the control cases in
 * `provenance.test.ts` exercise one at a time.
 */
const LEAK_PATTERNS = [
  ["an absolute filesystem path", /(^|[\s"'(])\/(?:home|Users|root|var|tmp|opt|mnt)\//, []],
  ["a home directory", /(^|[\s"'(])~\//, []],
  ["a URL", /\b[a-z][a-z0-9+.-]*:\/\//i, []],
  ["a bare host and port", /(?<![0-9A-Za-z_-])[a-z][a-z0-9.-]*:\d{2,5}\b/i, ["simTime"]],
  ["an IP address", /\b\d{1,3}(?:\.\d{1,3}){3}\b/, ["browser"]],
  ["a user name from an environment", /\b(?:USER|USERNAME|LOGNAME)\s*=/, []],
];

/**
 * Assemble the record.
 *
 * `image` is the file name alone and never a path: the record sits beside the image, so
 * the directory is already known to anyone reading it, and a directory is the commonest
 * way a path with a user name in it reaches a public file.
 */
export function provenance({
  imageName,
  seed,
  simTime,
  viewport,
  deviceScaleFactor,
  entryPointVersion,
  browser,
  clockPinned,
  litComponents,
  caption,
}) {
  return {
    image: imageName,
    seed,
    simTime,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor,
    entryPointVersion,
    browser: { name: browser.name, version: browser.version },
    // Whether the clock was pinned when the shot was taken, in the curator's own words.
    // A picture of a running system and a picture of a stopped one are different pictures,
    // and "simTime: not heard" alone does not say which of the two this is.
    clockPinned,
    // What was genuinely alive when the picture was taken. FR-018 and Constitution VII:
    // every lit component in the image was lit because a heartbeat from it arrived, and
    // this is the record of which ones those were. There is no mode in which this list
    // could have been arranged.
    litComponents: [...litComponents],
    caption,
  };
}

/** Every reason this record must not be written, or an empty list. */
export function leaks(record) {
  const found = [];
  for (const [field, value] of Object.entries(record)) {
    const text = JSON.stringify(value);
    for (const [what, pattern, exempt] of LEAK_PATTERNS) {
      if (exempt.includes(field)) {
        continue;
      }
      const match = pattern.exec(text);
      if (match !== null) {
        found.push(`${what} in ${field}: ${match[0].trim()}`);
      }
    }
  }
  const unexpected = Object.keys(record).filter((key) => !PROVENANCE_FIELDS.includes(key));
  for (const key of unexpected) {
    found.push(`an undeclared field: ${key}`);
  }
  return found;
}

/** The record, as the bytes that go on disk, or a thrown refusal naming what leaked. */
export function scrub(record) {
  const found = leaks(record);
  if (found.length > 0) {
    throw new Error(
      "this provenance record would be committed beside a public image and it carries " +
        `material that must not be published: ${found.join("; ")}. The record is ` +
        "assembled from a fixed list of fields; something has put a location into one of " +
        "them (Constitution V, PR-01, FR-016).",
    );
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}
