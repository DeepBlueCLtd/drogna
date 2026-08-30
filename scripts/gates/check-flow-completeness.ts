/**
 * Gate: the Operator flow chart draws the whole system (SRD-v2 FR-57).
 *
 * The picture is derived — nodes from the shell's declared components, topic edges
 * from the topology master, port edges from the shell's declared port list — and this
 * gate is what makes "derived" a fact rather than an intention. It fails the build
 * when:
 *
 * - a component runs in the topology and has no node in the picture;
 * - the picture draws a node the topology does not know (Constitution VII's own
 *   prohibition, applied to the diagram);
 * - a topic exists in the wiring and is neither drawn nor named as suppressed — a wire
 *   the picture does not show;
 * - a declared port edge names something that is not a component, or two nodes claim
 *   one place in the layout.
 *
 * Deliberately NOT a drift check against a committed picture: there is no committed
 * picture to drift from, which is the point. The findings are sentences, because a
 * gate that says "incomplete" tells nobody what to do about it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completenessFindings } from '../../app/src/panels/operator/graph.js';
import type { ConfigRun, Topology } from '../../app/src/generated/types.js';
import { type Finding, REPO_ROOT } from './lib.js';

export function runGate(root: string = REPO_ROOT): Finding[] {
  const configPath = join(root, 'app', 'config', 'run.json');
  const topologyPath = join(root, 'contracts', 'topology.json');
  let config: ConfigRun;
  let topology: Topology;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8')) as ConfigRun;
    topology = JSON.parse(readFileSync(topologyPath, 'utf8')) as Topology;
  } catch (error) {
    return [
      {
        file: 'contracts/topology.json',
        line: 1,
        message: `could not read the configuration and the topology: ${(error as Error).message}`,
      },
    ];
  }
  return completenessFindings(config.shell, topology).map((message) => ({
    file: 'app/config/run.json',
    line: 1,
    message,
  }));
}
