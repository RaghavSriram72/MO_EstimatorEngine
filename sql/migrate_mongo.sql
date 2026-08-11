-- ============================================================================
-- Midnight Oil Estimator — MongoDB → SQL Server 2025 data migration
-- Step 3 of 3: load the MONGO_database\*.json exports into the tables created
-- by create_tables.sql. Idempotent — safe to re-run.
--
-- Set @MongoDir below to the folder holding the .json exports, then run in a
-- normal SSMS query window (no SQLCMD mode needed) or with:
--   sqlcmd -S <server> -d MidnighOilEstimator -i sql\migrate_mongo.sql
--
-- Requirements:
--   * The tables from sql\create_tables.sql already exist.
--   * The caller has ADMINISTER BULK OPERATIONS, and the SQL Server service
--     account can read @MongoDir (use a local path or a UNC share the
--     service account can reach — a mapped drive letter will not work).
--
-- How it works:
--   * Each file is slurped whole with OPENROWSET(..., SINGLE_BLOB) and decoded
--     as UTF-8, then shredded with OPENJSON.
--   * Mongo's 24-hex ``_id`` values cannot become IDENTITY keys, so every
--     migrated document is recorded in dbo.migration_mongo_map. That table is
--     what makes re-runs skip already-loaded documents and what remaps the
--     cross-collection references (quotes→projects, history→projects/quotes).
--     Keep it: dropping it and re-running would duplicate every document.
--   * Reference/cost tables carry no ``_id`` worth preserving, so they are
--     guarded on their natural keys instead.
--   * Everything runs in one transaction; any error rolls the whole load back.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ───────────────────────── preflight ─────────────────────────
IF OBJECT_ID(N'dbo.projects', N'U') IS NULL
BEGIN
    THROW 50000, N'Schema missing. Run sql\create_tables.sql first.', 1;
END;
GO

