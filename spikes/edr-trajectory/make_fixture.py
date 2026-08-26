"""Seeded synthetic four-dimensional coverage, written as CF-conventions NetCDF.

SPIKE CODE. Throwaway. Hardcodes paths and grid extents on purpose and skips drogna's
single-environment-variable config contract (Constitution IV), as argued in
`specs/002-edr-trajectory-spike/plan.md` Complexity Tracking. Nothing here is imported
by drogna. When feature 004 needs a synthetic field it writes its own, to its own
standard; this one is deliberately cruder.

The field
---------
One parameter, `sea_water_temperature`, over longitude, latitude, depth and time. Let

    u = lon - LON0              degrees east of the western edge
    v = lat - LAT0              degrees north of the southern edge
    w = depth / DEPTH_SCALE     dimensionless, DEPTH_SCALE = 100 m
    s = (t - T0) / TIME_SCALE   dimensionless, TIME_SCALE = 1 hour

then

    theta(u, v, w, s) = c0 + cu*u + cv*v + cw*w + cs*s + cus*u*s + cvw*v*w

Every term is of degree at most one in each variable, so quadrilinear interpolation
over the grid reproduces theta *exactly*. That is the point: the expectation against
which a query response is scored is analytic, so any disagreement is the provider's,
not the interpolator's. The tolerance below is set by float64 arithmetic alone.

The `cs*s` term is the discriminator. It is of the order of a third of a degree per
hour, so a value evaluated at the wrong time is wrong by degrees, not by rounding.
`cus` and `cvw` exist so the field is not separable and an axis swapped for another
shows up as a large error rather than a plausible one.

The coefficients come from `numpy.random.default_rng(SEED)`, so the fixture is
reproducible from the seed alone and is regenerated rather than committed — drogna's
`.gitignore` excludes `*.nc` (NFR-07: seed data is produced by scripts, never
accumulated).

Run it
------
    python3 make_fixture.py            # writes fixture/spike_coverage.nc
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
import xarray as xr

SEED = 20260826

HERE = pathlib.Path(__file__).resolve().parent
FIXTURE_DIR = HERE / 'fixture'
FIXTURE_PATH = FIXTURE_DIR / 'spike_coverage.nc'
MANIFEST_PATH = FIXTURE_DIR / 'fixture_manifest.json'

# Grid. Small enough to answer a query in seconds and to regenerate in one.
LON0, LON1, N_LON = -4.0, 1.0, 21          # 0.25 degree steps
LAT0, LAT1, N_LAT = 48.0, 53.0, 21         # 0.25 degree steps
DEPTHS = np.array([0.0, 10.0, 25.0, 50.0, 100.0, 200.0, 400.0])
T0 = np.datetime64('2026-09-01T00:00:00')
TIME_STEP_HOURS = 3
N_TIME = 13                                # T0 .. T0 + 36 h

DEPTH_SCALE = 100.0                        # metres
TIME_SCALE = np.timedelta64(1, 'h')

# Agreement expected between a returned value and the analytic expectation. The
# arithmetic is exact in principle; this allows for float64 round-off and for JSON
# serialisation of the response.
TOLERANCE = 1e-6                           # degrees Celsius

# The margin by which the per-vertex and single-time hypotheses must be separated for
# the result to mean anything (spec FR-007).
DISCRIMINATING_FACTOR = 10


def coefficients(seed: int = SEED) -> dict[str, float]:
    """Draw the analytic field's coefficients from a seeded generator."""
    rng = np.random.default_rng(seed)
    return {
        'c0': float(11.0 + rng.uniform(-0.5, 0.5)),
        'cu': float(rng.uniform(0.4, 0.8)),
        'cv': float(rng.uniform(-0.9, -0.5)),
        'cw': float(rng.uniform(-1.4, -0.9)),
        'cs': float(rng.uniform(-0.34, -0.26)),
        'cus': float(rng.uniform(-0.02, 0.02)),
        'cvw': float(rng.uniform(-0.15, 0.15)),
    }


def theta(
    lon: np.ndarray,
    lat: np.ndarray,
    depth: np.ndarray,
    hours_since_t0: np.ndarray,
    coeffs: dict[str, float] | None = None,
) -> np.ndarray:
    """Evaluate the analytic field. Broadcasting is the caller's business."""
    coeffs = coeffs or coefficients()
    u = np.asarray(lon, dtype=float) - LON0
    v = np.asarray(lat, dtype=float) - LAT0
    w = np.asarray(depth, dtype=float) / DEPTH_SCALE
    s = np.asarray(hours_since_t0, dtype=float)
    return (
        coeffs['c0']
        + coeffs['cu'] * u
        + coeffs['cv'] * v
        + coeffs['cw'] * w
        + coeffs['cs'] * s
        + coeffs['cus'] * u * s
        + coeffs['cvw'] * v * w
    )


