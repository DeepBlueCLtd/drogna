/**
 * Tab 3 — **Feasibility** (FR-80): a downstream consumer that answers *it is 1800; which
 * of these eight things can I still do?*
 *
 * **No map**, deliberately. The other two consumers are about *where*; this one exists to
 * show that environmental data settles questions that are not. Time runs across, sources
 * are stacked below, and what the sources imply is drawn above them.
 *
 * The horizon starts at the published forecast's own validity start and runs past its end:
 * the run's validity in this scenario is an hour, and a tab whose window was cut to that
 * could not carry a three-hour task at all. What does not run past the forecast is the
 * *served* lane, which stops where the forecast stops — so a task depending on it cannot be
 * scheduled beyond that, which is a truer answer than a line drawn confidently across water
 * nobody forecast.
 *
 * Its output is the top two or three **maximal feasible sets**, with what each gives up.
 * It is a triage aid and says so in its own chrome: the honest output is what you are
 * losing, which is more defensible than a schedule that claims to have solved anything.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PanelProps } from '../../../shell/registry.js';
import type { PlatformState } from '../../../generated/types.js';
import { displayInstant } from '../../../shell/display.js';
import { ConsumerFrame, Provenance } from '../ConsumerFrame.js';
import { useGhostOnRunChange } from '../freshness.js';
import { useConsumerBasis } from '../basis.js';
import { consumerStream } from '../rng.js';
import { instantMillis, metresBetween } from '../domain.js';
import { buildLanes, type Confidence } from './lanes.js';
import { feasibleSets, type FeasibleSet, type TaskFeasibility } from './sets.js';

const FIELD_PARAMETER = 'temperature';
const PLOT_WIDTH = 720;
const LANE_HEIGHT = 34;

const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low', 'off'];

export function FeasibilityPanel({ params }: PanelProps) {
  const { config, client, validator, manifest } = params;
  const settings = config.consumers.feasibility;
  const freshness = useConsumerBasis(config, client, validator);

  const [platform, setPlatform] = useState<PlatformState | undefined>();
  const [confidence, setConfidence] = useState<Record<string, Confidence>>(() =>
    Object.fromEntries(settings.lanes.map((lane) => [lane.id, lane.default_confidence as Confidence])),
  );
  const [thresholds, setThresholds] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(
      settings.tasks.map((task) => [
        task.id,
        Object.fromEntries(
          task.requirements
            .filter((requirement) => requirement.threshold !== undefined)
            .map((requirement) => [requirement.lane, requirement.threshold ?? 0]),
        ),
      ]),
    ),
  );
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set());
  const [chosenTask, setChosenTask] = useState<string>(settings.tasks[0].id);
  const [forecastSeries, setForecastSeries] = useState<readonly number[] | undefined>();

  useEffect(() => {
    return client.subscribe(config.topics.platform_state, (message) => {
      const verdict = validator.validate('platform-state', message.payload);
      if (verdict.ok) setPlatform(message.payload as PlatformState);
    });
  }, [client, config.topics.platform_state, validator]);

  const accepted = freshness.basis;
  /**
   * The horizon runs from the forecast's own validity start, and is longer than the
   * forecast is valid for. That is deliberate and visible: the run's validity here is an
   * hour, and a tab whose horizon was cut to it could not carry a three-hour task at all.
   * So the window is the configured one, the served lane stops where the forecast stops,
   * and a task that depends on it simply cannot be scheduled past that point — which is
   * a truer answer than a lane drawn confidently across water nobody forecast.
   */
  const steps = Math.max(1, Math.round((settings.horizon_hours * 60) / settings.step_minutes));
  const forecastSteps = accepted
    ? Math.max(
        1,
        Math.round(
          (instantMillis(accepted.validTo) - instantMillis(accepted.validFrom)) /
            60_000 /
            settings.step_minutes,
        ),
      )
    : 0;

  /**
   * The served lane: genuine position queries at instants spread across the forecast's
   * own validity span. It refetches when the reader takes a new forecast up, and not
   * when one is merely published (FR-73).
   */
  useEffect(() => {
    if (!accepted) return;
    const collection = accepted.collection;
    const startMillis = instantMillis(accepted.validFrom);
    const endMillis = instantMillis(accepted.validTo);
    const centreLongitude = (accepted.domain.west + accepted.domain.east) / 2;
    const centreLatitude = (accepted.domain.south + accepted.domain.north) / 2;
    void (async () => {
      const values: number[] = [];
      for (let sample = 0; sample < settings.forecast_samples; sample++) {
        const fraction = settings.forecast_samples > 1 ? sample / (settings.forecast_samples - 1) : 0;
        const at = new Date(startMillis + (endMillis - startMillis) * fraction);
        const query = new URLSearchParams({
          coords: `POINT(${centreLongitude} ${centreLatitude})`,
          z: String(accepted.domain.minimumDepthM),
          datetime: `${at.toISOString().slice(0, 23)}000Z`,
          'parameter-name': FIELD_PARAMETER,
        });
        const response = await fetch(
          `${config.endpoints.edr}/collections/${collection}/position?${query.toString()}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          ranges?: Record<string, { values: number[] }>;
        };
        const value = body.ranges?.[FIELD_PARAMETER]?.values?.[0];
        if (typeof value === 'number') values.push(value);
      }
      // A partial series is not a series: a lane drawn from three of five queries would
      // be a lane whose shape depended on which requests happened to answer.
      if (values.length === settings.forecast_samples) setForecastSeries(values);
    })();
  }, [accepted, config.endpoints.edr, settings.forecast_samples]);

  const rangeMetres = useMemo(() => {
    if (!platform || !accepted) return undefined;
    // The rendezvous is this tab's own assumption — the north-west corner of the domain —
    // but the range to it is measured from the position the platform actually reported,
    // marched forward on the course and speed it actually reported.
    const rendezvous = { longitude: accepted.domain.west, latitude: accepted.domain.north };
    const metres: number[] = [];
    const heading = (platform.current.course_degrees * Math.PI) / 180;
    for (let step = 0; step < steps; step++) {
      const seconds = step * settings.step_minutes * 60;
      const travelled = platform.current.speed_m_per_s * seconds;
      const latitude = platform.current.latitude + (Math.cos(heading) * travelled) / 111_320;
      const longitude =
        platform.current.longitude +
        (Math.sin(heading) * travelled) / (111_320 * Math.cos((latitude * Math.PI) / 180));
      metres.push(metresBetween({ longitude, latitude }, rendezvous));
    }
    return metres;
  }, [platform, accepted, steps, settings.step_minutes]);

  const lanes = useMemo(
    () =>
      buildLanes(settings.lanes, {
        steps,
        stepMinutes: settings.step_minutes,
        draw: consumerStream(manifest.root_seed, 'consumer', 'feasibility', 'lanes'),
        speedMetresPerSecond: platform?.current.speed_m_per_s,
        rangeMetres,
        forecastSeries,
        forecastSteps,
      }),
    [settings.lanes, steps, settings.step_minutes, manifest.root_seed, platform?.current.speed_m_per_s, rangeMetres, forecastSeries, forecastSteps],
  );

  const outcome = useMemo(
    () =>
      feasibleSets({
        tasks: settings.tasks,
        lanes,
        confidence,
        thresholds,
        weights: settings.confidence_weights,
        vetoWeight: settings.veto_weight,
        stepMinutes: settings.step_minutes,
        steps,
        setCount: settings.set_count,
        locked,
      }),
    [settings, lanes, confidence, thresholds, steps, locked],
  );

  const { ghost, dismiss } = useGhostOnRunChange(outcome.sets, accepted?.identity);

  const byTask = new Map(outcome.perTask.map((entry) => [entry.task.id, entry]));
  const chosen = byTask.get(chosenTask);

  const stepX = (step: number) => (step / Math.max(1, steps)) * PLOT_WIDTH;

  return (
    <ConsumerFrame
      config={config}
      testId="feasibility"
      summary="Temporal feasibility — a triage aid, not an optimiser: here is what you are giving up"
      freshness={freshness}
      ghostRunId={ghost?.runId}
      onDismissGhost={dismiss}
    >
      {!accepted ? (
        <p className="consumer-note" data-testid="feasibility-waiting">
          Waiting for the coverage store to say what it holds: until it does there is no validity
          span to anchor the horizon to, and no window to reason over.
        </p>
      ) : (
        <>
          <p className="consumer-note">
            {steps} steps of {settings.step_minutes} minutes, from the validity start of{' '}
            {accepted.kind === 'nowcast' ? 'the now-cast' : 'the forecast'} at{' '}
            {displayInstant(accepted.validFrom)}. It is itself valid to{' '}
            {displayInstant(accepted.validTo)} — the first {forecastSteps} step(s) — and the served
            lane stops there rather than being drawn on, so a task that needs it cannot be
            scheduled past that point. Confidence weights are{' '}
            {settings.confidence_weights.high} / {settings.confidence_weights.medium} /{' '}
            {settings.confidence_weights.low}, and a window closes at {settings.veto_weight} — so a
            high-confidence source can close one alone and a low-confidence one never can.{' '}
            <strong>Off</strong> removes a source from the computation entirely.
          </p>

          <h3>Feasible sets — the top {settings.set_count}, each maximal</h3>
          <div data-testid="feasibility-sets">
            {outcome.sets.length === 0 && (
              <p className="consumer-refusal">
                {/*
                  Why nothing survives is the answer, not a footnote. A locked task with no
                  window of its own cannot be scheduled at any price, and saying "no set
                  survives" without naming it leaves the reader to work out which of their
                  own decisions did it.
                */}
                {[...locked]
                  .map((id) => byTask.get(id))
                  .filter((entry) => entry && entry.windows.length === 0)
                  .map((entry) => entry?.task.label)
                  .join(', ') ||
                  'No set of tasks survives these sources and thresholds. That is an answer, not a failure: something has to give.'}
                {[...locked].some((id) => (byTask.get(id)?.windows.length ?? 1) === 0)
                  ? ' is locked as mandatory and has no feasible window at all, so nothing can be scheduled around it. Unlock it, lower a threshold, or lower a source’s confidence.'
                  : ''}
              </p>
            )}
            {outcome.sets.map((set, index) => (
              <SetCard key={set.taskIds.join('+')} set={set} rank={index} tasks={settings.tasks} />
            ))}
            {ghost?.value && ghost.value.length > 0 && (
              <p className="consumer-note consumer-ghost-legend" data-testid="feasibility-ghost">
                Against forecast {ghost.runId} the leading set was{' '}
                {ghost.value[0].taskIds
                  .map((id) => settings.tasks.find((task) => task.id === id)?.label ?? id)
                  .join(', ')}
                .
              </p>
            )}
          </div>

          <h3>Tasks</h3>
          {/* Its own scrolling container, so the page never scrolls sideways (FR-017). */}
          <div className="table-scroll">
          <table className="consumer-table" data-testid="feasibility-tasks">
            <thead>
              <tr>
                <th>task</th>
                <th>duration</th>
                <th>windows</th>
                <th>lock</th>
                <th>state</th>
              </tr>
            </thead>
            <tbody>
              {settings.tasks.map((task) => {
                const feasibility = byTask.get(task.id);
                const inLeader = outcome.sets[0]?.taskIds.includes(task.id) ?? false;
                return (
                  <tr
                    key={task.id}
                    aria-selected={chosenTask === task.id}
                    onClick={() => setChosenTask(task.id)}
                    data-testid={`feasibility-task-${task.id}`}
                    className={feasibility && feasibility.windows.length === 0 ? 'task-excluded' : undefined}
                  >
                    <td>{task.label}</td>
                    <td>{task.duration_minutes} min</td>
                    <td>{feasibility?.windows.length ?? 0}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`lock ${task.label} as mandatory`}
                        data-testid={`feasibility-lock-${task.id}`}
                        checked={locked.has(task.id)}
                        onChange={(event) =>
                          setLocked((standing) => {
                            const next = new Set(standing);
                            if (event.target.checked) next.add(task.id);
                            else next.delete(task.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      {feasibility?.blockedBy
                        ? `excluded — ${feasibility.blockedBy} closes every window`
                        : inLeader
                          ? 'in the leading set'
                          : outcome.sets.length > 0
                            ? 'given up by the leading set'
                            : 'no set survives'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <h3>Sources</h3>
          <p className="consumer-note">
            Thresholds below are <strong>{settings.tasks.find((task) => task.id === chosenTask)?.label}</strong>’s
            own; another task may hold a different one against the same lane and both be right.
          </p>
          <div data-testid="feasibility-lanes">
            {lanes.map((lane) => {
              const requirement = chosen?.task.requirements.find((entry) => entry.lane === lane.id);
              const threshold = thresholds[chosenTask]?.[lane.id];
              return (
                <div className="lane-row" key={lane.id}>
                  <div className="lane-name">
                    <span>{lane.label}</span>
                    <Provenance of={lane.provenance} />
                    <select
                      value={confidence[lane.id]}
                      aria-label={`confidence in ${lane.label}`}
                      data-testid={`feasibility-confidence-${lane.id}`}
                      onChange={(event) =>
                        setConfidence((standing) => ({
                          ...standing,
                          [lane.id]: event.target.value as Confidence,
                        }))
                      }
                    >
                      {CONFIDENCES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    {requirement && threshold !== undefined && (
                      <input
                        type="range"
                        min={lane.minimum}
                        max={lane.maximum}
                        step={(lane.maximum - lane.minimum) / 40}
                        value={threshold}
                        aria-label={`threshold on ${lane.label}`}
                        data-testid={`feasibility-threshold-${lane.id}`}
                        onChange={(event) =>
                          setThresholds((standing) => ({
                            ...standing,
                            [chosenTask]: {
                              ...standing[chosenTask],
                              [lane.id]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    )}
                  </div>
                  <svg
                    className="lane-plot"
                    viewBox={`0 0 ${PLOT_WIDTH} ${LANE_HEIGHT}`}
                    preserveAspectRatio="none"
                    data-confidence={confidence[lane.id]}
                    role="img"
                    aria-label={`${lane.label}, ${lane.says}`}
                  >
                    <title>{lane.says}</title>
                    {lane.kind === 'boolean'
                      ? lane.samples.map((value, step) =>
                          value >= 0.5 ? (
                            <rect
                              key={step}
                              className="lane-bar"
                              x={stepX(step)}
                              y={LANE_HEIGHT * 0.25}
                              width={Math.max(1, stepX(1))}
                              height={LANE_HEIGHT * 0.5}
                            />
                          ) : null,
                        )
                      : (
                          <polyline
                            className="lane-trace"
                            points={lane.samples
                              .map((value, step) => {
                                const fraction = Number.isFinite(value)
                                  ? (value - lane.minimum) / (lane.maximum - lane.minimum || 1)
                                  : 0;
                                return `${stepX(step).toFixed(1)},${(LANE_HEIGHT * (1 - fraction)).toFixed(1)}`;
                              })
                              .join(' ')}
                          />
                        )}
                    {requirement && threshold !== undefined && lane.kind === 'continuous' && (
                      <line
                        className="lane-threshold"
                        x1={0}
                        x2={PLOT_WIDTH}
                        y1={LANE_HEIGHT * (1 - (threshold - lane.minimum) / (lane.maximum - lane.minimum || 1))}
                        y2={LANE_HEIGHT * (1 - (threshold - lane.minimum) / (lane.maximum - lane.minimum || 1))}
                      />
                    )}
                  </svg>
                </div>
              );
            })}
          </div>

          {chosen && (
            <div className="lane-row" data-testid="feasibility-derived">
              <div className="lane-name">
                <strong>{chosen.task.label}</strong> — feasible windows
              </div>
              <svg
                className="lane-plot"
                viewBox={`0 0 ${PLOT_WIDTH} ${LANE_HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${chosen.windows.length} feasible windows for ${chosen.task.label}`}
              >
                {chosen.windows.map((window) => (
                  <rect
                    key={window.fromStep}
                    className="lane-window"
                    x={stepX(window.fromStep)}
                    y={2}
                    width={stepX(window.toStep) - stepX(window.fromStep)}
                    height={LANE_HEIGHT - 4}
                  >
                    <title>margin {window.margin.toFixed(2)}</title>
                  </rect>
                ))}
              </svg>
            </div>
          )}
        </>
      )}
    </ConsumerFrame>
  );
}

function SetCard({
  set,
  rank,
  tasks,
}: {
  set: FeasibleSet;
  rank: number;
  tasks: readonly TaskFeasibility['task'][];
}) {
  const label = (id: string) => tasks.find((task) => task.id === id)?.label ?? id;
  return (
    <div className="consumer-set" data-rank={rank} data-testid={`feasibility-set-${rank}`}>
      <strong>
        {set.taskIds.length} task(s):{' '}
        {set.taskIds.map(label).join(' + ')}
      </strong>
      <div>
        gives up: {set.givesUp.length === 0 ? 'nothing' : set.givesUp.map(label).join(', ')}
      </div>
    </div>
  );
}