-- Records which SQL identity each migrated Mongo document became.
IF OBJECT_ID(N'dbo.migration_mongo_map', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.migration_mongo_map (
        collection  SYSNAME      NOT NULL,
        mongo_id    CHAR(24)     NOT NULL,
        sql_id      BIGINT       NOT NULL,
        migrated_at DATETIME2(3) NOT NULL
            CONSTRAINT DF_migration_mongo_map_migrated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_migration_mongo_map PRIMARY KEY (collection, mongo_id)
    );
END;
GO

-- Reads one JSON file whole and hands back its text.
--
-- OPENROWSET's BULK path must be a literal, so it is built as dynamic SQL —
-- that is what lets the folder live in a plain T-SQL variable instead of a
-- sqlcmd :setvar, which SSMS only understands in SQLCMD mode.
--
-- The bytes are read raw, tagged UTF-8, and then decoded by the assignment to
-- NVARCHAR. (SINGLE_CLOB would decode using the database collation and mangle
-- any non-ASCII text.)
--
-- Dropped first so re-running the script in the same SSMS session works.
IF OBJECT_ID(N'tempdb..#read_json_file', N'P') IS NOT NULL
    DROP PROCEDURE #read_json_file;
GO

CREATE PROCEDURE #read_json_file
    @dir  NVARCHAR(400),
    @file NVARCHAR(128),
    @json NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Tolerate a trailing slash on @dir.
    DECLARE @path NVARCHAR(600) =
        CASE WHEN RIGHT(@dir, 1) IN (N'\', N'/') THEN LEFT(@dir, LEN(@dir) - 1) ELSE @dir END
        + N'\' + @file;

    DECLARE @sql NVARCHAR(MAX) =
        N'SELECT @out = CAST(BulkColumn AS VARCHAR(MAX)) COLLATE Latin1_General_100_CI_AS_SC_UTF8
          FROM OPENROWSET(BULK N''' + REPLACE(@path, N'''', N'''''') + N''', SINGLE_BLOB) AS src;';

    EXEC sys.sp_executesql @sql, N'@out NVARCHAR(MAX) OUTPUT', @out = @json OUTPUT;

    IF @json IS NULL
        THROW 50001, N'Could not read a JSON export file — check @MongoDir and that the SQL Server service account can read it.', 1;
END;
GO

-- ============================================================================
-- Single batch from here down: the staging temp tables and @json must survive
-- across sections, and TRY/CATCH cannot span GO.
-- ============================================================================

-- ▼▼▼ EDIT THIS: folder containing the MongoDB .json exports ▼▼▼
DECLARE @MongoDir NVARCHAR(400) = N'C:\dev\projects\mo-estimator\MONGO_database';

DECLARE @json NVARCHAR(MAX);

BEGIN TRY
BEGIN TRANSACTION;

-- ────────────────────────────── users ──────────────────────────────
EXEC #read_json_file @MongoDir, N'users.json', @json OUTPUT;

INSERT dbo.users (username, password_hash, role)
SELECT d.username, d.password_hash, ISNULL(d.role, N'user')
FROM OPENJSON(@json) WITH (
        username      NVARCHAR(256) N'$.username',
        password_hash NVARCHAR(512) N'$.password_hash',
        role          NVARCHAR(20)  N'$.role'  -- absent on legacy exports; defaults to 'user'
     ) AS d
WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.username = d.username);

-- ───────────────────────────── projects ────────────────────────────
EXEC #read_json_file @MongoDir, N'projects.json', @json OUTPUT;

SELECT
    d.mongo_id,
    d.owner,
    d.schema_version,
    d.project_name,
    d.num_standees,
    d.standee_type,
    d.elements,
    -- Mongo has no created_at on projects, but the first 4 bytes of an ObjectId
    -- are the creation time in unix seconds — recover it rather than stamping
    -- every legacy project with the migration time.
    created_at = DATEADD(SECOND,
                         CONVERT(INT, CONVERT(VARBINARY(4), SUBSTRING(d.mongo_id, 1, 8), 2)),
                         CAST(N'1970-01-01T00:00:00' AS DATETIME2(3)))
INTO #projects
FROM OPENJSON(@json) WITH (
        mongo_id       CHAR(24)      N'$._id',
        owner          NVARCHAR(256) N'$.owner',
        schema_version INT           N'$.schema_version',
        project_name   NVARCHAR(512) N'$.project_name',
        num_standees   INT           N'$.num_standees',
        standee_type   NVARCHAR(16)  N'$.standee_type',
        elements       NVARCHAR(MAX) N'$.elements' AS JSON
     ) AS d;

-- MERGE (not INSERT…SELECT) because only MERGE's OUTPUT can emit a source
-- column — here the Mongo _id — alongside the generated identity.
MERGE dbo.projects AS tgt
USING (
        SELECT p.*
        FROM #projects p
        WHERE NOT EXISTS (
                SELECT 1 FROM dbo.migration_mongo_map m
                WHERE m.collection = N'projects' AND m.mongo_id = p.mongo_id)
      ) AS src
ON 1 = 0  -- never matches: this is an insert-only MERGE
WHEN NOT MATCHED BY TARGET THEN
    INSERT (owner, schema_version, project_name, num_standees, standee_type, short_id, created_at)
    -- short_id is deliberately left NULL: it is an 8-digit hash *of the id*, so
    -- the Mongo value no longer matches the new project_id. The backend
    -- backfills it from the SQL id on first read (db._ensure_project_short_id).
    VALUES (src.owner, src.schema_version, src.project_name, src.num_standees,
            src.standee_type, NULL, src.created_at)
OUTPUT N'projects', src.mongo_id, inserted.project_id
INTO dbo.migration_mongo_map (collection, mongo_id, sql_id);

INSERT dbo.project_elements
    (project_id, position, name, length, width, linear_inches, complexity, description, mask_b64)
SELECT
    m.sql_id,
    CAST(e.[key] AS INT),  -- array index; backend treats position as 0-based
    ISNULL(el.name, N''),
    el.length,
    el.width,
    el.linear_inches,
    el.complexity,
    ISNULL(el.description, N''),
    el.mask_b64
FROM #projects p
JOIN dbo.migration_mongo_map m
    ON m.collection = N'projects' AND m.mongo_id = p.mongo_id
CROSS APPLY OPENJSON(p.elements) AS e
CROSS APPLY OPENJSON(e.value) WITH (
        name          NVARCHAR(512) N'$.name',
        length        FLOAT         N'$.length',
        width         FLOAT         N'$.width',
        linear_inches FLOAT         N'$.linear_inches',
        complexity    NVARCHAR(16)  N'$.complexity',
        description   NVARCHAR(MAX) N'$.description',
        mask_b64      NVARCHAR(MAX) N'$.mask_b64'
     ) AS el
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.project_elements pe WHERE pe.project_id = m.sql_id);

-- ────────────────────────────── quotes ─────────────────────────────
EXEC #read_json_file @MongoDir, N'quotes.json', @json OUTPUT;

