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
import { ComponentDiagram } from "./layout/ComponentDiagram";
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

export function App({ load, open, now = hostInstant }: AppProps): JSX.Element {
  const liveness = useRef<LivenessState>(emptyLiveness);
  const clock = useRef<ClockData>(emptyClock);
  const connection = useRef<Connection>("not-connected");
  const configuration = useRef<RuntimeConfig | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

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

  const [view, setView] = useState<ShellView>(() => build(now()));

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
          const tolerances = configuration.current?.liveness ?? FALLBACK_TOLERANCES;
          const interpretation = interpret(decoded.value, receivedAt, tolerances);
          liveness.current = interpretation.accepted
            ? receive(liveness.current, interpretation.evidence)
            : discard(liveness.current, interpretation.reason);
          return;
        }
        if (topic === CLOCK_TOPIC) {
          clock.current = receiveClockSample(clock.current, decoded.value, receivedAt);
        }
      },
      connection(state: Connection): void {
        connection.current = state;
      },
    }),
    [now],
  );

  useEffect(() => {
    let subscription: ControlSubscription | null = null;
    let abandoned = false;
    void startTransport(
      async () => {
        const outcome = await load();
        if (outcome.ok) {
          configuration.current = outcome.config;
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
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [build, now]);

  return (
    <main>
      <header className="masthead">
        <h1>drogna</h1>
        <p className="strapline">
          The component shell. Eighteen components drogna intends to have, lit only where a
          heartbeat has arrived.
        </p>
        <p data-testid="lit-count">
          <span className="figure">{view.litCount}</span> of {view.nodes.length} components heard
          from within the window each declared.
        </p>
      </header>
      <div className="panels">
        <ClockState clock={view.clock} />
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
    </main>
  );
}
