/**
 * The EDR composer (FR-41): a guided sequence with the literal request URL always
 * visible, assembling live and copyable. It offers only what the query components
 * genuinely serve — collections fetched from the collections list, query types and
 * parameters from the served subset statement — never stubbed. The result renders
 * where it was asked for, with null, declined and absent kept as three facts. The
 * position may be typed here or clicked on the canvas: the choices live in the map
 * panel, so the click and the two number boxes write to one place (issue #53). The
 * step that carries the click says so as a step rather than as prose, and where there
 * is no canvas to click it says to type it instead of naming a gesture that does
 * nothing.
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
  choices,
  onChoices,
  positionNote,
  canPick,
}: {
  config: ConfigShell;
  validator: SeamValidator;
  latestForecast?: string;
  /** The composed query, owned by the map so a canvas click can write to it. */
  choices: ComposerChoices;
  onChoices: (patch: Partial<ComposerChoices>) => void;
  /** What the map can say about the chosen position, or undefined if none is set. */
  positionNote?: string;
  /** Whether there is a drawing canvas to click. Where WebGL is absent there is not,
      and the step says to type it rather than naming a gesture that does nothing. */
  canPick: boolean;
}) {
  const [offering, setOffering] = useState<ComposerOffering | undefined>();
  const [result, setResult] = useState<ComposerResult | undefined>();
  const [copied, setCopied] = useState(false);

  // Any change to the query — typed or clicked — retires the result it produced,
  // so what is displayed always answers the URL displayed above it.
  useEffect(() => setResult(undefined), [choices]);

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


  return (
    <div className="composer">
      <h4>compose an EDR request</h4>
      <label>
        1 · collection{' '}
        <select
          value={choices.collection ?? ''}
          onChange={(event) => onChoices({ collection: event.target.value || undefined })}
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
          onChange={(event) => onChoices({ queryType: event.target.value || undefined })}
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
                onChoices({
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
      {/* Step 4 is the one step with a gesture behind it, and it read as prose among
          the other steps' controls — so the gesture went unfound (issue #53's
          affordance, amended). It is now the step's own block, stating what to do and
          what has been placed. */}
      <div className="composer-pick" data-testid="composer-pick">
        <p className="composer-pick-lead">
          4 · position —{' '}
          {canPick ? (
            <strong>click the map to place it</strong>
          ) : (
            <strong>type it below</strong>
          )}
          {canPick ? ', or type it below' : ': the canvas draws nothing here, so there is no map to click'}.
        </p>
        <p className="composer-pick-drawn">
          The marker, and an area query's box, are drawn where the URL says.
        </p>
      </div>
      <label>
        longitude{' '}
        <input
          type="number"
          step="0.1"
          value={choices.longitude ?? ''}
          onChange={(event) =>
            onChoices({ longitude: event.target.value === '' ? undefined : Number(event.target.value) })
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
            onChoices({ latitude: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <p className="composer-pick-note" data-testid="composer-pick-note">
        {positionNote ?? 'no position yet'}
      </p>
      <label>
        5 · depth (m){' '}
        <input
          type="number"
          step="10"
          value={choices.depthM ?? ''}
          onChange={(event) =>
            onChoices({ depthM: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <label>
        6 · datetime (optional, ISO){' '}
        <input
          type="text"
          placeholder="collection's first step"
          value={choices.datetime ?? ''}
          onChange={(event) => onChoices({ datetime: event.target.value || undefined })}
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