SELECT
    d.mongo_id,
    d.mongo_project_id,
    d.owner,
    d.schema_version,
    d.quote_name,
    d.scenario,
    d.num_standees,
    d.contribution_margin,
    d.standee_type,
    -- v1 exports carry only ``breakdown``; the v2 blobs are absent and default
    -- to {}. Declared anyway so a later v2 export migrates unchanged.
    scenarios  = ISNULL(d.scenarios,  N'{}'),
    universal  = ISNULL(d.universal,  N'{}'),
    params     = ISNULL(d.params,     N'{}'),
    breakdown  = ISNULL(d.breakdown,  N'{}'),
    d.elements,
    created_at = ISNULL(TRY_CONVERT(DATETIME2(3), d.created_at, 127), SYSUTCDATETIME()),
    updated_at = ISNULL(TRY_CONVERT(DATETIME2(3), d.updated_at, 127), SYSUTCDATETIME())
INTO #quotes
FROM OPENJSON(@json) WITH (
        mongo_id            CHAR(24)      N'$._id',
        mongo_project_id    CHAR(24)      N'$.project_id',
        owner               NVARCHAR(256) N'$.owner',
        schema_version      INT           N'$.schema_version',
        quote_name          NVARCHAR(512) N'$.quote_name',
        scenario            INT           N'$.scenario',
        num_standees        INT           N'$.num_standees',
        contribution_margin FLOAT         N'$.contribution_margin',
        standee_type        NVARCHAR(16)  N'$.standee_type',
        scenarios           NVARCHAR(MAX) N'$.scenarios' AS JSON,
        universal           NVARCHAR(MAX) N'$.universal' AS JSON,
        params              NVARCHAR(MAX) N'$.params'    AS JSON,
        breakdown           NVARCHAR(MAX) N'$.breakdown' AS JSON,
        elements            NVARCHAR(MAX) N'$.elements'  AS JSON,
        created_at          NVARCHAR(64)  N'$.created_at',
        updated_at          NVARCHAR(64)  N'$.updated_at'
     ) AS d;

MERGE dbo.quotes AS tgt
USING (
        SELECT q.*, pm.sql_id AS project_id
        FROM #quotes q
        JOIN dbo.migration_mongo_map pm
            ON pm.collection = N'projects' AND pm.mongo_id = q.mongo_project_id
        WHERE NOT EXISTS (
                SELECT 1 FROM dbo.migration_mongo_map m
                WHERE m.collection = N'quotes' AND m.mongo_id = q.mongo_id)
      ) AS src
ON 1 = 0
WHEN NOT MATCHED BY TARGET THEN
    INSERT (project_id, owner, schema_version, quote_name, scenario, num_standees,
            contribution_margin, standee_type, scenarios, universal, params, breakdown,
            created_at, updated_at)
    VALUES (src.project_id, src.owner, src.schema_version, src.quote_name, src.scenario,
            src.num_standees, src.contribution_margin, src.standee_type, src.scenarios,
            src.universal, src.params, src.breakdown, src.created_at, src.updated_at)
OUTPUT N'quotes', src.mongo_id, inserted.quote_id
INTO dbo.migration_mongo_map (collection, mongo_id, sql_id);

INSERT dbo.quote_elements
    (quote_id, position, name, length, width, linear_inches, complexity, description, mask_b64)
SELECT
    m.sql_id,
    CAST(e.[key] AS INT),
    ISNULL(el.name, N''),
    el.length,
    el.width,
    el.linear_inches,
    el.complexity,
    ISNULL(el.description, N''),
    el.mask_b64
FROM #quotes q
JOIN dbo.migration_mongo_map m
    ON m.collection = N'quotes' AND m.mongo_id = q.mongo_id
CROSS APPLY OPENJSON(q.elements) AS e
CROSS APPLY OPENJSON(e.value) WITH (
        name          NVARCHAR(512) N'$.name',
        length        FLOAT         N'$.length',
        width         FLOAT         N'$.width',
        linear_inches FLOAT         N'$.linear_inches',
        complexity    NVARCHAR(16)  N'$.complexity',
        description   NVARCHAR(MAX) N'$.description',
        mask_b64      NVARCHAR(MAX) N'$.mask_b64'
     ) AS el
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.quote_elements qe WHERE qe.quote_id = m.sql_id);

-- ────────────────────────────── history ────────────────────────────
EXEC #read_json_file @MongoDir, N'history.json', @json OUTPUT;

