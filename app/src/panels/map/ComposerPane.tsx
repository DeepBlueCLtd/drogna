/**
 * The EDR composer (FR-41): a guided sequence with the literal request URL always
 * visible, assembling live and copyable. It offers only what the query components
 * genuinely serve — collections fetched from the collections list, query types and
 * parameters from the served subset statement — never stubbed. The result renders
 * where it was asked for, with null, declined and absent kept as three facts.
 */
import { useEffect, useState } from 'react';
import type { ConfigShell, QuerySubsets } from '../../generated/types.js';
import type { SeamValidator } from '../../seam/validate.js';
import {
  classifyResponse,
  composeUrl,
  offeringFrom,
  type ComposerChoices,
  type ComposerOffering,
  type ComposerResult,
} from './composer.js';

export function ComposerPane({
  config,
  validator,
  latestForecast,
}: {
  config: ConfigShell;
  validator: SeamValidator;
  latestForecast?: string;
}) {
  const [offering, setOffering] = useState<ComposerOffering | undefined>();
  const [choices, setChoices] = useState<ComposerChoices>({ parameters: [] });
  const [result, setResult] = useState<ComposerResult | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const [subsetsResponse, collectionsResponse] = await Promise.all([
        fetch(config.endpoints.query_subsets),
        fetch(`${config.endpoints.edr}/collections`),
      ]);
      if (!subsetsResponse.ok || !collectionsResponse.ok) return;
      const subsets = (await subsetsResponse.json()) as QuerySubsets;
      if (!validator.validate('query-subsets', subsets).ok) return;
      const collections = (await collectionsResponse.json()) as { collections: { id: string }[] };
      setOffering(offeringFrom(subsets, collections.collections.map((collection) => collection.id)));
    })();
    // The forecast list grows with each published run; refetch when it does.
  }, [config.endpoints.edr, config.endpoints.query_subsets, validator, latestForecast]);

  const composed = composeUrl(config.endpoints.edr, choices);

  const execute = async () => {
    if (!composed.ok) return;
    setResult(undefined);
    const response = await fetch(composed.url);
    const body = (await response.json()) as unknown;
    setResult(classifyResponse(response.status, body));
  };

  const copy = async () => {
    if (!composed.ok) return;
    try {
      await navigator.clipboard.writeText(composed.url);
      setCopied(true);
      // harness:allow-wallclock the copied-flash is feedback about a host interaction; no simulation-time answer exists (ADR-0006's class)
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!offering) return <div className="composer">enumerating what the server serves…</div>;

  const update = (patch: Partial<ComposerChoices>) => {
    setResult(undefined);
    setChoices((previous) => ({ ...previous, ...patch }));
  };

  return (
    <div className="composer">
      <h4>compose an EDR request</h4>
      <label>
        1 · collection{' '}
        <select
          value={choices.collection ?? ''}
          onChange={(event) => update({ collection: event.target.value || undefined })}
        >
          <option value="">choose…</option>
          {offering.collections.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        2 · query type{' '}
        <select
          value={choices.queryType ?? ''}
          onChange={(event) => update({ queryType: event.target.value || undefined })}
        >
          <option value="">choose…</option>
          {offering.queryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>3 · parameters (none chosen = every served parameter)</legend>
        {offering.parameters.map((name) => (
          <label key={name} className="composer-parameter">
            <input
              type="checkbox"
              checked={choices.parameters.includes(name)}
              onChange={(event) =>
                update({
                  parameters: event.target.checked
                    ? [...choices.parameters, name]
                    : choices.parameters.filter((chosen) => chosen !== name),
                })
              }
            />
            {name}
          </label>
        ))}
      </fieldset>
      <label>
        4 · longitude{' '}
        <input
          type="number"
          step="0.1"
          value={choices.longitude ?? ''}
          onChange={(event) =>
            update({ longitude: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <label>
        latitude{' '}
        <input
          type="number"
          step="0.1"
          value={choices.latitude ?? ''}
          onChange={(event) =>
            update({ latitude: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <label>
        5 · depth (m){' '}
        <input
          type="number"
          step="10"
          value={choices.depthM ?? ''}
          onChange={(event) =>
            update({ depthM: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <label>
        6 · datetime (optional, ISO){' '}
        <input
          type="text"
          placeholder="collection's first step"
          value={choices.datetime ?? ''}
          onChange={(event) => update({ datetime: event.target.value || undefined })}
        />
      </label>
      <div className="composer-url" data-testid="composer-url">
        {composed.ok ? <code>{composed.url}</code> : <em>{composed.missing}</em>}
      </div>
      <div className="composer-actions">
        <button disabled={!composed.ok} onClick={() => void execute()}>
          GET
        </button>
        <button disabled={!composed.ok} onClick={() => void copy()}>
          {copied ? 'copied' : 'copy URL'}
        </button>
      </div>
      {result && (
        <div className={`composer-result composer-${result.fact}`} data-testid="composer-result">
          {result.fact === 'value' && (
            <>
              <p>a value came back (null would be a value too, and would say so):</p>
              <pre>{JSON.stringify(result.body, null, 2)}</pre>
            </>
          )}
          {result.fact === 'declined' && <p>declined, in the server's words: {result.refusal}</p>}
          {result.fact === 'absent' && <p>absent: {result.detail}</p>}
        </div>
      )}
    </div>
  );
}
