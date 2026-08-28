/**
 * The page.
 *
 * The order here is the whole of FR-019: the shell renders first, the configuration
 * document is fetched second, and the transport opens third and only if the document
 * validated. A page that could not reach its configuration still draws the complete
 * layout, still carries the honesty statement, and says plainly that it is hearing
 * nothing — rather than showing a blank screen, which would be the worse lie of the two.
 *
 * Received messages are folded into state as they arrive; drawing is throttled to the
 * frame budget. At a high clock rate the frame rate degrades and the truth does not: the
 * reducer sees every heartbeat whether or not a frame was drawn for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { startTransport } from "./bootstrap";

import type { ConfigOutcome, RuntimeConfig } from "./config/runtime";
import { exposeCaptureReadiness } from "./controls/captureReadiness";
import { NO_CONTROL_SURFACE, rateRequesterFor, unavailableRequester } from "./controls/rateRequest";
import { acknowledgeRate, emptyRate, requestFailed, requestRate } from "./controls/rateState";
import type { RateState } from "./controls/rateState";
import { SpeedControl } from "./controls/SpeedControl";
import { NO_SAMPLES, receiveDisplaySample, useFrameInstant } from "./controls/interpolatedClock";
import type { SamplePair } from "./controls/interpolatedClock";
import { drawFrame, emptyLoop, loopStatus, messageOn, receiveControl } from "./data/controlSubscription";
import type { LoopState } from "./data/controlSubscription";
import { PLAN_TOPIC, RUN_PUBLISHED_TOPIC, TELEMETRY_TOPIC } from "./data/topics";
import { MessageInspector } from "./inspector/MessageInspector";
import { ComponentDiagram } from "./layout/ComponentDiagram";
import { boundaryId } from "./legibility/classification";
import { CycleView } from "./loop/CycleView";
import { ArrivalTimeControl } from "./route/ArrivalTimeControl";
import { RecommendationLabel } from "./route/RecommendationLabel";
import { routeDisplay } from "./route/RouteLayer";
import { readTrajectory, trajectoryRequest } from "./route/trajectoryQuery";
import type { TrajectoryResult } from "./route/trajectoryQuery";
import type { RouteDisplay } from "./route/RouteLayer";
import { beginReAsk, emptyReadPath, reAskGate, reAskSettled, recordCrossing } from "./readpath/crossings";
import type { ObservedCrossing, ReadPathState } from "./readpath/crossings";
import { observedRead } from "./readpath/observedRead";
import { ReadPathView } from "./readpath/ReadPathView";
import type { ReAskOffer } from "./readpath/ReadPathView";
import { STANDARDS } from "./readpath/standards";
import type { StandardName } from "./readpath/standards";
import { StandardBadge } from "./readpath/StandardBadge";
import { TopologyMatrix } from "./topology/TopologyMatrix";
import { QualityStatement } from "./uncertainty/QualityStatement";
import { announceRun, emptyOverlay, fieldRead } from "./uncertainty/overlay";
import type { OverlayState } from "./uncertainty/overlay";
import { MapSurface, NO_FIELD } from "./map/MapSurface";
import type { MapFieldState } from "./map/MapSurface";
import { chooseExtent, extentFromAnnouncement, extentFromDeclaration } from "./map/extent";
import type { MapExtent } from "./map/extent";
import { cannotAskForField, fieldNotRead } from "./map/absence";
import { fieldRequest, isRequest } from "./map/fieldRequest";
import { readFieldCube } from "./map/fieldCube";
import { CONTROL_SCHEMAS } from "./contracts/schemas";
import type { DrognaSamplingRecommendation } from "./generated/messages/plan";
import type { ForecastSkill } from "./generated/messages/telemetry";
import { decode, interpret } from "./liveness/ingest";
import type { LivenessTolerances } from "./liveness/ingest";
import { discard, emptyLiveness, receive } from "./liveness/reducer";
import type { ConnectionState as Connection, LivenessState } from "./liveness/types";
import { describeShell } from "./liveness/view";
import type { ShellView } from "./liveness/view";
import { hostInstant } from "./time/host";
import { emptyClock, receiveClockSample } from "./transport/clock";
import type { ClockState as ClockData } from "./transport/clock";
import { CLOCK_TOPIC, HEARTBEAT_TOPIC } from "./transport/mqtt";
import type { ControlSink, ControlSubscription } from "./transport/mqtt";
import { ClockState } from "./ui/ClockState";
import { Conflicts } from "./ui/Conflicts";
import { ConnectionState } from "./ui/ConnectionState";
import { UnmappedComponents } from "./ui/UnmappedComponents";

/**
 * Values used only before the configuration document arrives.
 *
 * Nothing has been received at that point, so they decide nothing about liveness: they
 * decide how often an empty page redraws itself and how long an absent clock waits before
 * it is called stale. Neither can light anything.
 */
