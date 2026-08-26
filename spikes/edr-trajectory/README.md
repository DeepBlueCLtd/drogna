# EDR trajectory spike

**The question**: does the per-vertex M ordinate of an OGC API-EDR trajectory `coords`
string survive `shapely.wkt.loads` and reach a pygeoapi provider intact, so that a
response can report conditions forecast for the moment of arrival at each point
(SRD FR-20, FR-50, FR-51)?

**The answer**: yes, at Shapely 2.1 on GEOS 3.13. No, silently, below the pin — including
in the pygeoapi image as it ships today. Read [FINDING.md](FINDING.md).

## Run it

```bash
./run.sh
```

Needs Docker with Compose v2 and outbound access to Docker Hub and PyPI. Nothing else:
no part of drogna has to exist, and none of it does at this point in the delivery order.
First run takes a few minutes (one image pull, two image builds); afterwards about
twenty seconds. Everything it learns lands in `results/`.

Behind a TLS-terminating egress proxy, `run.sh` looks for a CA bundle at
`/root/.ccr/ca-bundle.crt`, `$SSL_CERT_FILE` or `$REQUESTS_CA_BUNDLE` and passes it to
the builds. Set `DROGNA_SPIKE_CA_FILE` to point it somewhere else. Without a proxy it
passes an empty secret and the certificate store is left alone.

## This is spike code

Throwaway, and marked as such at the top of every file. It hardcodes paths, hostnames
and ports, and does not use drogna's single-environment-variable config contract
(Constitution IV) — argued in `specs/002-edr-trajectory-spike/plan.md` under Complexity
Tracking. Nothing here is imported by drogna and nothing here is promoted into it. The
real trajectory provider is written fresh by the query-layer feature, behind the
coverage output port. The one thing meant to be adopted rather than deleted is the
assertion in `version_probe.py`.

The fixture is synthetic and says so in its own metadata. The numerics are fake.

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Builds, probes, serves, queries, tears down. |
| `version_probe.py` | The load-bearing test: parse `LINESTRING ZM`, read M back. Written so the deployment can adopt `assert_m_survives_wkt_parsing()` unchanged for FR-51. Runs under pytest too. |
| `make_fixture.py` | The seeded analytic four-dimensional field, written as CF NetCDF. The formula is in the module docstring. |
| `expectation.py` | The twenty-vertex route, and the competing per-vertex and single-time expectations. |
| `selfcheck.py` | Proves the fixture can tell those two answers apart before any query is issued. |
| `provider_stub.py` | The throwaway EDR provider. Records what pygeoapi hands it, then samples the coverage at each vertex's own time and returns CoverageJSON. |
| `pygeoapi.spike.yml` | Three collections over one fixture: the throwaway provider, the same provider set to extrapolate, and pygeoapi's supplied `xarray-edr` for comparison. |
| `compose.spike.yml` | Two pygeoapi instances (at the pin, below it) and two tool images. Local ports only. |
| `Dockerfile.pinned` | pygeoapi with Shapely brought up to the pin. |
| `Dockerfile.belowpin` | Shapely 2.0.7 on GEOS 3.11, to demonstrate the failure the pin prevents. |
| `fixture/` | The generated NetCDF and its manifest. Regenerated from the seed, not committed: drogna's `.gitignore` excludes `*.nc`. |
| `results/` | The evidence. |
| `FINDING.md` | The dated finding: question, method, evidence, result, handover. |

## Reading `results/`

| File | What it shows |
|---|---|
| `query.txt` | Start here. Returned values beside both expectations, and the errors against each. |
| `version-probe-at-pin.{txt,json}` | M recovered exactly, at Shapely 2.1.2 / GEOS 3.13.1. |
| `version-probe-below-pin-pygeoapi-image.{txt,json}` | The published pygeoapi image as it ships: Shapely 2.0.3 / GEOS 3.12.1. M unreachable. |
| `version-probe-below-pin-geos311.{txt,json}` | Shapely 2.0.7 / GEOS 3.11.4. M returned in the **Z** slot. |
| `selfcheck.txt` | The fixture matches its analytic form; the hypotheses are 497,384 tolerances apart. |
| `collection-metadata-bespoke.json` | The collection advertising `trajectory`. |
| `collection-metadata-stock-xarray-edr.json` | The same fixture through the supplied provider, advertising `position` and `cube` only. |
| `trajectory-at-pin.json` | The main request and its full CoverageJSON response. |
| `trajectory-below-pin.json` | The same request against the below-pin instance. |
| `handoff-*.json` | What the provider was handed, one file per distinct request: query type, vertex count, and a digest of the geometry as received. |
| `handoff-comparison.json` | That hand-off compared with what was sent, vertex by vertex. |
| `boundary-probes.json` | Vertices outside the domain, non-monotonic times, a repeated vertex — under both out-of-domain settings. |
| `length-probe.json` | The vertex count at which the request stops being accepted, and why. |
| `summary.json` | All of the above in one document. |
