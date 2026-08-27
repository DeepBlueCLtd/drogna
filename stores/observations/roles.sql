-- Roles and grants for the observations schema. FR-018 and SC-003 in one file.
--
-- The claim being enforced: exactly one role can put a row into this schema, and it is the
-- ingest client's. Not by convention, not by review, and not by everybody agreeing to use
-- the client — by the database refusing anybody else. An operator's convenience script
-- connecting as the read role is refused in the same breath as a rogue component, which is
-- the property that makes the single ingestion seam a seam rather than a habit.
--
-- The ingest role holds SELECT and INSERT and nothing more. There is no UPDATE and no
-- DELETE: a measurement is not amended after the fact, and a store whose history can be
-- rewritten cannot be replayed against.
--
-- Roles are created without passwords. Passwords are assigned at deploy time from the
-- rendered configuration and appear in no tracked file; see stores/observations/README.md.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'drogna_ingest') THEN
        CREATE ROLE drogna_ingest LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'drogna_read') THEN
        CREATE ROLE drogna_read LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'drogna_telemetry') THEN
        CREATE ROLE drogna_telemetry LOGIN;
    END IF;
END
$$;

-- Nothing is granted to PUBLIC, so a role that is not named below has nothing here.
REVOKE ALL ON SCHEMA observations FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA observations FROM PUBLIC;

GRANT USAGE ON SCHEMA observations TO drogna_ingest, drogna_read, drogna_telemetry;

-- The one writer.
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA observations TO drogna_ingest;

-- The query layer (C-09) and telemetry (C-16) read and do nothing else.
GRANT SELECT ON ALL TABLES IN SCHEMA observations TO drogna_read, drogna_telemetry;

-- A table added by a later migration inherits the same shape, so a new table cannot
-- arrive with permissions nobody chose.
ALTER DEFAULT PRIVILEGES IN SCHEMA observations
    GRANT SELECT, INSERT ON TABLES TO drogna_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA observations
    GRANT SELECT ON TABLES TO drogna_read, drogna_telemetry;

-- The assertion. Applying grants and then trusting them is how a drifted grant is
-- discovered six weeks later by a component that could write and should not have been
-- able to. This block fails the provisioning run instead (SC-003).
DO $assert$
DECLARE
    writer text;
    unexpected text;
BEGIN
    IF NOT has_table_privilege('drogna_ingest', 'observations.observation', 'INSERT') THEN
        RAISE EXCEPTION 'the ingest role cannot insert; nothing would reach the store';
    END IF;
    FOR writer IN
        SELECT rolname FROM pg_roles WHERE rolname IN ('drogna_read', 'drogna_telemetry')
    LOOP
        IF has_table_privilege(writer, 'observations.observation', 'INSERT') THEN
            RAISE EXCEPTION
                'role % can insert into the observations schema; the ingest client is the '
                'only writer (FR-018)', writer;
        END IF;
        IF has_table_privilege(writer, 'observations.observation', 'UPDATE')
           OR has_table_privilege(writer, 'observations.observation', 'DELETE') THEN
            RAISE EXCEPTION 'role % can amend stored observations', writer;
        END IF;
    END LOOP;
    SELECT string_agg(DISTINCT grantee, ', ') INTO unexpected
    FROM information_schema.role_table_grants
    WHERE table_schema = 'observations'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
      AND grantee NOT IN ('drogna_ingest', current_user, 'PUBLIC')
      AND grantee <> (SELECT rolname FROM pg_roles WHERE oid = (
            SELECT relowner FROM pg_class WHERE oid = 'observations.observation'::regclass));
    IF unexpected IS NOT NULL THEN
        RAISE EXCEPTION 'these roles can write to the observations schema and should not: %',
            unexpected;
    END IF;
END
$assert$;
