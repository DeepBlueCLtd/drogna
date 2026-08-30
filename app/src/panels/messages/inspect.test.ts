/**
 * The inspector's pure half (feature 114, FR-68), read against a real master rather
 * than a hand-written schema: `heartbeat` and `observation` are on disk, are amended
 * rather than rewritten, and are what the panel will actually be handed.
 */
import { describe, expect, it } from 'vitest';
import { schemaDocuments } from '../../generated/schema-documents.js';
import { createSeamValidator } from '../../seam/validate.js';
import { documentFaults, inspectFields, type SchemaNode } from './inspect.js';

const validator = createSeamValidator();
const heartbeat = schemaDocuments.heartbeat as SchemaNode;
const observation = schemaDocuments.observation as SchemaNode;

const goodHeartbeat = {
  component: 'clock',
  status: 'ok',
  sim_time: '2026-01-01T00:00:02.000000Z',
  tick: 2,
  heartbeat_interval_seconds: 2,
  liveness_window_seconds: 6,
};

describe('reading a payload against its master', () => {
  it('names a field as the master names it, and keeps the key beside it', () => {
    const fields = inspectFields(heartbeat, goodHeartbeat, []);
    const status = fields.find((field) => field.path === '/status');
    expect(status).toBeDefined();
    expect(status?.value).toBe('ok');
    // The master enumerates the statuses; the inspector says so rather than 'string'.
    expect(status?.declared).toContain('one of');
  });

  it('marks a refusal on the field that caused it, not above the document', () => {
    const verdict = validator.validate('heartbeat', { ...goodHeartbeat, tick: 'soon' });
    expect(verdict.ok).toBe(false);
    const fields = inspectFields(heartbeat, { ...goodHeartbeat, tick: 'soon' }, verdict.faults);
    const tick = fields.find((field) => field.path === '/tick');
    expect(tick?.faults.length).toBeGreaterThan(0);
    // And no other field wears the fault.
    expect(fields.filter((field) => field.faults.length > 0).map((field) => field.path)).toEqual([
      '/tick',
    ]);
    // Nothing is left over to print above the document.
    expect(documentFaults(verdict.faults, fields)).toEqual([]);
  });

  it('says a required field is absent rather than showing it blank', () => {
    const headless = { ...goodHeartbeat, component: undefined };
    delete headless.component;
    const verdict = validator.validate('heartbeat', headless);
    expect(verdict.ok).toBe(false);
    const fields = inspectFields(heartbeat, headless, verdict.faults);
    const component = fields.find((field) => field.path === '/component');
    expect(component?.absent).toBe(true);
    expect(component?.value).toBeUndefined();
    // A missing-property fault is about the object, not about the absent field, so it
    // stays a document fault rather than being silently attached to the row.
    expect(documentFaults(verdict.faults, fields).join(' ')).toContain('component');
  });

  it('says an optional field the payload omits is simply absent, with nothing claimed', () => {
    const untimed = { ...goodHeartbeat, tick: undefined };
    delete untimed.tick;
    const fields = inspectFields(heartbeat, untimed, []);
    const tick = fields.find((field) => field.path === '/tick');
    // The master does not require a tick, so its absence is not a fault and is not
    // dressed as one — the row states the shape and shows no value.
    expect(tick?.absent).toBe(false);
    expect(tick?.value).toBeUndefined();
  });

  it('shows a field the master does not describe rather than dropping it', () => {
    const payload = { ...goodHeartbeat, smuggled: 7 };
    const fields = inspectFields(heartbeat, payload, []);
    const extra = fields.find((field) => field.path === '/smuggled');
    expect(extra?.undescribed).toBe(true);
    expect(extra?.value).toBe('7');
  });

  it('shows a unit only where the master declares one', () => {
    // The heartbeat pairs a figure's value with its unit, and the master declares the
    // pairing; the inspector reads the unit from where the pairing puts it.
    const figures = (heartbeat.properties?.figures?.items ?? undefined) as SchemaNode | undefined;
    expect(figures?.properties?.unit).toBeDefined();
    const fields = inspectFields(figures, { key: 'rows', value: 12, unit: 'rows' }, []);
    expect(fields.find((field) => field.path === '/value')?.unit).toBe('rows');
    // A plain string field is not given a unit it was never declared with.
    expect(fields.find((field) => field.path === '/key')?.unit).toBeUndefined();
  });

  it('follows a $ref and opens what it names, rather than printing it as one blob', () => {
    // `location` is `{ "$ref": "#/$defs/location" }` in the master on disk. A reader
    // that stopped at the reference would show the richest field in the document as a
    // single line of JSON.
    const payload = {
      observation_id: 'o1',
      location: { latitude: 50.1, longitude: -1.2, depth_m: 50 },
    };
    const fields = inspectFields(observation, payload, []);
    expect(fields.map((field) => field.path)).toContain('/location/latitude');
    expect(fields.find((field) => field.path === '/location')?.value).toBeUndefined();
    expect(fields.find((field) => field.path === '/location/depth_m')?.value).toBe('50');
  });

  it('follows a $ref into another master, bringing that master’s own definitions', () => {
    // `coverage-holding` embeds the ground-truth manifest by naming its file. The
    // manifest's own $defs must be resolved against the manifest and not against the
    // holding, or a same-named definition would mean the wrong thing.
    const holding = schemaDocuments['coverage-holding'] as SchemaNode;
    const fields = inspectFields(
      holding,
      { holding_id: 'archive-2006', manifest: { grid: { latitude: { count: 24 } } } },
      [],
    );
    const manifest = fields.find((field) => field.path === '/manifest');
    expect(manifest?.value).toBeUndefined();
    expect(fields.map((field) => field.path)).toContain('/manifest/grid');
  });

  it('loses no fault: a fault the fields do not claim is a document fault', () => {
    const faults = [
      { path: '', message: 'must be object' },
      { path: '/nowhere/deep', message: 'must be number' },
    ];
    const fields = inspectFields(heartbeat, goodHeartbeat, faults);
    expect(documentFaults(faults, fields)).toEqual(['must be object', 'must be number']);
  });
});
