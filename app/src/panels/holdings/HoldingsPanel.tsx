/**
 * The Holdings tab (FR-20, FR-21): what the coverage store holds, fetched through
 * the seam and the release gate as a genuine GET against the configured relative
 * path — the manifest a holding embeds is the ground truth AT-01 and AT-03 score
 * against, inspectable here whole. Refreshed when the store announces a publication
 * on its declared topic; nothing polls.
 *
 * Narrow (feature 112, FR-010, FR-016): the inventory is the primary surface and the
 * manifest — which is a page of JSON — is shown over it with a control that goes back,
 * rather than in a 130px column beside it. The table itself scrolls in its own
 * container; the page never does (FR-017).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { useIsNarrow } from '../../shell/viewport.js';
import type { CoverageHolding, HoldingsInventory } from '../../generated/types.js';
import { displayInstant } from '../../shell/display.js';

export function HoldingsPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const [holdings, setHoldings] = useState<readonly CoverageHolding[]>([]);
  const [refusal, setRefusal] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);

  const refresh = useCallback(async () => {
    const response = await fetch(config.endpoints.holdings);
    if (!response.ok) {
      setRefusal(`the inventory answered ${response.status}`);
      return;
    }
    const body = (await response.json()) as unknown;
    const verdict = validator.validate('holdings-inventory', body);
    if (!verdict.ok) {
      setRefusal(`inventory refused by its master: ${verdict.refusals[0]}`);
      return;
    }
    setRefusal(undefined);
    setHoldings((body as HoldingsInventory).holdings);
  }, [config.endpoints.holdings, validator]);

  useEffect(() => {
    void refresh();
    return client.subscribe(config.topics.holdings, () => void refresh());
  }, [client, config.topics.holdings, refresh]);

  const chosen = holdings.find((holding) => holding.holding_id === selected);
  const covered = narrow && chosen !== undefined;

  return (
    <div className="panel messages-panel" ref={rootRef} data-narrow={narrow}>
      <p className="messages-counters" data-testid="holdings-count">
        {holdings.length} holding(s) in the coverage store
        {refusal && <span className="shell-refusal"> · {refusal}</span>}
      </p>
      <div className="messages-split">
        <div className="messages-list-scroll">
        <table className="messages-list holdings-list" aria-hidden={covered || undefined}>
          <thead>
            <tr>
              <th>era</th>
              <th>holding</th>
              <th>published (sim time)</th>
              <th>grid</th>
              <th>field digest</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => (
              <tr key={holding.holding_id} onClick={() => setSelected(holding.holding_id)} data-era={holding.era}>
                <td>{holding.era}</td>
                <td className="message-topic">{holding.holding_id}</td>
                <td>{displayInstant(holding.published_at.sim_time)}</td>
                <td>
                  {holding.manifest.grid.longitude.count}×{holding.manifest.grid.latitude.count}×
                  {holding.manifest.grid.depth.count}×{holding.manifest.grid.time.count}
                </td>
                <td className="message-seq">{holding.field.sha256.slice(7, 19)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="message-detail" data-covering={covered}>
          {chosen ? (
            <>
              {narrow && (
                <button type="button" className="message-back" onClick={() => setSelected(undefined)}>
                  ← back to the inventory
                </button>
              )}
              <h3>{chosen.holding_id} — ground-truth manifest</h3>
              <p className="panel-footnote">
                Sufficient on its own: with the generator version it names, the field
                can be reconstructed at any point without the stored bytes.
              </p>
              <pre data-testid="manifest-json">{JSON.stringify(chosen.manifest, null, 2)}</pre>
            </>
          ) : (
            <p className="panel-footnote">select a holding to inspect its manifest</p>
          )}
        </div>
      </div>
    </div>
  );
}
