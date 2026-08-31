/**
 * What a reader can do at a node whose component offers no prompt (feature 121).
 *
 * Five components gained a prompt of their own in this feature, and the rest of the
 * protected ten did not, because for those there was nothing honest to prompt. The
 * clock, the broker, the release gate, the query component and the operator surface are
 * the *plane the flow runs on*: they do not act on a cadence a reader could bring
 * forward, and a button that made one of them manufacture a message would be exactly
 * the invention the rest of this tab is a correction to.
 *
 * What they do is **answer**. So a probe is not a prompt: it is the shell making a
 * genuine request across the seam, at the node that answers it, and reporting what came
 * back — including, twice over, a refusal. Two of these exist in order to be refused,
 * and they are the sharpest thing on the tab: a reader can watch default-deny at the
 * boundary, and the shell's own empty publish list at the broker, from a button.
 *
 * Every path and every topic here arrives through the configuration document, on the
 * ordinary rule (Constitution IV): `undeclared_probe` is a path the release gate is
 * configured to refuse, and the topic the broker refuses is one the shell genuinely
 * subscribes to and genuinely may not write. Nothing is typed in.
 *
 * What a probe returns is what *this* request got, and it says so — a status, a count, a
 * refusal in the refusing component's own words. It never reports on the component's
 * state, because a probe is one request and a component is a run.
 *
 * ## And the three that answer nothing
 *
 * The observation store, the feature store and the advisory store are written to through
 * a store interface and read through the query component. They publish nothing of their
 * own, they serve no path of their own, and they carry no write rule in the topology at
 * all — so there is no prompt to give them that would not be a new topic carrying a new
 * message nothing consumes, and no probe to give them that would not really be answered
 * by a different component while claiming to be answered by this one.
 *
 * The honest thing at such a node is to say so, and to send the reader to the node that
 * *does* answer for it. `DEFERRALS` is that, declared beside the probes: a sentence and
 * a way to get to where the button is. An empty drawer said none of it.
 */
import type { ConfigShell, OperatorControls } from '../../generated/types.js';
import type { SeamClient } from '../../seam/transport.js';

/** What a probe got back. `refused` is an outcome, never an error: two are the point. */
export interface ProbeResult {
  readonly said: string;
  readonly refused: boolean;
}

export interface ProbeContext {
  readonly config: ConfigShell;
  /** The shell's own broker client, under the shell's own role. */
  readonly client: SeamClient;
  /** What the operator surface says it offers; undefined until it has said. */
  readonly controls: OperatorControls | undefined;
  /** The rate the clock last acknowledged, for the control that toggles it. */
  readonly rate: number | undefined;
}

export interface Probe {
  readonly id: string;
  /** The component whose drawer this probe belongs in. */
  readonly target: string;
  /** The label, which may depend on what the run has said so far. */
  label(context: ProbeContext): string;
  /** What it does and what a refusal from it would mean. Never optional. */
  readonly description: string;
  /** Whether it can be offered yet. A control drawn against a bound nobody has stated
   *  is a control that can be refused for reasons the reader was never told. */
  offered?(context: ProbeContext): boolean;
  run(context: ProbeContext): Promise<ProbeResult>;
}

/** Real time, and stopped: the two rates a reader wants under a thumb. */
const RUNNING = 1;
const HELD = 0;

/**
 * The probes, declared once. The panel reads this rather than holding a list of its
 * own, on the same rule that has the controls come from the operator surface: a probe
 * added here appears on its node without a line changing in the panel.
 */