const FALLBACK_FRAME_INTERVAL_MS = 250;
const FALLBACK_STALE_AFTER_SECONDS = 5;
const FALLBACK_TOLERANCES: LivenessTolerances = {
  defaultWindowSeconds: 15,
  windowMultiplier: 3,
};

export interface AppProps {
  /** Fetch and validate the runtime configuration document. */
  readonly load: () => Promise<ConfigOutcome>;
  /** Open the read-only control subscription. Called only after the document validates. */
  readonly open: (config: RuntimeConfig, sink: ControlSink) => ControlSubscription;
  /** Host time, injectable so a harness can drive it. */
  readonly now?: () => number;
}

/** Everything feature 012 draws, gathered so one frame renders one consistent picture. */
interface LoopView {
  readonly loop: LoopState;
  readonly rate: RateState;
  readonly overlay: OverlayState;
  readonly route: RouteDisplay | null;
  readonly skill: ForecastSkill | null;
  readonly conditions: TrajectoryResult | null;
  /** The map's own state: one fetched cube, or the reason there is none (017). */
  readonly mapField: MapFieldState;
  /** The extent the last announcement stated, or null before any (017 FR-001). */
  readonly announcedExtent: MapExtent | null;
  /** The read path's recorded crossings, and the re-ask control's bounds (018). */
  readonly readPath: ReadPathState;
  /** What a press of the re-ask control would do this frame, decided when drawn. */
  readonly reAsk: ReAskOffer;
}