def grid() -> dict[str, np.ndarray]:
    return {
        'lon': np.linspace(LON0, LON1, N_LON),
        'lat': np.linspace(LAT0, LAT1, N_LAT),
        'depth': DEPTHS.copy(),
        'time': T0 + np.arange(N_TIME) * np.timedelta64(TIME_STEP_HOURS, 'h'),
    }


def hours_since_t0(times: np.ndarray) -> np.ndarray:
    """Convert datetime64 values to fractional hours since the fixture's origin."""
    delta = np.asarray(times, dtype='datetime64[ns]') - T0.astype('datetime64[ns]')
    return delta / np.timedelta64(1, 'h')


def build_dataset(seed: int = SEED) -> xr.Dataset:
    coeffs = coefficients(seed)
    axes = grid()
    values = theta(
        axes['lon'][None, None, None, :],
        axes['lat'][None, None, :, None],
        axes['depth'][None, :, None, None],
        hours_since_t0(axes['time'])[:, None, None, None],
        coeffs,
    )

    dataset = xr.Dataset(
        data_vars={
            'sea_water_temperature': (
                ('time', 'depth', 'lat', 'lon'),
                values.astype('float64'),
                {
                    'standard_name': 'sea_water_temperature',
                    'long_name': 'Synthetic sea water temperature',
                    'units': 'degC',
                    'comment': (
                        'SYNTHETIC. Analytic, not measured, not modelled. '
                        'See the global source attribute for the formula.'
                    ),
                },
            )
        },
        coords={
            'time': ('time', axes['time']),
            'depth': (
                'depth',
                axes['depth'],
                {
                    'standard_name': 'depth',
                    'long_name': 'Depth below sea surface',
                    'units': 'm',
                    'positive': 'down',
                    'axis': 'Z',
                },
            ),
            'lat': (
                'lat',
                axes['lat'],
                {
                    'standard_name': 'latitude',
                    'long_name': 'Latitude',
                    'units': 'degrees_north',
                    'axis': 'Y',
                },
            ),
            'lon': (
                'lon',
                axes['lon'],
                {
                    'standard_name': 'longitude',
                    'long_name': 'Longitude',
                    'units': 'degrees_east',
                    'axis': 'X',
                },
            ),
        },
        attrs={
            'Conventions': 'CF-1.8',
            'title': 'drogna EDR trajectory spike fixture',
            'summary': (
                'SYNTHETIC DATA. Fake numerics from an analytic formula, generated '
                'for a throwaway investigation into OGC API-EDR trajectory queries. '
                'Not a measurement, not a forecast, and not derived from any real '
                'observation. Do not use for anything.'
            ),
            'source': (
                'theta = c0 + cu*u + cv*v + cw*w + cs*s + cus*u*s + cvw*v*w, where '
                'u = lon - {lon0}, v = lat - {lat0}, w = depth/{dscale}, '
                's = hours since {t0}. Coefficients: {coeffs}'.format(
                    lon0=LON0,
                    lat0=LAT0,
                    dscale=DEPTH_SCALE,
                    t0=str(T0),
                    coeffs=json.dumps(coeffs, sort_keys=True),
                )
            ),
            'comment': (
                'Every term is of degree at most one in each variable, so '
                'quadrilinear interpolation reproduces the field exactly.'
            ),
            'drogna_seed': seed,
            'drogna_synthetic': 'true',
            'drogna_spike': '002-edr-trajectory-spike',
        },
    )

    dataset.time.encoding.update(
        {'units': f'hours since {T0}', 'calendar': 'standard', 'dtype': 'float64'}
    )
    dataset.sea_water_temperature.encoding.update({'dtype': 'float64'})
    return dataset


def write_fixture(seed: int = SEED) -> pathlib.Path:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    dataset = build_dataset(seed)
    if FIXTURE_PATH.exists():
        FIXTURE_PATH.unlink()
    dataset.to_netcdf(FIXTURE_PATH)

    axes = grid()
    manifest = {
        'seed': seed,
        'coefficients': coefficients(seed),
        'tolerance_degC': TOLERANCE,
        'discriminating_factor': DISCRIMINATING_FACTOR,
        'grid': {
            'lon': [LON0, LON1, N_LON],
            'lat': [LAT0, LAT1, N_LAT],
            'depth': DEPTHS.tolist(),
            'time_origin': str(T0),
            'time_step_hours': TIME_STEP_HOURS,
            'time_steps': N_TIME,
        },
        'time_values': [str(value) for value in axes['time']],
        'bytes': FIXTURE_PATH.stat().st_size,
        'synthetic': True,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')
    return FIXTURE_PATH


if __name__ == '__main__':
    path = write_fixture()
    size = path.stat().st_size
    print(f'wrote {path} ({size} bytes, {size / 1e6:.3f} MB)')
    print(f'manifest {MANIFEST_PATH}')
    print(f'seed {SEED}, coefficients {json.dumps(coefficients(), sort_keys=True)}')