export const PROBES: readonly Probe[] = [
  // ---- the clock: not new commands, but commands that were in the wrong place ----
  //
  // Stepping one tick, and stepping the burst the operator surface declares a bound
  // for, were in the panel's header from feature 114 — global chrome above a chart,
  // some way from the node that answers them. This tab's own rule is that consequence
  // should be visible where the cause was applied, and the clock is a node.
  {
    id: 'clock-hold',
    target: 'clock',
    label: ({ rate }) => (rate === HELD ? 'let it run' : 'hold the world'),
    description:
      'Ask the clock for rate ×0, or for real time again. Every component takes its time from here, so a held clock is a run that has stopped happening rather than a display that has stopped drawing — which is the difference this button exists to make visible. The rate in force is what the strip in the shell header reports, because that is the clock’s own acknowledgement, not this control’s claim.',
    async run({ config, rate }) {
      const asked = rate === HELD ? RUNNING : HELD;
      return ask(config.endpoints.clock_rate, 'PUT', { rate: asked }, `asked for ×${asked}`);
    },
  },
  {
    id: 'clock-step',
    target: 'clock',
    label: () => 'step one tick',
    description:
      'Advance simulation time by one whole tick. Every component acts on it exactly as it acts on a tick that passed on its own — this is the same step, asked for rather than waited out.',
    async run({ config }) {
      return ask(config.endpoints.clock_step, 'POST', undefined, 'stepped one tick');
    },
  },
  {
    id: 'clock-burst',
    target: 'clock',
    label: ({ controls }) => `step ${controls?.step.maximum_ticks ?? 0} ticks`,
    description:
      'Advance the burst the operator surface declares a bound for, in one command. The bound is the surface’s, because an unbounded burst blocks the page that is drawing it; ask again, or raise the rate and let time pass.',
    offered: ({ controls }) => controls !== undefined,
    async run({ config, controls }) {
      const ticks = controls?.step.maximum_ticks ?? 0;
      return ask(config.endpoints.clock_step, 'POST', { ticks }, `stepped ${ticks} ticks`);
    },
  },

  // ---- the components that serve, asked to serve ----
  {
    id: 'sample-query',
    target: 'query',
    label: () => 'run a sample query',
    description:
      'Ask the query component for its EDR collections — the same GET any client makes, across the same seam, through the same release gate. What comes back is what it serves.',
    async run({ config }) {
      const response = await fetch(`${config.endpoints.edr}/collections`);
      const text = await response.text();
      if (!response.ok) {
        return { said: `status ${response.status}: ${text.slice(0, 200)}`, refused: true };
      }
      // The count is read off what was served, not off a number held here: a display
      // that knew how many collections there were would be a second source for it.
      const body = JSON.parse(text) as { collections?: unknown[] };
      return {
        said: `${response.status} · ${body.collections?.length ?? 0} collection(s) offered · ${text.length} bytes over the seam`,
        refused: false,
      };
    },
  },
  {
    id: 'read-controls',
    target: 'operator',
    label: () => 'read what this plane offers',
    description:
      'Ask the operator surface for its controls document — the same GET this panel makes when it opens, and the reason the panel can never draw a control the surface would refuse. The bounds a tuning is held to are in what comes back, declared once and enforced there.',
    async run({ config }) {
      const response = await fetch(config.endpoints.operator_controls);
      const text = await response.text();
      if (!response.ok) {
        return { said: `status ${response.status}: ${text.slice(0, 200)}`, refused: true };
      }
      const offered = JSON.parse(text) as OperatorControls;
      return {
        said: `${response.status} · ${offered.tunables.length} tunable(s), ${offered.events.length} prompt(s), a step bound of ${offered.step.maximum_ticks} ticks · ${text.length} bytes`,
        refused: false,
      };
    },
  },

  // ---- the two that exist in order to be refused ----
  {
    id: 'refused-request',
    target: 'boundary',
    label: () => 'ask for something the gate refuses',
    description:
      'Request a path the gate is configured not to serve. Default-deny is the whole of what this component does, and this is where a reader sees it happen: the refusal names the rule and the prefixes that would have been cleared, and it is published on the denial topic where the Messages tab draws it.',
    async run({ config }) {
      const response = await fetch(config.endpoints.undeclared_probe);
      const text = await response.text();
      if (response.ok) {
        // Stated rather than swallowed: a probe whose refusal stopped arriving has
        // stopped demonstrating anything, and reporting that as a success would hide a
        // boundary that had started serving what it should not.
        return {
          said: `served with status ${response.status} — the gate was expected to refuse this path, and did not`,
          refused: false,
        };
      }
      const answer = JSON.parse(text) as { rule?: string; refused?: string; allowed_prefixes?: string[] };
      return {
        said: `${response.status} · ${answer.rule ?? 'refused'} · ${answer.refused ?? ''} — cleared prefixes are ${(answer.allowed_prefixes ?? []).join(', ')}`,
        refused: true,
      };
    },
  },
  {
    id: 'refused-publish',
    target: 'broker',
    label: () => 'publish on a topic the shell may not',
    description:
      'Try to publish on the clock topic, which the shell reads constantly and may never write. Publish and subscribe are both default-deny at the broker, and the refusal names the role and the topic — this is the seam of ADR-0027 in one press.',
    async run({ config, client }) {
      try {
        client.publish(config.topics.clock, {});
        return {
          said: 'the broker accepted it — the shell’s role was expected to carry no publish rule for this topic',
          refused: false,
        };
      } catch (error) {
        return { said: error instanceof Error ? error.message : String(error), refused: true };
      }
    },
  },
];

/**
 * A node with nothing to press, and the reason, and where to go instead.
 *
 * `answeredBy` names a component the chart draws, so the panel can open it: the
 * deferral is a way *through* to the button rather than an apology for its absence.
 */
export interface Deferral {
  readonly target: string;
  readonly answeredBy: string;
  readonly why: string;
}

export const DEFERRALS: readonly Deferral[] = [
  {
    target: 'observation-store',
    answeredBy: 'query',
    why: 'Written to only by the ingestion seam, and read only through the query component: it publishes nothing of its own and serves no path of its own. A button here would be a request answered somewhere else, claiming to be answered here.',
  },
  {
    target: 'feature-store',
    answeredBy: 'query',
    why: 'The same shape as the observation store: one writer through a store interface, and every read served on its behalf. What it holds is reachable, and it is reachable through the component that serves it.',
  },
  {
    target: 'advisory-store',
    answeredBy: 'advisory-source',
    why: 'It ingests what the shore source publishes and serves it on request; it carries no write rule at all, so it has nothing it could be asked to say. The advisory that would arrive here is authored one node back, and that node can be asked for it now.',
  },
];

/** The probes offered at one node, if any. Derived, never listed at the call site. */
export function probesFor(id: string, context?: ProbeContext): readonly Probe[] {
  return PROBES.filter(
    (probe) => probe.target === id && (!context || !probe.offered || probe.offered(context)),
  );
}

/** The deferral for one node, if it has one. */
export function deferralFor(id: string): Deferral | undefined {
  return DEFERRALS.find((deferral) => deferral.target === id);
}

/** One seam request, and what it said. Written once so every probe answers the same way. */
async function ask(path: string, method: string, body: unknown, note: string): Promise<ProbeResult> {
  const response = await fetch(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    const answer = JSON.parse(text) as { refused?: string };
    return { said: answer.refused ?? `refused with status ${response.status}`, refused: true };
  }
  return { said: note, refused: false };
}
