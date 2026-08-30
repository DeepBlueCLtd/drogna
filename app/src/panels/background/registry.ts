/**
 * The course: the twelve explainers in order (FR-002, as feature 115 amends it). The order carries the
 * argument — why a standard at all, what shape the data is, how it is stored, what a
 * holding actually contains, the two ways it is served, the server that serves both,
 * how consumers hear about it, why the two paths never contend, the whole thing
 * turning, and what is allowed to leave.
 *
 * This list is load-bearing. The rail reads it, the anchor scheme reads it, and
 * SC-007's value-panel test enumerates from it rather than from a hand-written list.
 * Three consumers is what stops any of the three going stale independently, and what
 * stops SC-007 passing vacuously: a twelfth explainer joins the course, becomes
 * addressable and comes under test in one edit.
 *
 * Order is not viewer-rearrangeable. The rail shows position in it.
 */
import type { Explainer } from './model.js';
import { whyAStandard } from './explainers/why-a-standard.js';
import { pointsAndFields } from './explainers/points-and-fields.js';
import { netcdf } from './explainers/netcdf.js';
import { holdings } from './explainers/holdings.js';
import { analysis } from './explainers/analysis.js';
import { sensorthings } from './explainers/sensorthings.js';
import { edr } from './explainers/edr.js';
import { pygeoapi } from './explainers/pygeoapi.js';
import { mqtt } from './explainers/mqtt.js';
import { cqrs } from './explainers/cqrs.js';
import { controlLoop } from './explainers/control-loop.js';
import { boundary } from './explainers/boundary.js';

export const COURSE: readonly Explainer[] = [
  whyAStandard,
  pointsAndFields,
  netcdf,
  holdings,
  analysis,
  sensorthings,
  edr,
  pygeoapi,
  mqtt,
  cqrs,
  controlLoop,
  boundary,
];
