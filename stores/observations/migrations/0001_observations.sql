-- 0001: the observations schema, its six tables and its indexes.
--
-- What this schema admits, and what it refuses
-- -------------------------------------------
-- Environmental measurements, and the SensorThings entities that say what a measurement
-- is of. There is no entity here that persists an identity across positions: a Thing is a
-- sampling platform, which is to say a coordinate and a sampler, and a FeatureOfInterest
-- is where a sample was taken. Nothing joins a series of positions into anything, and no
-- column exists that would let one be reconstructed as one — no heading, no speed, no
-- association, no arrival order (Constitution V). `stores/observations/README.md` states
-- this at length, because the store of positions over time is the place in drogna where
-- the vocabulary is most easily lost.
--
-- Time
-- ----
-- phenomenon_time is simulation time, taken from the clock port by the sensor that
-- measured the value, and it is the only time in this schema. There is no arrival time,
-- no insertion time and no host-clock value.
--
-- harness:allow-wallclock the prohibition has to be stated where the columns are declared
-- No column in this schema may take a now() or current_timestamp default, and none does.
-- A default of that kind would put the host's clock into a stored value, which is the one
-- property the SRD says cannot be retrofitted (Constitution I, FR-09). Ordering is by
-- phenomenon_time, so an observation that arrives late is stored on its own time.
--
-- Identifiers
-- -----------
-- Every primary key is a text identifier the publisher derived from the run's root seed
-- and the record's logical position. There is no sequence and no generated identity in
-- this schema: a replay reproduces the same keys, which is what makes redelivery of an
-- already-stored observation a no-op rather than a duplicate row.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS observations;

-- The record of which migrations have been applied, so a fresh instance and a migrated
-- one agree (NFR-07). It carries a digest rather than a time: what matters is that the
-- file that ran is the file in the repository, not when somebody ran it.
CREATE TABLE IF NOT EXISTS observations.migration (
    name    text PRIMARY KEY,
    digest  text NOT NULL
);

CREATE TABLE IF NOT EXISTS observations.thing (
    id           text PRIMARY KEY,
    name         text NOT NULL,
    description  text NOT NULL
);

COMMENT ON TABLE observations.thing IS
    'A sampling platform: a coordinate and a sampler. It holds no history and joins nothing.';

CREATE TABLE IF NOT EXISTS observations.sensor (
    id             text PRIMARY KEY,
    name           text NOT NULL,
    description    text NOT NULL,
    encoding_type  text NOT NULL,
    metadata       text NOT NULL
);

COMMENT ON COLUMN observations.sensor.metadata IS
    'The instrument''s declared noise model, so a stored value can be scored against the generator''s field.';

CREATE TABLE IF NOT EXISTS observations.observed_property (
    id           text PRIMARY KEY,
    name         text NOT NULL,
    definition   text NOT NULL,
    description  text NOT NULL
);

COMMENT ON TABLE observations.observed_property IS
    'Temperature, salinity and pressure. Sound speed is derived at the point of use and is never stored (ADR-0005).';

CREATE TABLE IF NOT EXISTS observations.datastream (
    id                    text PRIMARY KEY,
    name                  text NOT NULL,
    description           text NOT NULL,
    observation_type      text NOT NULL,
    unit_name             text NOT NULL,
    unit_symbol           text NOT NULL,
    unit_definition       text NOT NULL,
    thing_id              text NOT NULL REFERENCES observations.thing (id),
    sensor_id             text NOT NULL REFERENCES observations.sensor (id),
    observed_property_id  text NOT NULL REFERENCES observations.observed_property (id)
);

CREATE TABLE IF NOT EXISTS observations.feature_of_interest (
    id             text PRIMARY KEY,
    name           text NOT NULL,
    description    text NOT NULL,
    encoding_type  text NOT NULL,
    feature        text NOT NULL
);

COMMENT ON COLUMN observations.feature_of_interest.feature IS
    'The sampled location as GeoJSON, derived by the ingest client from the observation''s own position so the two cannot disagree.';

CREATE TABLE IF NOT EXISTS observations.observation (
    id               text PRIMARY KEY,
    phenomenon_time  timestamptz NOT NULL,
    tick             bigint NOT NULL,
    scenario_run_id  text NOT NULL,
    result           double precision NOT NULL,
    depth_m          double precision NOT NULL,
    location         geography(Point, 4326) NOT NULL,
    datastream_id    text NOT NULL REFERENCES observations.datastream (id),
    feature_id       text NOT NULL REFERENCES observations.feature_of_interest (id)
);

COMMENT ON COLUMN observations.observation.phenomenon_time IS
    'Simulation time of the measurement, and the only time in this schema. No default, deliberately.';

COMMENT ON COLUMN observations.observation.id IS
    'Derived from the root seed and the observation''s logical position. Redelivery of the same identifier is a no-op.';

CREATE INDEX IF NOT EXISTS observation_phenomenon_time_idx
    ON observations.observation (phenomenon_time);

CREATE INDEX IF NOT EXISTS observation_datastream_time_idx
    ON observations.observation (datastream_id, phenomenon_time);

CREATE INDEX IF NOT EXISTS observation_location_idx
    ON observations.observation USING gist (location);
