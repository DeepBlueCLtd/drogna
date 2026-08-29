/**
 * Derive the broker topology from the components' configuration (SRD-v2 FR-25, E14).
 *
 * The topic list is scanned from app/config/run.json — the declarations the
 * components are actually constructed from — never from a hand-maintained document.
 * Output: contracts/topology.json, of topology.schema.json shape, gated by
 * scripts/gates/check-topology-drift.ts. Deterministic: no version, no timestamp,
 * sorted topics — a drift finding is a change somebody made.
 *
 * The shell's read-everything filter ('#') is recorded as its role's permission and
 * deliberately not as a topic entry: it names no namespace, and the entries are the
 * things said, not the licence to hear them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(repoRoot, 'app', 'config', 'run.json');
const configText = readFileSync(configPath, 'utf8');
const configLines = configText.split('\n');
const runConfig = JSON.parse(configText) as Record<string, unknown>;

interface Site {
  component: string | null;
  path: string;
  line: number;
  constant: string;
}

interface TopicEntry {
  topic: string;
  namespace: string;
  schema: string | null;
  publishers: string[];
  subscribers: string[];
  named_by: Site[];
}

function lineOf(literal: string, nearPointer: string): number {
  // The literal's line in the config file. Where a string appears more than once,
  // the pointer's last segment key narrows it; failing that, the first occurrence
  // stands — the site is a finding aid, not an identity.
  const needle = `"${literal}"`;
  const keyHint = nearPointer.split('/').at(-1) ?? '';
  const candidates = configLines
    .map((text, index) => ({ text, line: index + 1 }))
    .filter((entry) => entry.text.includes(needle));
  const hinted = candidates.find((entry) => entry.text.includes(`"${keyHint}"`));
  return (hinted ?? candidates[0])?.line ?? 1;
}

// ---- collect the named topics and filters, with provenance -------------------

const sites = new Map<string, Site[]>();
function record(topic: string, component: string | null, pointer: string): void {
  const list = sites.get(topic) ?? [];
  list.push({ component, path: 'app/config/run.json', line: lineOf(topic, pointer), constant: pointer });
  sites.set(topic, list);
}

const componentKeys = Object.keys(runConfig).filter(
  (key) => typeof runConfig[key] === 'object' && runConfig[key] !== null && 'id' in (runConfig[key] as object),
);

for (const key of componentKeys) {
  const component = runConfig[key] as Record<string, unknown> & { id: string };
  const topics = (component.topics ?? {}) as Record<string, unknown>;
  for (const [topicKey, value] of Object.entries(topics)) {
    if (typeof value === 'string' && value !== '#' && value.includes('/')) {
      record(value, component.id, `/${key}/topics/${topicKey}`);
    }
  }
}

// The sensors' concrete observation topics, enumerated from their declarations.
const sensors = runConfig.sensors as {
  id: string;
  topics: { observation_prefix: string };
  platform: { thing_id: string };
  instruments: { datastream_id: string }[];
};
sensors.instruments.forEach((instrument, index) => {
  record(
    `${sensors.topics.observation_prefix}/${sensors.platform.thing_id}/${instrument.datastream_id}`,
    sensors.id,
    `/sensors/instruments/${index}/datastream_id`,
  );
});

// ---- roles, components, coverage --------------------------------------------

const broker = runConfig.broker as { roles: { role: string; publish: string[]; subscribe: string[] }[] };
const shell = runConfig.shell as { id: string; role: string; message_schemas: { filter: string; schema: string }[] };

const roleOfComponent = new Map<string, string>(componentKeys.map((key) => {
  const component = runConfig[key] as { id: string; role?: string };
  return [component.id, component.role ?? component.id];
}));

function filterCovers(allowed: string, requested: string): boolean {
  const a = allowed.split('/');
  const r = requested.split('/');
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '#') return true;
    if (i >= r.length) return false;
    if (r[i] === '#') return false;
    if (a[i] === '+') continue;
    if (r[i] === '+') return false;
    if (a[i] !== r[i]) return false;
  }
  return a.length === r.length;
}

function componentsWhoseRoleAllows(direction: 'publish' | 'subscribe', topic: string): string[] {
  const roles = broker.roles.filter((role) => role[direction].some((filter) => filterCovers(filter, topic)));
  const roleNames = new Set(roles.map((role) => role.role));
  return [...roleOfComponent.entries()]
    .filter(([, role]) => roleNames.has(role))
    .map(([component]) => component)
    .sort();
}

function schemaFor(topic: string): string | null {
  const mapping = shell.message_schemas.find(
    (entry) => entry.filter === topic || filterCovers(entry.filter, topic),
  );
  return mapping ? `contracts/schemas/${mapping.schema}.schema.json` : null;
}

const topics: TopicEntry[] = [...sites.entries()]
  .map(([topic, namedBy]) => ({
    topic,
    namespace: topic.split('/')[0],
    schema: schemaFor(topic),
    publishers: componentsWhoseRoleAllows('publish', topic),
    subscribers: componentsWhoseRoleAllows('subscribe', topic),
    named_by: namedBy,
  }))
  .sort((a, b) => a.topic.localeCompare(b.topic));

const topology = {
  generator: 'scripts/derive-topology.ts',
  roles: broker.roles.map((role) => ({
    role: role.role,
    rules: [
      ...role.publish.map((filter) => ({ access: 'write', filter })),
      ...role.subscribe.map((filter) => ({ access: 'read', filter })),
    ],
  })),
  components: componentKeys
    .map((key) => {
      const component = runConfig[key] as { id: string; role?: string };
      const sourceRoot =
        component.id === shell.id
          ? 'app/src/shell'
          : existsSync(join(repoRoot, 'app', 'src', 'backend', component.id))
            ? `app/src/backend/${component.id}`
            : null;
      return { id: component.id, role: component.role ?? component.id, source_root: sourceRoot };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  topics,
};

const outPath = process.env.DROGNA_TOPOLOGY_OUT ?? join(repoRoot, 'contracts', 'topology.json');
writeFileSync(outPath, JSON.stringify(topology, null, 2) + '\n');
process.stdout.write(`derived ${topics.length} topics into ${outPath}\n`);
