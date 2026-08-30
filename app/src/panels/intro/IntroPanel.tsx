/**
 * The Intro tab (FR-42): narrates the arc, one section per landed beat, and by
 * feature 109 constitutes the walkthrough script. It grows; it never previews. A
 * beat that has not landed is named as not landed — the narration makes no claim the
 * running system cannot back.
 */
import type { PanelProps } from '../../shell/registry.js';
import { hashForView } from '../../shell/views.js';

export function IntroPanel({ params }: PanelProps) {
  const { manifest } = params;
  return (
    <div className="panel panel-prose">
      <h1>drogna</h1>
      <p className="disclaimer">
        This is a demonstration harness and nothing else. Its numerics are deliberately
        fake, its data synthetic, and it holds no third-party entities of any kind —
        {/* harness:allow-forbidden-vocabulary the FR-01 statement of the prohibition itself */}
        no tracked entity, no contact, no detection — and never will. Nothing here is a
        candidate system.
      </p>
      <p>
        A synthetic ocean, sensors that sample it, a forecast loop that assimilates
        what they report, and a query layer that serves the result through OGC API-EDR
        and SensorThings — all of it genuine programs running in this browser page,
        behind a wire-protocol seam a real backend can replace by swapping a base URL.
      </p>
      <h2>The arc so far</h2>
      <section>
        <h3>101 — the stage is lit</h3>
        <p>
          What you are looking at is already the system, not a picture of one. The
          clock beating in the header is a component publishing over the broker; the{' '}
          <a href={hashForView('operator')}>Operator</a> tab lights each component only
          because a heartbeat from it genuinely arrived, and draws the rest of the
          arc greyed out until each lands; the{' '}
          <a href={hashForView('messages')}>Messages</a> tab shows the traffic itself,
          validated against the committed masters as it arrives. This run is{' '}
          <code>{manifest.run_id}</code>, from root seed{' '}
          <code>{manifest.root_seed}</code>, and the manifest that replays it
          byte-for-byte is exportable from the header. The seed is the situation&rsquo;s
          own rather than one drawn when the page opened: two people following the same
          link see the same ocean, which is what makes a link to a thing in it worth
          sending.
        </p>
      </section>
      <section>
        <h3>102 — a world exists</h3>
        <p>
          The environment generator authored a synthetic ocean when this page opened:
          four-dimensional temperature and salinity, a warm-core eddy, a front, a
          thermocline and a drifting feature, each with jittered parameters drawn from
          this run&rsquo;s seed and recorded — with the exact draw order — in a
          ground-truth manifest. Twenty years of monthly history and a rolling
          now-cast were published through the coverage store&rsquo;s own
          digest-checked seam, and both are inspectable, manifest and all, in{' '}
          <a href={hashForView('holdings')}>Holdings</a>. The manifest is sufficient:
          anyone holding it can reconstruct the field at any point and score a
          recovery against it.
        </p>
      </section>
      <section>
        <h3>103 — it is sampled</h3>
        <p>
          A simulated platform loiters over the eddy, and its instruments sample the
          true field on a fixed cadence, publishing observations in SensorThings
          vocabulary over the broker — where the role rules confine them to the
          observation namespace. The ingestion seam validates every message against
          its master and is the observation store&rsquo;s only way in; refusals are
          counted where you can see them. The{' '}
          <a href={hashForView('messages')}>Messages</a> tab now draws the topic
          tree: structure from the derived topology artefact, light from received
          traffic, and the two never mixing.
        </p>
      </section>
      <section>
        <h3>104 — it is served</h3>
        <p>
          The holdings and the observations are now answered through standard
          interfaces: OGC API-EDR (CoverageJSON, position and trajectory with
          per-vertex time) over the coverage store, and read-only SensorThings over
          the observation store — each a stated, honest subset whose served account
          is held equal to the documented one by a test, and where everything not
          implemented is refused with its own name. Every request passes the release
          gate: default deny, with the data prefixes released one at a time. Try{' '}
          <code>/api/edr/collections</code> in the address bar — it is a genuine GET.
        </p>
      </section>
      <section>
        <h3>105 — it is assimilated</h3>
        <p>
          The loop turns. The monitor pairs co-located samples, derives sound speed
          by the one implementation, and scores residuals against the current
          forecast — raising a divergence only on sustained persistence, never a
          single spike. The scheduler decides: a breach inside the minimum interval
          is declined by policy, observably, and the cadence floor means the loop
          can never be permanently becalmed — a run warranted on schedule alone is
          labelled <em>scheduled</em>, distinct from <em>divergence-triggered</em>,
          wherever runs appear. The model runner advects an ensemble behind the
          kernel port and publishes the mean with its spread through the same
          digest-checked seam as everything else; instances accumulate in{' '}
          <a href={hashForView('holdings')}>Holdings</a> and are served through EDR
          by convention. Watch what each component says about itself in{' '}
          <a href={hashForView('operator')}>Operator</a>: the loop's quiet always says
          which quiet it is.
        </p>
      </section>
      <section>
        <h3>106 — doubt is measured, and directed</h3>
        <p>
          The planner reads only what publication released — the ensemble spread,
          the ground-truth manifest&rsquo;s tau, the read-only region geometry — and
          maintains an observation-age deficit that regrows at the local timescale:
          water never sampled sits at the spread, water just sampled is worth
          nothing to sample again, and fast water invites revisit without anybody
          scheduling it. Candidate routes are <em>walked</em>, each stop scored
          against the field as it will stand at arrival, and one route is committed
          under a time budget by prize-collecting orienteering with seeded restarts
          — published as a recommendation and nothing else, with the naive figure
          beside the honest one so the size of the avoided error is a number you
          can see, and projections of when each region&rsquo;s confidence lapses.
          Watch <code>ctl/plan</code> in{' '}
          <a href={hashForView('messages')}>Messages</a>.
        </p>
      </section>
      <section>
        <h3>107 — the machinery is interrogated</h3>
        <p>
          The <a href={hashForView('operator')}>Operator</a> tab reads what the
          components say about themselves — a component never heard from is reported
          <em> unheard</em>, not absent — and dispatches genuine commands through the
          seam: step the clock, stop, start or restart a component. A stopped
          component goes dark in the flow chart because its heartbeats genuinely cease,
          never because a response claimed success;
          a refused command names the bound or rule. Telemetry aggregates the
          monitor&rsquo;s residual samples into running statistics and a forecast
          skill figure against persistence, in its own sentence — the display says
          plainly when the model is not earning its compute. Commands are ephemeral
          and outside the replay claim: an exported manifest replays the run, not
          your interventions — and since feature 113 a demand issued to the
          platform is a command of exactly that kind.
        </p>
      </section>
      <section>
        <h3>108 — the world outside speaks, and the boundary holds</h3>
        <p>
          Shore advisories arrive on their own topic and pass through a genuine
          ingestion seam: the append-only advisory store validates each against a
          master in which <em>no field can carry free text</em> — every string is an
          enum or a bounded pattern, so an advisory is structurally incapable of
          naming anything the harness did not place — and refuses anything over the
          size ceiling with the limit named. Advice travels light, and that is
          measured, not asserted: the largest advisory is smaller than the smallest
          gridded update. The offload packager stages a bundle beside each published
          run, with the run-manifest sibling carrying the measurement geometry{' '}
          <em>beside the bundle and never inside it</em> — announcement-only until a
          real backend exists to receive it. Advisories and the reference geometry
          are served as OGC API-Features collections through the same release gate;
          the advisories collection answers <em>empty</em> before the first advisory
          exists, because an empty collection is an answer, not an error. Watch{' '}
          <code>adv/advisories</code> and <code>ctl/offload</code> in{' '}
          <a href={hashForView('messages')}>Messages</a>.
        </p>
      </section>
      <section>
        <h3>109 — it is seen</h3>
        <p>
          The <a href={hashForView('map')}>Map</a> draws only documents that crossed
          the seam: the field from a genuine EDR <em>area</em> query (the subset grew
          one capability for it, stated in the conformance statement like every
          other), the planner&rsquo;s doubt as H3 cells that refresh with each plan
          and shade by how far each region has regrown toward saturation, the
          committed route as a four-dimensional curve — slide the time control and
          the platform moves along it; click a stop for the conditions at the moment
          of arrival, fetched at that place and that instant — and advisories drawn
          only while valid at the displayed time, undrawn outside validity yet still
          listed and queryable. The <em>EDR composer</em> is a mode of the map: a
          guided sequence with the literal request URL always visible, assembling
          live and copyable, offering only what the server&rsquo;s own metadata
          states it serves; the response renders where it was asked for, with null,
          declined and absent kept as three different facts. Where WebGL is
          unavailable the canvas says so instead of pretending.
        </p>
      </section>
      <section>
        <h3>Where this visit began</h3>
        <p>
          This run did not start at its epoch. It began in the situation chosen on the
          welcome page — <code>{manifest.start_condition}</code> — and the platform,
          the instruments and the loop were then run forward to it through the same
          controls the <a href={hashForView('operator')}>Operator</a> tab offers, before
          this console opened. Nothing was written into a store to arrange it: what{' '}
          <a href={hashForView('holdings')}>Holdings</a> lists and what the{' '}
          <a href={hashForView('map')}>Map</a> draws was authored by the components that
          author it, and the whole pre-roll is in{' '}
          <a href={hashForView('messages')}>Messages</a> where you can read it back. The
          address bar carries the choice, so this exact situation is a link.
        </p>
        <p>
          The ocean itself — the archive and the now-cast — was authored{' '}
          <em>ahead of time</em>, by these same components from this same seed, and
          arrives as a committed artefact the snapshot source republishes through the
          coverage store&rsquo;s one digest-checked write path. That is what a build
          artefact may be here and a fixture may not: a gate rebuilds it on every change
          and fails the build if a single byte differs from what the generator would
          author now. The <a href={hashForView('operator')}>Operator</a> tab&rsquo;s
          snapshot source says how many holdings it replayed, and says so plainly when
          there was no artefact and the ocean was evaluated live instead.
        </p>
      </section>
      <section>
        <h3>The walkthrough, whole</h3>
        <p>
          Every beat above is live in this page, and this tab is the demo script:
          start at <a href={hashForView('operator')}>Operator</a> to watch the machinery
          light, read the run&rsquo;s holdings in{' '}
          <a href={hashForView('holdings')}>Holdings</a>, watch the traffic argue
          with its masters in <a href={hashForView('messages')}>Messages</a>,
          interrogate and interrupt the components there too, and end at the{' '}
          <a href={hashForView('map')}>Map</a>, where the whole loop is visible at
          once. Export the manifest from the header to replay this run
          byte-identically; your interventions are ephemeral and deliberately
          outside that claim. Everything is synthetic, and says so.
        </p>
        <p>
          For why any of this is standards-based rather than bespoke,{' '}
          <a href={hashForView('background')}>Background</a> is a course of ten short
          illustrated explainers — SensorThings, OGC API-EDR, NetCDF, MQTT and what it
          takes to use them honestly. It reads nothing from the running system, so it
          reads the same whether the machinery above is turning or stopped.
        </p>
      </section>
    </div>
  );
}
