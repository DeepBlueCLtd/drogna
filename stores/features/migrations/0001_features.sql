-- 0001: the features schema — static spatial reference, and nothing that moves.
--
-- Two tables: a grid of depths and a line along the shallow edge of the domain. Both are
-- synthetic, both are produced from the run's root seed by
-- `stores/features/provision.py`, and neither describes a real place. The harness's
-- numerics are deliberately fake (SRD §1.1) and this is reference data for drawing
-- against, not a chart.
--
-- The schema sits beside `observations` in the same Postgres instance (SRD FR-12). It is
-- provisioned before a scenario starts and is read-only while one runs: the grants in
-- `stores/features/roles.sql` give every run-time role select and nothing else.
--
-- harness:allow-wallclock the prohibition has to be stated where the columns are declared
-- As in the observations schema, no column takes a now() or current_timestamp default.
-- There is no time in this schema at all: the content is static for the whole of a run.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS features;

CREATE TABLE IF NOT EXISTS features.provisioning (
    name    text PRIMARY KEY,
    digest  text NOT NULL
);

COMMENT ON TABLE features.provisioning IS
    'What was loaded and the digest of its content, so two instances provisioned from one root seed can be compared.';

CREATE TABLE IF NOT EXISTS features.bathymetry (
    id         text PRIMARY KEY,
    latitude   double precision NOT NULL,
    longitude  double precision NOT NULL,
    depth_m    double precision NOT NULL,
    location   geography(Point, 4326) NOT NULL
);

COMMENT ON TABLE features.bathymetry IS
    'A seeded grid of depths. Not a survey: the shape is whatever the seeded parameters make it.';

CREATE TABLE IF NOT EXISTS features.coastline (
    id    text PRIMARY KEY,
    name  text NOT NULL,
    line  geography(LineString, 4326) NOT NULL
);

COMMENT ON TABLE features.coastline IS
    'A seeded line along the shallow edge of the domain. A boundary to draw against.';

CREATE INDEX IF NOT EXISTS bathymetry_location_idx
    ON features.bathymetry USING gist (location);

CREATE INDEX IF NOT EXISTS coastline_line_idx
    ON features.coastline USING gist (line);