export function App({ load, open, now = hostInstant }: AppProps): JSX.Element {
  const liveness = useRef<LivenessState>(emptyLiveness);
  const clock = useRef<ClockData>(emptyClock);
  const connection = useRef<Connection>("not-connected");
  const configuration = useRef<RuntimeConfig | null>(null);
  const loop = useRef<LoopState>(emptyLoop());
  const rate = useRef<RateState>(emptyRate);
  const overlay = useRef<OverlayState>(emptyOverlay);
  const route = useRef<RouteDisplay | null>(null);
  const skill = useRef<ForecastSkill | null>(null);
  const conditions = useRef<TrajectoryResult | null>(null);
  const mapField = useRef<MapFieldState>(NO_FIELD);
  const announcedExtent = useRef<MapExtent | null>(null);
  const readPath = useRef<ReadPathState>(emptyReadPath());
  const [failure, setFailure] = useState<string | null>(null);
  const [badgesShown, setBadgesShown] = useState<boolean>(true);
  const [selectedBoundary, setSelectedBoundary] = useState<string>(boundaryId("monitor", "scheduler"));
  const [selectedVertex, setSelectedVertex] = useState<number>(0);
  const [samples, setSamples] = useState<SamplePair>(NO_SAMPLES);

  const build = useMemo(
    () =>
      (instant: number): ShellView => {
        const config = configuration.current;
        return describeShell({
          liveness: liveness.current,
          clockState: clock.current,
          connection: connection.current,
          now: instant,
          hearing: {
            connected: connection.current !== "not-connected",
            disconnectedIsIndeterminate: config?.liveness.disconnectedIsIndeterminate ?? true,
          },
          clockStaleAfterSeconds: config?.clock.staleAfterSeconds ?? FALLBACK_STALE_AFTER_SECONDS,
        });
      },
    [],
  );

  /**
   * What the re-ask control could genuinely do right now (018 FR-010).
   *
   * A re-ask is never a new capability: it re-issues one of the two reads the client
   * already makes — the trajectory query for the current plan, else the field fetch for
   * the current run — and where neither has anything to ask about, the control says so
   * rather than inventing a request. Recomputed each frame, so the interval and
   * in-flight bounds need no timer: the disabled state is a function of the same host
   * instant the frame throttle already reads.
   */
  const reAskOfferAt = useMemo(
    () =>
      (instant: number): ReAskOffer => {
        const config = configuration.current;
        const gate = reAskGate(readPath.current, instant);
        if (config === null) {
          return {
            kind: null,
            unavailableBecause: "the configuration document has not arrived, so no read can be composed",
            gate,
          };
        }
        if (
          route.current !== null &&
          config.query.trajectoryPath !== undefined &&
          overlay.current.collection !== null
        ) {
          return { kind: "trajectory", unavailableBecause: null, gate };
        }
        if (overlay.current.runId !== null && announcedExtent.current !== null) {
          return { kind: "field", unavailableBecause: null, gate };
        }
        return {
          kind: null,
          unavailableBecause:
            "no plan has been recommended and no run has been announced, so there is no read the client already makes to repeat",
          gate,
        };
      },
    [],
  );

  /** The only route a crossing takes into the read path's state (018, Constitution VII). */
  const deliverCrossing = useMemo(
    () =>
      (crossing: ObservedCrossing): void => {
        readPath.current = recordCrossing(readPath.current, crossing);
      },
    [],
  );

  const [view, setView] = useState<ShellView>(() => build(now()));
  const [loopView, setLoopView] = useState<LoopView>(() => ({
    loop: loop.current,
    rate: rate.current,
    overlay: overlay.current,
    route: route.current,
    skill: skill.current,
    conditions: conditions.current,
    mapField: mapField.current,
    announcedExtent: announcedExtent.current,
    readPath: readPath.current,
    reAsk: reAskOfferAt(now()),
  }));

  /**
   * How far along its boundary a transit is drawn this frame.
   *
   * The one value in this page that comes from the browser's animation frame timestamp,
   * through the one module allowed to read it. It is unitless, it never leaves the render
   * path, and at a rate of zero it holds — which is what makes two captures of a pinned
   * state identical (ADR-0007; FR-014, SC-009).
   */
  const progress = useFrameInstant(samples, {
    interpolate: configuration.current?.display.interpolateBetweenSamples ?? true,
  }).fraction;

  /**
   * Reading the conditions along a route, once, because a plan arrived.
   *
   * Not on a schedule. FR-021 forbids polling the query layer for freshness and this is
   * the same rule applied to the route: a plan is announced on `ctl/plan`, and the read
   * happens because of the announcement. There is no interval here and no retry.
   *
   * Every instant sent is one the planner published — the M ordinate of the WKT carries
   * each vertex's own arrival time — so nothing from the render path reaches the wire
   * (ADR-0007, rule three).
   */
  const readConditionsAlong = useMemo(
    () =>
      async (drawn: RouteDisplay): Promise<void> => {
        const config = configuration.current;
        const collection = overlay.current.collection;
        if (config?.query.trajectoryPath === undefined || collection === null) {
          return;
        }
        const request = trajectoryRequest(
          `${config.query.collectionsUrl}/${collection}${config.query.trajectoryPath}`,
          drawn.vertices,
          config.query.routeParameters,
        );
        if (request === null) {
          return;
        }
        // The read goes through the one observing wrapper, so the crossing the read-path
        // view draws is this very request and this very response (018 FR-003). The
        // wrapper adds observation and nothing else; a failure is recorded as a failed
        // crossing and lands here as a non-answer.
        const answer = await observedRead("trajectory", request.url, deliverCrossing);
        if (answer.status === null || (answer.ok && answer.body === null)) {
          // A route without its conditions renders as a route without its conditions. The
          // arrival control says there is no forecast for the moment of arrival rather
          // than showing a field that describes another moment (FR-027).
          conditions.current = null;
          return;
        }
        if (!answer.ok) {
          return;
        }
        const outcome = readTrajectory(answer.body);
        if (outcome.ok && route.current?.planId === drawn.planId) {
          conditions.current = outcome;
        }
      },
    [deliverCrossing],
  );

  /**
   * Reading the field a run announced, once, because it was announced (017 FR-003).
   *
   * The same rule the route's conditions follow, and `overlay.ts` states it in full: FR-021
   * forbids polling the query layer to discover freshness, because the query layer has no
   * notification mechanism and a page that polled would work while being wrong in a way
   * nothing on the screen would show. So there is no interval here, no retry and no
   * parameter one could arrive through. A test counts the requests against the
   * announcements, which is the only form of that promise that survives refactoring.
   *
   * Every failure lands on the display as a sentence naming what was asked for and what
   * came back. Nothing is drawn in place of a field that could not be read: a map that
   * filled the gap would be the one thing Constitution VII forbids outright.
   */
  const readFieldFor = useMemo(
    () =>
      async (runId: string, collection: string | null, bounds: MapExtent, simTime: string | null): Promise<void> => {
        const config = configuration.current;
        if (config === null) {
          mapField.current = {
            cube: null,
            because: cannotAskForField("where the query layer is"),
            awaiting: false,
          };
          return;
        }
        const asked = fieldRequest(config, collection, bounds, simTime);
        if (!isRequest(asked)) {
          mapField.current = { cube: null, because: cannotAskForField(asked.missing), awaiting: false };
          return;
        }
        // Through the one observing wrapper, for the same reason the trajectory read is:
        // the crossing drawn on the read path is this request and this response, and a
        // failure is a crossing too, recorded with what actually came back (018 FR-003).
        const answer = await observedRead("field", asked.url, deliverCrossing);
        if (answer.status === null) {
          mapField.current = {
            cube: null,
            because: fieldNotRead(asked.collection, answer.failure ?? "the request did not complete"),
            awaiting: false,
          };
          return;
        }
        if (!answer.ok) {
          mapField.current = {
            cube: null,
            because: fieldNotRead(asked.collection, `the query layer answered ${answer.status}`),
            awaiting: false,
          };
          return;
        }
        if (answer.body === null) {
          mapField.current = {
            cube: null,
            because: fieldNotRead(asked.collection, answer.failure ?? "the response carried no body"),
            awaiting: false,
          };
          return;
        }
        const read = readFieldCube(answer.body, {
          runId,
          collection: asked.collection,
          parameter: asked.parameter,
        });
        if (overlay.current.runId !== runId) {
          // A later announcement overtook this read. Its own read is in flight and this
          // one describes a run that is no longer current, so it is dropped rather than
          // drawn under the newer run's frame.
          return;
        }
        if (!read.ok) {
          mapField.current = {
            cube: null,
            because: fieldNotRead(asked.collection, read.reason),
            awaiting: false,
          };
          return;
        }
        mapField.current = {
          cube: {
            runId: read.runId,
            collection: read.collection,
            parameter: read.parameter,
            longitudes: read.longitudes,
            latitudes: read.latitudes,
            depths: read.depths,
            times: read.times,
            values: read.values,
            unit: read.unit,
          },
          because: null,
          awaiting: false,
        };
        overlay.current = fieldRead(overlay.current);
      },
    [deliverCrossing],
  );

  /** Asking the clock for a rate. Asking is all this page can do (FR-012). */
  const requestRateChange = useMemo(
    () =>
      (asked: number): void => {
        const requester = rateRequesterFor(configuration.current) ?? unavailableRequester;
        rate.current = requestRate(rate.current, asked, clock.current.sample?.tick ?? null);
        exposeCaptureReadiness(rate.current);
        void requester(asked).then((outcome) => {
          if (!outcome.sent) {
            rate.current = requestFailed(rate.current, outcome.reason);
            exposeCaptureReadiness(rate.current);
          }
        });
      },
    [],
  );

  /**
   * The re-ask control pressed: one genuine request of a kind the client already makes.
   *
   * Never a replay — the request is composed afresh from the current plan or the current
   * run by the same functions the loop-driven reads use, sent through the same observing
   * wrapper, so the resulting crossing is indistinguishable in provenance from a
   * loop-driven one because it is the same thing (018 FR-010). The gate is re-checked
   * here, not only in the control's disabled state, so a queued click cannot slip past
   * the interval; while the request is in flight the control stays disabled and no queue
   * builds.
   */
  const reAskNow = useMemo(
    () =>
      (): void => {
        const instant = now();
        const offer = reAskOfferAt(instant);
        if (offer.kind === null || !offer.gate.allowed) {
          return;
        }
        const settle = (): void => {
          readPath.current = reAskSettled(readPath.current);
        };
        if (offer.kind === "trajectory" && route.current !== null) {
          readPath.current = beginReAsk(readPath.current, "trajectory", instant);
          void readConditionsAlong(route.current).then(settle, settle);
          return;
        }
        if (offer.kind === "field" && overlay.current.runId !== null && announcedExtent.current !== null) {
          readPath.current = beginReAsk(readPath.current, "field", instant);
          void readFieldFor(
            overlay.current.runId,
            overlay.current.collection,
            announcedExtent.current,
            overlay.current.validFrom,
          ).then(settle, settle);
        }
      },
    [now, reAskOfferAt, readConditionsAlong, readFieldFor],
  );

  const sink = useMemo<ControlSink>(
    () => ({
      message(topic: string, payload: string): void {
        const receivedAt = now();
        const decoded = decode(payload);
        if ("reason" in decoded) {
          liveness.current = discard(liveness.current, decoded.reason);
          return;
        }
        if (topic === HEARTBEAT_TOPIC) {
          // Folded into the loop state as well as the liveness state: the reducer buffers
          // a heartbeat and counts it, draws no transit for it, and has no route to
          // liveness. Before feature 018 nothing displayed buffered heartbeats and this
          // call was skipped; the topology matrix now counts real arrivals per topic, and
          // a heartbeat row reading "quiet" while the shell lights from the same messages
          // would be the display understating genuine traffic.
          loop.current = receiveControl(loop.current, topic, payload);
          const tolerances = configuration.current?.liveness ?? FALLBACK_TOLERANCES;
          const interpretation = interpret(decoded.value, receivedAt, tolerances);
          liveness.current = interpretation.accepted
            ? receive(liveness.current, interpretation.evidence)
            : discard(liveness.current, interpretation.reason);
          return;
        }
        // Everything below draws rather than lights. The loop reducer has no route to the
        // liveness state, so nothing here can turn a message about a component into a
        // claim that the component is running (Constitution VII, FR-003).
        loop.current = receiveControl(loop.current, topic, payload);
        if (topic === CLOCK_TOPIC) {
          clock.current = receiveClockSample(clock.current, decoded.value, receivedAt);
          const sample = clock.current.sample;
          if (sample !== null) {
            rate.current = acknowledgeRate(rate.current, sample);
            exposeCaptureReadiness(rate.current);
            // Every arriving sample is authoritative and replaces the pair wholesale, so
            // whatever the interpolation was doing is discarded rather than blended
            // (ADR-0007, rule two).
            setSamples((pair) =>
              receiveDisplaySample(pair, { simTime: sample.simTime, receivedAt: sample.receivedAt }),
            );
          }
          return;
        }
        if (topic === RUN_PUBLISHED_TOPIC) {
          overlay.current = announceRun(overlay.current, decoded.value);
          // The map's extent is the grid the announcement stated, re-read from every
          // announcement rather than remembered, and the field is fetched because of the
          // announcement and never on a schedule (017 FR-001, FR-003).
          const bounds = extentFromAnnouncement(decoded.value);
          if (bounds !== null) {
            announcedExtent.current = bounds;
            mapField.current = { cube: null, because: null, awaiting: true };
            void readFieldFor(
              overlay.current.runId ?? "",
              overlay.current.collection,
              bounds,
              overlay.current.validFrom,
            );
          }
          return;
        }
        if (topic === PLAN_TOPIC && CONTROL_SCHEMAS.plan.validate(decoded.value)) {
          route.current = routeDisplay(decoded.value as DrognaSamplingRecommendation);
          conditions.current = null;
          setSelectedVertex(0);
          void readConditionsAlong(route.current);
          return;
        }
        if (topic === TELEMETRY_TOPIC && CONTROL_SCHEMAS.telemetry.validate(decoded.value)) {
          const message = decoded.value as { kind?: unknown };
          if (message.kind === "forecast-skill") {
            skill.current = decoded.value as ForecastSkill;
          }
        }
      },
      connection(state: Connection): void {
        connection.current = state;
      },
    }),
    [now, readFieldFor],
  );

  useEffect(() => {
    let subscription: ControlSubscription | null = null;
    let abandoned = false;
    void startTransport(
      async () => {
        const outcome = await load();
        if (outcome.ok) {
          configuration.current = outcome.config;
          // The crossing history adopts the document's buffer depth — the same bound the
          // topic buffers use (FR-009). Safe to reset here: both readers require the
          // configuration, so nothing can have been recorded yet.
          readPath.current = emptyReadPath(outcome.config.display.bufferDepth);
        }
        return outcome;
      },
      open,
      sink,
    ).then((started) => {
      if (!started.started) {
        setFailure(started.reason);
        return;
      }
      if (abandoned) {
        started.subscription.close();
        return;
      }
      subscription = started.subscription;
    });
    return () => {
      abandoned = true;
      subscription?.close();
    };
  }, [load, open, sink]);

  useEffect(() => {
    let frame = 0;
    let lastDrawn = Number.NEGATIVE_INFINITY;
    const draw = (): void => {
      const instant = now();
      const interval = configuration.current?.display.frameIntervalMs ?? FALLBACK_FRAME_INTERVAL_MS;
      if (instant - lastDrawn >= interval) {
        lastDrawn = instant;
        setView(build(instant));
        // Draining the pending arrivals here is what makes a burst cost frames rather
        // than truth: everything that arrived since the last frame is coalesced into the
        // marks drawn now, with the count that says how many it stands for.
        loop.current = drawFrame(loop.current);
        setLoopView({
          loop: loop.current,
          rate: rate.current,
          overlay: overlay.current,
          route: route.current,
          skill: skill.current,
          conditions: conditions.current,
          mapField: mapField.current,
          announcedExtent: announcedExtent.current,
          readPath: readPath.current,
          reAsk: reAskOfferAt(instant),
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [build, now, reAskOfferAt]);

  /**
   * A pane's delivery badge, or nothing while the badges are toggled off (018 FR-008).
   *
   * A badge names the standard that delivered the pane's contents and links to its primer
   * on the published site, whose location arrives in the configuration document. It is a
   * static fact about the delivery channel: it cannot light anything and claims nothing
   * about whether data has arrived.
   */
  const badge = (name: StandardName): JSX.Element | null =>
    badgesShown ? (
      <StandardBadge
        standard={STANDARDS[name]}
        standardsUrl={configuration.current?.site?.standardsUrl}
      />
    ) : null;

  return (
    <main>
      <header className="masthead">
        <h1>drogna</h1>
        {/*
          No number here. This said "Eighteen components drogna intends to have" and the
          drawing had grown to twenty-one, so the page opened by miscounting itself directly
          above the line that counts correctly — `view.nodes.length`, which is the drawing.
          A count written into prose is right until the day somebody adds a component, and
          nothing fails when that day comes. The sentence now says what it is; the figure
          below says how many, from the only place that knows.
        */}
        <p className="strapline">
          The component shell: the components drogna intends to have, lit only where a
          heartbeat has arrived.
        </p>
        <p data-testid="lit-count">
          <span className="figure">{view.litCount}</span> of {view.nodes.length} components heard
          from within the window each declared.
        </p>
        <p className="badge-toggle">
          <button
            type="button"
            data-testid="badges-toggle"
            aria-pressed={badgesShown}
            onClick={() => {
              setBadgesShown((shown) => !shown);
            }}
          >
            {badgesShown ? "Hide" : "Show"} standards badges
          </button>{" "}
          — each data-bearing pane names the standard that delivered its contents, linking
          to that standard&apos;s primer on the published site.
        </p>
      </header>
      <MapSurface
        extent={chooseExtent(
          loopView.announcedExtent,
          extentFromDeclaration(
            configuration.current?.map?.extent,
            configuration.current?.map?.vertical,
          ),
        )}
        field={loopView.mapField}
        route={loopView.route}
        conditions={loopView.conditions}
        selectedVertex={selectedVertex}
        onSelectVertex={setSelectedVertex}
        maximumDrawnCells={configuration.current?.display.maximumDrawnCells}
        graticuleSpacingDegrees={configuration.current?.map?.graticuleSpacingDegrees}
      />
      <div className="pane-badges">
        {badge("OGC API-EDR")}
        {badge("CoverageJSON")}
      </div>
      <div className="panels">
        <ClockState clock={view.clock} />
        {badge("MQTT, contract-validated JSON")}
        <ConnectionState
          connection={view.connection}
          discarded={view.discarded}
          lastDiscardReason={view.lastDiscardReason}
          configuration={failure}
        />
        <UnmappedComponents views={view.unmapped} />
      </div>
      <Conflicts views={view.nodes} />
      <ComponentDiagram views={view.nodes} />
      <div className="pane-badges">{badge("MQTT, contract-validated JSON")}</div>
      <CycleView
        loop={loopView.loop}
        status={loopStatus(loopView.loop, view.connection)}
        progress={progress}
      />
      <nav className="boundary-picker" aria-label="Choose a boundary to inspect">
        {[...loopView.loop.lastByBoundary.keys()].map((boundary) => (
          <button
            key={boundary}
            type="button"
            data-testid={`inspect-${boundary}`}
            data-selected={String(boundary === selectedBoundary)}
            aria-pressed={boundary === selectedBoundary}
            onClick={() => {
              setSelectedBoundary(boundary);
            }}
          >
            {boundary}
          </button>
        ))}
      </nav>
      <MessageInspector
        boundary={selectedBoundary}
        message={messageOn(loopView.loop, selectedBoundary)}
      />
      <div className="pane-badges">{badge("MQTT, contract-validated JSON")}</div>
      <ReadPathView
        state={loopView.readPath}
        standardsUrl={configuration.current?.site?.standardsUrl}
        reAsk={loopView.reAsk}
        onReAsk={reAskNow}
      />
      <TopologyMatrix
        loop={loopView.loop}
        standardsUrl={configuration.current?.site?.standardsUrl}
      />
      <div className="panels">
        <SpeedControl
          rate={loopView.rate}
          onRequest={requestRateChange}
          unavailable={configuration.current?.clock.controlUrl === undefined ? NO_CONTROL_SURFACE : null}
        />
        <QualityStatement skill={loopView.skill} />
        {badge("MQTT, contract-validated JSON")}
      </div>
      <RecommendationLabel route={loopView.route} />
      {loopView.route === null ? null : (
        <>
          <ArrivalTimeControl
            route={loopView.route}
            conditions={loopView.conditions}
            selected={selectedVertex}
            onSelect={setSelectedVertex}
          />
          <div className="pane-badges">
            {badge("OGC API-EDR")}
            {badge("CoverageJSON")}
          </div>
        </>
      )}
    </main>
  );
}
