/**
 * The map's layer registry (feature 114, FR-70).
 *
 * FR-61 held the component walkthrough to the shell's declared component list, so a
 * component with no step is reported by name rather than passing unnoticed. FR-70
 * generalises that: every tour is held to a list on disk, and the map's list is this one.
 *
 * It is two statements, and the pair is what makes the rule work:
 *
 *   - **`MAP_SUBJECTS`** is what the map offers a reader — the projections, the field,
 *     the doubt over it, the platform, the route, the advisories, the time control, the
 *     composer. The map tour is held to this: a subject with no step, or a step for a
 *     subject the map does not offer, is named (`uncoveredSubjects`).
 *   - **`LAYER_SUBJECT`** says which subject each drawn layer belongs to. The panel emits
 *     the ids it actually constructed, and a test holds them to this table, so a layer
 *     added to the panel and to nothing else is named too.
 *
 * A single list would not have done. A tour step per raw layer id would be twenty-three
 * steps, most of them about the same thing seen twice — `ownship-track` and
 * `cube-ownship-track` are one subject drawn in two coordinate systems — and a tour
 * nobody finishes is a tour that covers nothing. Held only at the subject level, a new
 * layer could be added under an existing subject and never be stepped or noticed. So the
 * layers are held to the subjects and the subjects are held to the tour, and a new layer
 * has to pass through both.
 */
import type { TourSubject } from '../../shell/walkthrough/tour.js';

/** What the map offers a reader. The map tour is held to exactly this list. */
export const MAP_SUBJECTS: readonly TourSubject[] = [
  { id: 'projections', label: 'plan, globe and depth volume', element: '[data-testid="projection-select"]' },
  { id: 'field', label: 'the field, from a genuine area query', element: '.map-canvas' },
  { id: 'doubt', label: 'the doubt over the field', element: '[data-testid="doubt-select"]' },
  { id: 'ownship', label: 'the platform’s track and demanded course', element: '[data-testid="ownship-status"]' },
  { id: 'route', label: 'the planner’s recommended route', element: '.map-canvas' },
  { id: 'advisories', label: 'shore advisories valid at the displayed instant', element: '.map-canvas' },
  { id: 'domain', label: 'the domain and the reference features', element: '.map-canvas' },
  { id: 'time', label: 'the time control', element: '[data-testid="time-control"]' },
  { id: 'composer', label: 'the EDR query composer', element: '[data-testid="composer"]' },
];

/**
 * Which subject each drawable layer belongs to. Keys are the layer ids the panel gives
 * deck.gl, exactly; the cube's per-level layers are keyed by their prefix because there
 * is one per level of the holding's own depth axis and the count is a fact about the
 * holding rather than about this file.
 */
export const LAYER_SUBJECT: Readonly<Record<string, string>> = {
  sphere: 'projections',
  graticule: 'projections',
  'cube-frame': 'projections',
  field: 'field',
  spread: 'doubt',
  doubt: 'doubt',
  'cube-level': 'field',
  domain: 'domain',
  reference: 'domain',
  'ownship-track': 'ownship',
  'ownship-reports': 'ownship',
  'ownship-demand': 'ownship',
  'cube-ownship-track': 'ownship',
  'cube-ownship-reports': 'ownship',
  'cube-ownship-demand': 'ownship',
  'cube-platform': 'ownship',
  advisories: 'advisories',
  route: 'route',
  'route-stops': 'route',
  'route-platform': 'route',
  'cube-route': 'route',
  'pick-position': 'composer',
  'cube-pick-position': 'composer',
};

/**
 * The subject a layer belongs to, or undefined where the registry does not know it. A
 * per-level cube layer is `cube-level-<depth>`, and the depth is the holding's business.
 */
export function subjectOfLayer(layerId: string): string | undefined {
  if (LAYER_SUBJECT[layerId]) return LAYER_SUBJECT[layerId];
  return layerId.startsWith('cube-level-') ? LAYER_SUBJECT['cube-level'] : undefined;
}

/** Layers the panel drew that this registry does not place. Named, never counted. */
export function unregisteredLayers(drawn: readonly string[]): string[] {
  return [...new Set(drawn.filter((id) => subjectOfLayer(id) === undefined))].sort();
}

/** Subjects the registry names that no layer or surface belongs to. */
export function subjectsWithoutLayers(): string[] {
  const claimed = new Set(Object.values(LAYER_SUBJECT));
  // `time` and `composer` are controls rather than layers, and are exempted by being
  // named here — an exemption written down is a decision; an absent one is an oversight.
  const controls = new Set(['time', 'composer']);
  return MAP_SUBJECTS.filter((subject) => !claimed.has(subject.id) && !controls.has(subject.id))
    .map((subject) => subject.id)
    .sort();
}
