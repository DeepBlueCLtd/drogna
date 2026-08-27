/**
 * What must match for two captures to be comparable, and what is merely recorded.
 *
 * A difference between two images is evidence only if everything except the change under
 * evidence was the same. Two halves taken in different browsers, at different sizes, at
 * different device scale factors, from different seeds, or one locally and one in CI,
 * produce a difference that looks exactly like evidence and is not. That is the failure
 * this module exists to prevent, and it prevents it by refusing rather than by warning:
 * a warning beside a convincing picture is a warning nobody reads.
 *
 * **Comparability fields and recorded observations are not the same list, and the reason
 * is FR-007.** The pair pins the clock to zero for the duration of *each* capture and
 * restores the previous rate afterwards, which means the simulation runs between the two
 * halves and simulated time necessarily differs across them. Comparing simulated time as
 * a comparability field would therefore refuse every pair the mechanism can produce. So it
 * is recorded on both sides, reported in the difference summary, and left out of the
 * refusal — while the run identifier, which is what says the two halves came from the same
 * seeded run at all, is a comparability field and does refuse. FR-009 names simulation
 * time among the fields a fingerprint carries and this carries it; what it cannot also be
 * is a field whose difference refuses, without contradicting FR-007.
 *
 * Pure. No browser, no filesystem, no clock. That is what lets the fingerprint tests
 * exercise every refusal without a running client, which is the only way the refusals get
 * exercised at all.
 */

/**
 * The fields two halves must agree on, in the order a person would want to read them.
 *
 * Each is a dotted path into the fingerprint document. Adding a field here makes the
 * refusal stricter, which is the safe direction; removing one needs an argument.
 */
export const COMPARABILITY_FIELDS = [
  "browser.name",
  "browser.version",
  "browser.playwrightVersion",
  "browser.containerImage",
  "viewport.width",
  "viewport.height",
  "viewport.deviceScaleFactor",
  "scenario.seed",
  "scenario.runId",
  "capture.environment",
  "capture.entryPointVersion",
];

/**
 * What is recorded on both sides but never refused on.
 *
 * Simulated time is here for the reason argued above. The lit components are here because
 * they are the subject of the change under evidence as often as not: a pair captured
 * across the simulation clock's grey-to-lit transition differs in exactly this field, and
 * a mechanism that refused on it could never evidence the one transition it was built for.
 */
export const RECORDED_FIELDS = ["clock.simTime", "clock.runDisplay", "lit"];

function at(document, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), document);
}

function render(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Why these two halves cannot be compared, one message per field, or an empty list.
 *
 * The message names the field and both values. "The fingerprints differ" sends a person
 * to open two JSON documents side by side; "browser.version: 141.0.7390.37 before,
 * 142.0.7444.12 after" does not.
 */
export function incomparabilities(before, after) {
  const found = [];
  for (const field of COMPARABILITY_FIELDS) {
    const left = at(before, field);
    const right = at(after, field);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      found.push(`${field}: ${render(left)} before, ${render(right)} after`);
    }
  }
  return found;
}

/** Whether a diff may be produced from these two halves at all. */
export function comparable(before, after) {
  return incomparabilities(before, after).length === 0;
}

/**
 * The refusal, as a sentence.
 *
 * Written to be read by whoever is about to conclude something from a picture.
 */
export function refusalMessage(before, after) {
  const reasons = incomparabilities(before, after);
  if (reasons.length === 0) {
    return null;
  }
  return [
    "these two halves are not comparable, so no difference will be produced from them.",
    "A difference between captures that were not taken in the same conditions looks like",
    "evidence and is not. What differs:",
    ...reasons.map((reason) => `  - ${reason}`),
  ].join("\n");
}

/**
 * Assemble a fingerprint document from parts the caller observed.
 *
 * Deliberately a plain assembly with no defaults: a fingerprint field that quietly filled
 * itself in would agree with its opposite number for reasons neither half observed.
 */
export function fingerprint({ browser, viewport, scenario, capture, clock, lit }) {
  return {
    browser: {
      name: browser.name,
      version: browser.version,
      playwrightVersion: browser.playwrightVersion,
      containerImage: browser.containerImage,
    },
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
    },
    scenario: { seed: scenario.seed, runId: scenario.runId },
    capture: {
      environment: capture.environment,
      entryPointVersion: capture.entryPointVersion,
      side: capture.side,
    },
    clock: { simTime: clock.simTime, runDisplay: clock.runDisplay },
    lit: [...lit],
  };
}