SELECT
    d.mongo_id,
    d.mongo_project_id,
    d.mongo_quote_id,
    d.mongo_reverted_from,
    d.owner,
    d.entity_type,
    d.scenario,
    d.change_type,
    d.changed_by,
    d.label,
    snapshot   = ISNULL(d.snapshot, N'{}'),
    created_at = ISNULL(TRY_CONVERT(DATETIME2(3), d.created_at, 127), SYSUTCDATETIME())
INTO #history
FROM OPENJSON(@json) WITH (
        mongo_id           CHAR(24)      N'$._id',
        mongo_project_id   CHAR(24)      N'$.project_id',
        mongo_quote_id     CHAR(24)      N'$.quote_id',
        mongo_reverted_from CHAR(24)     N'$.reverted_from_history_id',
        owner              NVARCHAR(256) N'$.owner',
        entity_type        NVARCHAR(16)  N'$.entity_type',
        scenario           INT           N'$.scenario',
        change_type        NVARCHAR(32)  N'$.change_type',
        changed_by         NVARCHAR(256) N'$.changed_by',
        label              NVARCHAR(512) N'$.label',
        snapshot           NVARCHAR(MAX) N'$.snapshot' AS JSON,
        created_at         NVARCHAR(64)  N'$.created_at'
     ) AS d;

-- quote_id is a LEFT JOIN on purpose: audit rows outlive the quotes they
-- describe, so history pointing at an already-deleted quote lands as NULL
-- (matching the schema, which has no FK there).
MERGE dbo.history AS tgt
USING (
        SELECT h.*, pm.sql_id AS project_id, qm.sql_id AS quote_id
        FROM #history h
        JOIN dbo.migration_mongo_map pm
            ON pm.collection = N'projects' AND pm.mongo_id = h.mongo_project_id
        LEFT JOIN dbo.migration_mongo_map qm
            ON qm.collection = N'quotes' AND qm.mongo_id = h.mongo_quote_id
        WHERE NOT EXISTS (
                SELECT 1 FROM dbo.migration_mongo_map m
                WHERE m.collection = N'history' AND m.mongo_id = h.mongo_id)
      ) AS src
ON 1 = 0
WHEN NOT MATCHED BY TARGET THEN
    INSERT (project_id, owner, entity_type, quote_id, scenario, change_type,
            changed_by, label, snapshot, reverted_from_history_id, created_at)
    -- reverted_from_history_id is remapped below, once every history row has an id.
    VALUES (src.project_id, src.owner, src.entity_type, src.quote_id, src.scenario,
            src.change_type, src.changed_by, src.label, src.snapshot, NULL, src.created_at)
OUTPUT N'history', src.mongo_id, inserted.history_id
INTO dbo.migration_mongo_map (collection, mongo_id, sql_id);

-- Self-reference fix-up: history → history.
UPDATE hist
SET hist.reverted_from_history_id = rm.sql_id
FROM dbo.history hist
JOIN dbo.migration_mongo_map m
    ON m.collection = N'history' AND m.sql_id = hist.history_id
JOIN #history h
    ON h.mongo_id = m.mongo_id
JOIN dbo.migration_mongo_map rm
    ON rm.collection = N'history' AND rm.mongo_id = h.mongo_reverted_from
WHERE hist.reverted_from_history_id IS NULL;

-- ──────────────────────────── unit_costs ───────────────────────────
EXEC #read_json_file @MongoDir, N'unit_costs.json', @json OUTPUT;

INSERT dbo.unit_costs (name, [type], display_name, cost, unit, setup_time, throughput, throughput_unit)
SELECT d.name, d.[type], d.display_name, d.cost, d.unit, d.setup_time, d.throughput, d.throughput_unit
FROM OPENJSON(@json) WITH (
        name            NVARCHAR(128) N'$.name',
        [type]          NVARCHAR(64)  N'$.type',
        display_name    NVARCHAR(256) N'$.display_name',
        cost            FLOAT         N'$.cost',
        unit            NVARCHAR(32)  N'$.unit',
        setup_time      FLOAT         N'$.setup_time',       -- machines only
        throughput      FLOAT         N'$.throughput',
        throughput_unit NVARCHAR(32)  N'$.throughput_unit'
     ) AS d
WHERE NOT EXISTS (SELECT 1 FROM dbo.unit_costs uc WHERE uc.name = d.name);

-- ─────────────────────── standee_static_costs ──────────────────────
EXEC #read_json_file @MongoDir, N'standee.json', @json OUTPUT;

