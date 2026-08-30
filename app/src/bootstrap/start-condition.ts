/**
 * Choosing a start condition, and what choosing one does to the configuration
 * document (feature 118).
 *
 * Two things happen when a reader picks a situation on the welcome page, and only two.
 * The platform's initial vector is replaced by the condition's, which is an edit to
 * *configuration* and is digested into the manifest's participant entry like any other;
 * and the condition's id is carried into the run id and the manifest, so two visits that
 * chose differently are two runs rather than one identifier with two meanings. Everything
 * else the condition promises — the measurements, the analyses, the forecasts, the
 * advisories — is authored afterwards by the components that author them, on the clock's
 * own step (`preroll.ts`).
 *
 * The choice travels in the query string, `?start=<id>`, and not in the hash. The hash is
 * the view address (ADR-0032) and belongs to the shell; a link that names a view has been
 * naming one since feature 101, and putting the condition there would have meant either
 * a second grammar in `views.ts` or a link that opens the wrong tab. In the query string
 * the two compose without either knowing about the other: `?start=loitering#/view/map`
 * is a link to the map of a run on station.
 */
import type { ConfigRun, ConfigStartConditions, ConfigStartConditionsCondition } from '../generated/types.js';

/** The query-string key the choice travels in. */
export const START_PARAMETER = 'start';

/**
 * The condition an id names, or undefined. Undefined and "the default" are kept apart
 * here on purpose: the welcome page has to be able to tell a reader that the address
 * asked for something that does not exist, and a resolver that silently returned the
 * default could not.
 */
export function conditionById(
  document: ConfigStartConditions,
  id: string | undefined,
): ConfigStartConditionsCondition | undefined {
  if (id === undefined) return undefined;
  return document.conditions.find((candidate) => candidate.id === id);
}

/**
 * The default condition. Throws when the document's `default` names no condition,
 * because the alternative is a welcome page whose first card does not exist and a boot
 * with no situation at all — a configuration fault that must not be survivable.
 */
export function defaultCondition(document: ConfigStartConditions): ConfigStartConditionsCondition {
  const found = conditionById(document, document.default);
  if (!found) {
    throw new Error(
      `start_conditions.default names '${document.default}', which is not one of ${document.conditions
        .map((candidate) => candidate.id)
        .join(', ')}`,
    );
  }
  return found;
}

/** The condition named in a location's query string, if it names one at all. */
export function conditionFromSearch(
  document: ConfigStartConditions,
  search: string,
): ConfigStartConditionsCondition | undefined {
  return conditionById(document, new URLSearchParams(search).get(START_PARAMETER) ?? undefined);
}

/**
 * The query string that names a condition, preserving whatever else was in it. Returned
 * with its leading '?' so it can be written straight into an address, and empty when
 * nothing is left — a bare '?' in the address bar is noise a reader will copy.
 */
export function searchNaming(search: string, conditionId: string): string {
  const parameters = new URLSearchParams(search);
  parameters.set(START_PARAMETER, conditionId);
  const rendered = parameters.toString();
  return rendered === '' ? '' : `?${rendered}`;
}

/**
 * The configuration a condition runs under: the shipped document with the platform
 * standing where the condition says it stands.
 *
 * A copy, not a mutation. The document is imported once per page and a boot may happen
 * more than once — a manifest import re-boots (`main.tsx`) — so patching in place would
 * make the second boot's configuration depend on the first boot's choice.
 */
export function configForCondition(
  config: ConfigRun,
  condition: ConfigStartConditionsCondition,
): ConfigRun {
  return {
    ...config,
    platform: {
      ...config.platform,
      initial: {
        latitude: condition.platform.latitude,
        longitude: condition.platform.longitude,
        course_degrees: condition.platform.course_degrees,
        speed_m_per_s: condition.platform.speed_m_per_s,
        depth_m: condition.platform.depth_m,
      },
    },
  };
}

/** How many ticks a condition's pre-roll advances in total, for a progress reading. */
export function preRollTicks(condition: ConfigStartConditionsCondition): number {
  return condition.legs.reduce((total, leg) => total + leg.ticks, 0);
}
