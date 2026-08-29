/**
 * The Intro tab (FR-42): narrates the arc, one section per landed beat, and by
 * feature 109 constitutes the walkthrough script. It grows; it never previews. A
 * beat that has not landed is named as not landed — the narration makes no claim the
 * running system cannot back.
 */
import type { IDockviewPanelProps } from 'dockview-react';
import type { PanelParams } from '../../shell/Shell.js';
import { hashForView } from '../../shell/views.js';

export function IntroPanel({ params }: IDockviewPanelProps<PanelParams>) {
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
          <a href={hashForView('system')}>System</a> tab lights each component only
          because a heartbeat from it genuinely arrived, and shows the rest of the
          arc greyed out until each lands; the{' '}
          <a href={hashForView('messages')}>Messages</a> tab shows the traffic itself,
          validated against the committed masters as it arrives. This run was seeded
          fresh when you opened the page — run <code>{manifest.run_id}</code>, root
          seed <code>{manifest.root_seed}</code> — and the manifest that replays it
          byte-for-byte is exportable from the header.
        </p>
      </section>
      <section className="not-landed">
        <h3>What has not landed yet</h3>
        <p>
          The synthetic ocean (102), sensing (103), the query seam (104), the forecast
          loop (105), uncertainty and planning (106), the operator&rsquo;s view (107),
          shore advisories (108) and the <a href={hashForView('map')}>map</a> (109)
          each arrive as their beat is built. Until then their components stay grey,
          because nothing here lights without a heartbeat.
        </p>
      </section>
    </div>
  );
}