INSERT dbo.standee_static_costs (
        standee_type, engineering_design_cost_per_project,
        instruction_sheet_engineering_cost_per_project, hardware_cost,
        zund_print_form_minutes, zund_blank_form_minutes, instruction_sheet_total_cost,
        cutting_die_inches_multiplier, kitting_and_assembly,
        cutting_die_blank_form_min, cutting_die_print_form_min)
SELECT
    d.standee_type, d.engineering_design_cost_per_project,
    d.instruction_sheet_engineering_cost_per_project, d.hardware_cost,
    d.zund_print_form_minutes, d.zund_blank_form_minutes, d.instruction_sheet_total_cost,
    d.cutting_die_inches_multiplier, d.kitting_and_assembly,
    d.cutting_die_blank_form_min, d.cutting_die_print_form_min
FROM OPENJSON(@json) WITH (
        standee_type                                   NVARCHAR(64) N'$.standee_type',
        engineering_design_cost_per_project            FLOAT N'$.engineering_design_cost_per_project',
        instruction_sheet_engineering_cost_per_project FLOAT N'$.instruction_sheet_engineering_cost_per_project',
        hardware_cost                                  FLOAT N'$.hardware_cost',
        zund_print_form_minutes                        FLOAT N'$.zund_print_form_minutes',
        zund_blank_form_minutes                        FLOAT N'$.zund_blank_form_minutes',
        instruction_sheet_total_cost                   FLOAT N'$.instruction_sheet_total_cost',
        cutting_die_inches_multiplier                  FLOAT N'$.cutting_die_inches_multiplier',
        kitting_and_assembly                           FLOAT N'$.kitting_and_assembly',
        cutting_die_blank_form_min                     FLOAT N'$.cutting_die_blank_form_min',
        cutting_die_print_form_min                     FLOAT N'$.cutting_die_print_form_min'
     ) AS d
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.standee_static_costs s WHERE s.standee_type = d.standee_type);

-- ───────────────────────── print_blank_ratio ───────────────────────
EXEC #read_json_file @MongoDir, N'print_blank.json', @json OUTPUT;

INSERT dbo.print_blank_ratio (print_forms, blank_forms)
SELECT d.print_forms, d.blank_forms
FROM OPENJSON(@json) WITH (
        print_forms INT   N'$.print_forms',
        blank_forms FLOAT N'$.blank_forms'
     ) AS d
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.print_blank_ratio r WHERE r.print_forms = d.print_forms);

-- ─────────────────────────────── overs ─────────────────────────────
EXEC #read_json_file @MongoDir, N'overs.json', @json OUTPUT;

-- No unique constraint on overs, so the tier bounds act as the natural key
-- (upper_bound is NULL on the open-ended top tier — hence the IS NULL arm).
INSERT dbo.overs (lower_bound, upper_bound, overs)
SELECT d.lower_bound, d.upper_bound, d.overs
FROM OPENJSON(@json) WITH (
        lower_bound INT N'$.lower_bound',
        upper_bound INT N'$.upper_bound',
        overs       INT N'$.overs'
     ) AS d
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.overs o
        WHERE o.lower_bound = d.lower_bound
          AND (o.upper_bound = d.upper_bound
               OR (o.upper_bound IS NULL AND d.upper_bound IS NULL)));

-- ────────────────────────────── packout ────────────────────────────
EXEC #read_json_file @MongoDir, N'packout.json', @json OUTPUT;

-- One row per (standees range, complexity) — packout no longer varies by a
-- forms range (see create_tables.sql).
INSERT dbo.packout (standees_lower_bound, standees_upper_bound, complexity, packout, last_updated)
SELECT d.standees_lower_bound, d.standees_upper_bound, d.complexity, d.packout,
       ISNULL(TRY_CONVERT(DATETIME2(3), d.last_updated, 127), SYSUTCDATETIME())
FROM OPENJSON(@json) WITH (
        standees_lower_bound INT          N'$.standees_lower_bound',
        standees_upper_bound INT          N'$.standees_upper_bound',
        complexity           NVARCHAR(32) N'$.complexity',
        packout               FLOAT        N'$.packout',
        last_updated          NVARCHAR(64) N'$.last_updated'  -- absent on most rows
     ) AS d
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.packout p
        WHERE p.complexity = d.complexity
          AND p.standees_lower_bound = d.standees_lower_bound
          AND (p.standees_upper_bound = d.standees_upper_bound
               OR (p.standees_upper_bound IS NULL AND d.standees_upper_bound IS NULL)));

