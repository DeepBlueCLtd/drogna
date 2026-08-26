-- Roles and grants for the features schema. FR-013 and SC-010 in one file.
--
-- The claim being enforced: while a scenario runs, nothing can change the static spatial
-- reference. Every run-time role holds select and nothing else, and the provisioning role
-- is the only one that may write — which it does before the scenario starts and not
-- during it. The harness analogue of pre-sail loading: what is aboard is what was loaded.
--
-- The run-time roles are created by `stores/observations/roles.sql`, which runs first.
-- They are granted read access here and refused everything else.

REVOKE ALL ON SCHEMA features FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA features FROM PUBLIC;

GRANT USAGE ON SCHEMA features TO drogna_ingest, drogna_read, drogna_telemetry;
GRANT SELECT ON ALL TABLES IN SCHEMA features TO drogna_ingest, drogna_read, drogna_telemetry;

ALTER DEFAULT PRIVILEGES IN SCHEMA features
    GRANT SELECT ON TABLES TO drogna_ingest, drogna_read, drogna_telemetry;

-- The assertion, for the same reason as in the observations schema: a grant that drifted
-- should fail the provisioning run rather than be discovered by a component that wrote
-- something it should not have been able to write.
DO $assert$
DECLARE
    runtime text;
    relation text;
BEGIN
    FOREACH runtime IN ARRAY ARRAY['drogna_ingest', 'drogna_read', 'drogna_telemetry']
    LOOP
        FOREACH relation IN ARRAY ARRAY['features.bathymetry', 'features.coastline']
        LOOP
            IF NOT has_table_privilege(runtime, relation, 'SELECT') THEN
                RAISE EXCEPTION 'role % cannot read %; the reference data is there to be read',
                    runtime, relation;
            END IF;
            IF has_table_privilege(runtime, relation, 'INSERT')
               OR has_table_privilege(runtime, relation, 'UPDATE')
               OR has_table_privilege(runtime, relation, 'DELETE') THEN
                RAISE EXCEPTION
                    'role % can write to %; the feature store is read-only during a run '
                    '(FR-013)', runtime, relation;
            END IF;
        END LOOP;
    END LOOP;
END
$assert$;