-- ─────────────── supplier_materials + supplier_price_breaks ────────
EXEC #read_json_file @MongoDir, N'suppliers.json', @json OUTPUT;

SELECT
    d.supplier,
    d.material,
    d.material_display_name,
    material_type = ISNULL(d.material_type, N''),  -- '' = untyped
    d.unit,
    d.curve_a, d.curve_b, d.curve_c, d.curve_r_squared,
    d.price_breaks,
    last_updated = ISNULL(TRY_CONVERT(DATETIME2(3), d.last_updated, 127), SYSUTCDATETIME())
INTO #suppliers
FROM OPENJSON(@json) WITH (
        supplier              NVARCHAR(128) N'$.supplier',
        material              NVARCHAR(128) N'$.material',
        material_display_name NVARCHAR(256) N'$.material_display_name',
        material_type         NVARCHAR(64)  N'$.type',
        unit                  NVARCHAR(32)  N'$.unit',
        -- Mongo nests the fit under curve_params; the table flattens it.
        curve_a               FLOAT         N'$.curve_params.a',
        curve_b               FLOAT         N'$.curve_params.b',
        curve_c               FLOAT         N'$.curve_params.c',
        curve_r_squared       FLOAT         N'$.curve_params.r_squared',
        price_breaks          NVARCHAR(MAX) N'$.price_breaks' AS JSON,
        last_updated          NVARCHAR(64)  N'$.last_updated'
     ) AS d;

INSERT dbo.supplier_materials (supplier, material, material_display_name, material_type,
                               unit, curve_a, curve_b, curve_c, curve_r_squared, last_updated)
SELECT s.supplier, s.material, s.material_display_name, s.material_type, s.unit,
       s.curve_a, s.curve_b, s.curve_c, s.curve_r_squared, s.last_updated
FROM #suppliers s
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.supplier_materials sm
        WHERE sm.supplier = s.supplier
          AND sm.material = s.material
          AND sm.material_type = s.material_type);

INSERT dbo.supplier_price_breaks (supplier_material_id, amount, cost)
SELECT sm.supplier_material_id, pb.amount, pb.cost
FROM #suppliers s
JOIN dbo.supplier_materials sm
    ON sm.supplier = s.supplier
   AND sm.material = s.material
   AND sm.material_type = s.material_type
CROSS APPLY OPENJSON(s.price_breaks) WITH (
        amount FLOAT N'$.amount',
        cost   FLOAT N'$.cost'
     ) AS pb
WHERE NOT EXISTS (
        SELECT 1 FROM dbo.supplier_price_breaks b
        WHERE b.supplier_material_id = sm.supplier_material_id);

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

DROP PROCEDURE #read_json_file;
GO

-- ─────────────────────────── verification ──────────────────────────
SELECT table_name = N'users',                  row_count = COUNT_BIG(*) FROM dbo.users
UNION ALL SELECT N'projects',              COUNT_BIG(*) FROM dbo.projects
UNION ALL SELECT N'project_elements',      COUNT_BIG(*) FROM dbo.project_elements
UNION ALL SELECT N'quotes',                COUNT_BIG(*) FROM dbo.quotes
UNION ALL SELECT N'quote_elements',        COUNT_BIG(*) FROM dbo.quote_elements
UNION ALL SELECT N'history',               COUNT_BIG(*) FROM dbo.history
UNION ALL SELECT N'unit_costs',            COUNT_BIG(*) FROM dbo.unit_costs
UNION ALL SELECT N'standee_static_costs',  COUNT_BIG(*) FROM dbo.standee_static_costs
UNION ALL SELECT N'print_blank_ratio',     COUNT_BIG(*) FROM dbo.print_blank_ratio
UNION ALL SELECT N'overs',                 COUNT_BIG(*) FROM dbo.overs
UNION ALL SELECT N'packout',               COUNT_BIG(*) FROM dbo.packout
UNION ALL SELECT N'supplier_materials',    COUNT_BIG(*) FROM dbo.supplier_materials
UNION ALL SELECT N'supplier_price_breaks', COUNT_BIG(*) FROM dbo.supplier_price_breaks
ORDER BY table_name;
GO

-- History rows whose quote was already deleted in Mongo land with quote_id NULL.
SELECT orphaned_history_quote_refs = COUNT_BIG(*)
FROM dbo.history
WHERE entity_type = N'quote' AND quote_id IS NULL;
GO
