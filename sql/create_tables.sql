-- ============================================================================
-- Midnight Oil Estimator — SQL Server 2025 schema
-- Step 2 of 2: create the tables. Idempotent — safe to re-run.
--
-- Run inside the target database:
--   sqlcmd -S <server> -d MidnightOilEstimator -i sql\create_tables.sql
--
-- Design notes:
--   * Relational tables everywhere the shape is fixed (users, projects,
--     elements, quotes, reference/cost data, supplier price breaks).
--   * Native JSON columns (SQL Server 2025) only where the payload is a
--     deeply nested, schema-fluid blob owned by the frontend:
--       - quotes.scenarios / universal / params / breakdown
--       - history.snapshot (point-in-time audit copy of a project/quote)
--   * All ids are IDENTITY integers, exposed to the API as strings.
--   * Timestamps are DATETIME2(3) stored in UTC.
-- ============================================================================

-- ────────────────────────────── users ──────────────────────────────
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        user_id       INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        username      NVARCHAR(256)      NOT NULL,
        password_hash NVARCHAR(512)      NOT NULL,
        role          NVARCHAR(20)       NOT NULL CONSTRAINT DF_users_role DEFAULT N'user',
        is_active     BIT                NOT NULL CONSTRAINT DF_users_is_active DEFAULT 1,
        created_at    DATETIME2(3)       NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_users_username UNIQUE (username),
        CONSTRAINT CK_users_role CHECK (role IN (N'admin', N'user'))
    );
END;
GO

-- Upgrade path: add role to users tables created before roles existed. Existing
-- accounts default to 'user' — promote the first admin manually after migrating:
--   UPDATE dbo.users SET role = 'admin' WHERE username = '<you>';
IF COL_LENGTH(N'dbo.users', N'role') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD role NVARCHAR(20) NOT NULL CONSTRAINT DF_users_role DEFAULT N'user' WITH VALUES;
    -- EXEC defers compilation to runtime so this sees the column ADD TABLE just committed above —
    -- referencing it directly here would fail since the whole batch is bound together at compile time.
    EXEC('ALTER TABLE dbo.users ADD CONSTRAINT CK_users_role CHECK (role IN (N''admin'', N''user''))');
END;
GO

-- Upgrade path: deactivated accounts can no longer sign in, but their projects/quotes stay.
IF COL_LENGTH(N'dbo.users', N'is_active') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD is_active BIT NOT NULL CONSTRAINT DF_users_is_active DEFAULT 1 WITH VALUES;
END;
GO

-- ───────────────────────────── projects ────────────────────────────
IF OBJECT_ID(N'dbo.projects', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.projects (
        project_id     BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_projects PRIMARY KEY,
        owner          NVARCHAR(256)         NOT NULL,
        schema_version INT                   NOT NULL CONSTRAINT DF_projects_schema_version DEFAULT 1,
        project_name   NVARCHAR(512)         NOT NULL,
        num_standees   INT                   NOT NULL,
        standee_counts JSON                  NOT NULL CONSTRAINT DF_projects_standee_counts DEFAULT N'[]',
        standee_type   NVARCHAR(16)          NOT NULL,
        short_id       NVARCHAR(16)          NULL,  -- sequential estimate ID shown in the UI (10100, 10101, …); backfilled on read if NULL
        include_print_sides BIT             NOT NULL CONSTRAINT DF_projects_include_print_sides DEFAULT 0,
        created_at     DATETIME2(3)          NOT NULL CONSTRAINT DF_projects_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_projects_owner FOREIGN KEY (owner) REFERENCES dbo.users (username),
        CONSTRAINT CK_projects_standee_type CHECK (standee_type IN (N'Simple', N'Moderate', N'Complex'))
    );

    CREATE INDEX IX_projects_owner ON dbo.projects (owner, project_id DESC);
END;
GO

-- Upgrade path: projects originally stored one quote quantity in num_standees.
-- Keep that scalar as the primary/legacy quantity and store the new five-value
-- quote quantity set separately.
IF COL_LENGTH(N'dbo.projects', N'standee_counts') IS NULL
BEGIN
    ALTER TABLE dbo.projects ADD standee_counts JSON NOT NULL
        CONSTRAINT DF_projects_standee_counts DEFAULT N'[]' WITH VALUES;
END;
GO

-- Upgrade path: short_id was CHAR(8) in the hash-ID era; widen it for sequential estimate IDs.
IF EXISTS (
    SELECT 1 FROM sys.columns c
    JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.projects') AND c.name = N'short_id' AND t.name = N'char'
)
BEGIN
    ALTER TABLE dbo.projects ALTER COLUMN short_id NVARCHAR(16) NULL;
END;
GO

-- Upgrade path: adds an extra print form (standee-type complexity) to account for double-sided printing.
IF COL_LENGTH(N'dbo.projects', N'include_print_sides') IS NULL
BEGIN
    ALTER TABLE dbo.projects ADD include_print_sides BIT NOT NULL CONSTRAINT DF_projects_include_print_sides DEFAULT 0 WITH VALUES;
END;
GO

-- ────────────────────────── project_elements ───────────────────────
IF OBJECT_ID(N'dbo.project_elements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.project_elements (
        project_element_id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_project_elements PRIMARY KEY,
        project_id         BIGINT                NOT NULL,
        position           INT                   NOT NULL,  -- preserves element order within the project
        name               NVARCHAR(512)         NOT NULL CONSTRAINT DF_project_elements_name DEFAULT N'',
        length             FLOAT                 NOT NULL,  -- inches
        width              FLOAT                 NOT NULL,  -- inches
        linear_inches      FLOAT                 NULL,
        complexity         NVARCHAR(16)          NOT NULL,
        description        NVARCHAR(MAX)         NOT NULL CONSTRAINT DF_project_elements_description DEFAULT N'',
        mask_b64           NVARCHAR(MAX)         NULL,      -- base64 JPEG highlight from the vision pipeline
        CONSTRAINT FK_project_elements_project FOREIGN KEY (project_id)
            REFERENCES dbo.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT CK_project_elements_complexity CHECK (complexity IN (N'Simple', N'Moderate', N'Complex'))
    );

    CREATE INDEX IX_project_elements_project ON dbo.project_elements (project_id, position);
END;
GO

-- ────────────────────────────── quotes ─────────────────────────────
IF OBJECT_ID(N'dbo.quotes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quotes (
        quote_id            BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_quotes PRIMARY KEY,
        project_id          BIGINT                NOT NULL,
        owner               NVARCHAR(256)         NOT NULL,
        schema_version      INT                   NOT NULL CONSTRAINT DF_quotes_schema_version DEFAULT 2,
        quote_name          NVARCHAR(512)         NOT NULL,
        -- Active scenario tab when saved. Scenario 2 is no longer offered in the UI, but the
        -- range stays 1–5 so quotes saved on it before it was retired still load and migrate.
        scenario            INT                   NOT NULL,
        num_standees        INT                   NOT NULL,
        contribution_margin FLOAT                 NOT NULL CONSTRAINT DF_quotes_contribution_margin DEFAULT 0,
        standee_type        NVARCHAR(16)          NOT NULL,
        -- Fingerprint of the data-collector cost tables when engine defaults were last
        -- refreshed; NULL until stamped. Used for stale-estimate detection in the UI.
        cost_tables_version NVARCHAR(64)          NULL,
        -- Frontend-owned nested state; see backend/lib/persisted_quote.py for shapes.
        quantity_variants   JSON                  NOT NULL CONSTRAINT DF_quotes_quantity_variants DEFAULT N'{}',
        scenarios           JSON                  NOT NULL CONSTRAINT DF_quotes_scenarios DEFAULT N'{}',
        universal           JSON                  NOT NULL CONSTRAINT DF_quotes_universal DEFAULT N'{}',
        params              JSON                  NOT NULL CONSTRAINT DF_quotes_params DEFAULT N'{}',
        breakdown           JSON                  NOT NULL CONSTRAINT DF_quotes_breakdown DEFAULT N'{}',  -- legacy v1 blob
        created_at          DATETIME2(3)          NOT NULL CONSTRAINT DF_quotes_created_at DEFAULT SYSUTCDATETIME(),
        updated_at          DATETIME2(3)          NOT NULL CONSTRAINT DF_quotes_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_quotes_project FOREIGN KEY (project_id)
            REFERENCES dbo.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT FK_quotes_owner FOREIGN KEY (owner) REFERENCES dbo.users (username),
        CONSTRAINT CK_quotes_scenario CHECK (scenario BETWEEN 1 AND 5),
        CONSTRAINT CK_quotes_standee_type CHECK (standee_type IN (N'Simple', N'Moderate', N'Complex'))
    );

    CREATE INDEX IX_quotes_project ON dbo.quotes (project_id, quote_id DESC);
    CREATE INDEX IX_quotes_owner ON dbo.quotes (owner, quote_id DESC);
END;
GO

-- Upgrade path: each quantity variant owns an independent scenarios/universal/params
-- snapshot. Legacy quote columns remain as a fallback for old rows and clients.
IF COL_LENGTH(N'dbo.quotes', N'quantity_variants') IS NULL
BEGIN
    ALTER TABLE dbo.quotes ADD quantity_variants JSON NOT NULL
        CONSTRAINT DF_quotes_quantity_variants DEFAULT N'{}' WITH VALUES;
END;
GO

-- Upgrade path: add the stale-estimate fingerprint column to quotes tables created
-- before it existed. The backend backfills the values on connect.
IF COL_LENGTH(N'dbo.quotes', N'cost_tables_version') IS NULL
BEGIN
    ALTER TABLE dbo.quotes ADD cost_tables_version NVARCHAR(64) NULL;
END;
GO

-- ───────────────────────────── counters ────────────────────────────
-- Named sequence counters. Row 'project_short_id' holds the last allocated
-- estimate ID (10100, 10101, …); seeded/reminted by the backend on connect.
IF OBJECT_ID(N'dbo.counters', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.counters (
        counter_id NVARCHAR(64) NOT NULL CONSTRAINT PK_counters PRIMARY KEY,
        seq        BIGINT       NOT NULL
    );
END;
GO

-- ─────────────────────────── quote_elements ────────────────────────
IF OBJECT_ID(N'dbo.quote_elements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quote_elements (
        quote_element_id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_quote_elements PRIMARY KEY,
        quote_id         BIGINT                NOT NULL,
        position         INT                   NOT NULL,
        name             NVARCHAR(512)         NOT NULL CONSTRAINT DF_quote_elements_name DEFAULT N'',
        length           FLOAT                 NOT NULL,
        width            FLOAT                 NOT NULL,
        linear_inches    FLOAT                 NULL,
        complexity       NVARCHAR(16)          NOT NULL,
        description      NVARCHAR(MAX)         NOT NULL CONSTRAINT DF_quote_elements_description DEFAULT N'',
        mask_b64         NVARCHAR(MAX)         NULL,
        CONSTRAINT FK_quote_elements_quote FOREIGN KEY (quote_id)
            REFERENCES dbo.quotes (quote_id) ON DELETE CASCADE,
        CONSTRAINT CK_quote_elements_complexity CHECK (complexity IN (N'Simple', N'Moderate', N'Complex'))
    );

    CREATE INDEX IX_quote_elements_quote ON dbo.quote_elements (quote_id, position);
END;
GO

-- ───────────────────────────── quote_notes ─────────────────────────
-- Notes attached to a quote. Author and timestamp are stored as first-class
-- columns; authors may edit the body or delete their own notes.
IF OBJECT_ID(N'dbo.quote_notes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quote_notes (
        note_id    BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_quote_notes PRIMARY KEY,
        quote_id   BIGINT                NOT NULL,
        author     NVARCHAR(256)         NOT NULL,
        body       NVARCHAR(2000)        NOT NULL,
        created_at DATETIME2(3)          NOT NULL CONSTRAINT DF_quote_notes_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_quote_notes_quote FOREIGN KEY (quote_id)
            REFERENCES dbo.quotes (quote_id) ON DELETE CASCADE,
        CONSTRAINT FK_quote_notes_author FOREIGN KEY (author) REFERENCES dbo.users (username),
        CONSTRAINT CK_quote_notes_body CHECK (LEN(LTRIM(RTRIM(body))) > 0)
    );

    CREATE INDEX IX_quote_notes_quote
        ON dbo.quote_notes (quote_id, created_at ASC, note_id ASC);
END;
GO

-- ────────────────────────────── history ────────────────────────────
-- Append-only audit trail of project/quote edits. ``snapshot`` is the full
-- point-in-time copy of the editable fields (including elements) and is what
-- gets restored on revert, so it stays a JSON document rather than rows.
IF OBJECT_ID(N'dbo.history', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.history (
        history_id               BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_history PRIMARY KEY,
        project_id               BIGINT                NOT NULL,
        owner                    NVARCHAR(256)         NOT NULL,
        entity_type              NVARCHAR(16)          NOT NULL,
        -- Intentionally no FK: audit rows outlive quote deletion, and an FK here
        -- would also create multiple cascade paths (history→projects, quotes→projects).
        quote_id                 BIGINT                NULL,
        scenario                 INT                   NULL,
        change_type              NVARCHAR(32)          NOT NULL,  -- create / update / rename / revert
        changed_by               NVARCHAR(256)         NOT NULL,
        label                    NVARCHAR(512)         NOT NULL,
        snapshot                 JSON                  NOT NULL,
        reverted_from_history_id BIGINT                NULL,
        created_at               DATETIME2(3)          NOT NULL CONSTRAINT DF_history_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_history_project FOREIGN KEY (project_id)
            REFERENCES dbo.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT CK_history_entity_type CHECK (entity_type IN (N'project', N'quote'))
    );

    CREATE INDEX IX_history_project_created ON dbo.history (project_id, created_at DESC, history_id DESC);
    -- Covers the "newest entry for this one entity" lookup that _record_history does on
    -- every non-create/revert write to skip no-op saves (see backend/lib/classes/db.py).
    CREATE INDEX IX_history_entity_latest
        ON dbo.history (project_id, entity_type, quote_id, created_at DESC, history_id DESC);
END;
GO

-- Added after the initial schema: existing databases created before the no-op-save
-- history skip landed only have IX_history_project_created.
IF OBJECT_ID(N'dbo.history', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_history_entity_latest'
                                               AND object_id = OBJECT_ID(N'dbo.history'))
BEGIN
    CREATE INDEX IX_history_entity_latest
        ON dbo.history (project_id, entity_type, quote_id, created_at DESC, history_id DESC);
END;
GO

-- ──────────────────────────── unit_costs ───────────────────────────
IF OBJECT_ID(N'dbo.unit_costs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.unit_costs (
        unit_cost_id    INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_unit_costs PRIMARY KEY,
        name            NVARCHAR(128)      NOT NULL,
        [type]          NVARCHAR(64)       NOT NULL,
        display_name    NVARCHAR(256)      NOT NULL,
        cost            FLOAT              NOT NULL,
        unit            NVARCHAR(32)       NOT NULL,  -- each / hour / thousand / linear_inch / linear_foot
        -- Machine-only fields (NULL for non-machines):
        setup_time      FLOAT              NULL,
        throughput      FLOAT              NULL,
        throughput_unit NVARCHAR(32)       NULL,
        last_updated    DATETIME2(3)       NOT NULL CONSTRAINT DF_unit_costs_last_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_unit_costs_name UNIQUE (name)
    );
END;
GO

-- ─────────────────────── standee_static_costs ──────────────────────
IF OBJECT_ID(N'dbo.standee_static_costs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.standee_static_costs (
        standee_static_cost_id                         INT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_standee_static_costs PRIMARY KEY,
        standee_type                                   NVARCHAR(64) NOT NULL,  -- e.g. 'Simple Standee'
        engineering_design_cost_per_project            FLOAT NOT NULL CONSTRAINT DF_ssc_eng_design DEFAULT 0,
        instruction_sheet_engineering_cost_per_project FLOAT NOT NULL CONSTRAINT DF_ssc_is_eng DEFAULT 0,
        hardware_cost                                  FLOAT NOT NULL CONSTRAINT DF_ssc_hardware DEFAULT 0,
        zund_print_form_minutes                        FLOAT NOT NULL CONSTRAINT DF_ssc_zund_print DEFAULT 0,
        zund_blank_form_minutes                        FLOAT NOT NULL CONSTRAINT DF_ssc_zund_blank DEFAULT 0,
        instruction_sheet_total_cost                   FLOAT NOT NULL CONSTRAINT DF_ssc_is_total DEFAULT 0,
        cutting_die_inches_multiplier                  FLOAT NOT NULL CONSTRAINT DF_ssc_die_mult DEFAULT 1,
        kitting_and_assembly                           FLOAT NOT NULL CONSTRAINT DF_ssc_kitting DEFAULT 0,
        cutting_die_blank_form_min                     FLOAT NOT NULL CONSTRAINT DF_ssc_die_blank DEFAULT 0,
        cutting_die_print_form_min                     FLOAT NOT NULL CONSTRAINT DF_ssc_die_print DEFAULT 0,
        CONSTRAINT UQ_standee_static_costs_type UNIQUE (standee_type)
    );
END;
GO

-- ───────────────────────── print_blank_ratio ───────────────────────
IF OBJECT_ID(N'dbo.print_blank_ratio', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.print_blank_ratio (
        print_forms INT   NOT NULL CONSTRAINT PK_print_blank_ratio PRIMARY KEY,
        blank_forms FLOAT NOT NULL
    );
END;
GO

-- ─────────────────────────────── overs ─────────────────────────────
IF OBJECT_ID(N'dbo.overs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.overs (
        overs_id     INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_overs PRIMARY KEY,
        lower_bound  INT                NOT NULL,
        upper_bound  INT                NULL,  -- NULL = open-ended top tier
        overs        INT                NOT NULL,
        last_updated DATETIME2(3)       NOT NULL CONSTRAINT DF_overs_last_updated DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- ────────────────────────────── packout ────────────────────────────
IF OBJECT_ID(N'dbo.packout', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.packout (
        packout_id           INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_packout PRIMARY KEY,
        standees_lower_bound INT                NOT NULL,
        standees_upper_bound INT                NULL,  -- NULL = open-ended
        complexity            NVARCHAR(32)       NOT NULL,
        packout               FLOAT              NOT NULL,
        last_updated          DATETIME2(3)       NOT NULL CONSTRAINT DF_packout_last_updated DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_packout_bounds ON dbo.packout (standees_lower_bound);
END;
GO

-- Upgrade path: packout tiers used to also key on a forms range; that dimension was
-- dropped — packout now varies only by standee count and complexity.
IF COL_LENGTH(N'dbo.packout', N'forms_lower_bound') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_packout_bounds' AND object_id = OBJECT_ID(N'dbo.packout'))
        DROP INDEX IX_packout_bounds ON dbo.packout;
    ALTER TABLE dbo.packout DROP COLUMN forms_lower_bound, forms_upper_bound;
    CREATE INDEX IX_packout_bounds ON dbo.packout (standees_lower_bound);
END;
GO

-- ──────────────────────── supplier_materials ───────────────────────
IF OBJECT_ID(N'dbo.supplier_materials', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.supplier_materials (
        supplier_material_id  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_supplier_materials PRIMARY KEY,
        supplier              NVARCHAR(128) NOT NULL,
        material              NVARCHAR(128) NOT NULL,
        material_display_name NVARCHAR(256) NOT NULL,
        material_type         NVARCHAR(64)  NOT NULL CONSTRAINT DF_supplier_materials_type DEFAULT N'',  -- '' = untyped
        unit                  NVARCHAR(32)  NOT NULL,
        -- Precomputed power-law fit (cost ≈ a * amount^b + c) over the price breaks:
        curve_a               FLOAT         NULL,
        curve_b               FLOAT         NULL,
        curve_c               FLOAT         NULL,
        curve_r_squared       FLOAT         NULL,
        last_updated          DATETIME2(3)  NOT NULL CONSTRAINT DF_supplier_materials_last_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_supplier_materials UNIQUE (supplier, material, material_type)
    );
END;
GO

-- ─────────────────────── supplier_price_breaks ─────────────────────
IF OBJECT_ID(N'dbo.supplier_price_breaks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.supplier_price_breaks (
        price_break_id       INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_supplier_price_breaks PRIMARY KEY,
        supplier_material_id INT   NOT NULL,
        amount               FLOAT NOT NULL,
        cost                 FLOAT NOT NULL,
        CONSTRAINT FK_supplier_price_breaks_material FOREIGN KEY (supplier_material_id)
            REFERENCES dbo.supplier_materials (supplier_material_id) ON DELETE CASCADE
    );

    CREATE INDEX IX_supplier_price_breaks_material ON dbo.supplier_price_breaks (supplier_material_id, amount);
END;
GO

-- ───────────────────────── data_collector_history ──────────────────
-- Append-only audit trail for edits made in the Data Collector UI (unit_costs,
-- overs, packout, suppliers). Unlike dbo.history this isn't tied to a project —
-- it just records what changed, who changed it, and when.
IF OBJECT_ID(N'dbo.data_collector_history', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.data_collector_history (
        dc_history_id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_data_collector_history PRIMARY KEY,
        table_name    NVARCHAR(32)  NOT NULL,  -- 'unit_costs' | 'overs' | 'packout' | 'suppliers'
        record_key    NVARCHAR(256) NOT NULL,  -- natural key of the edited row (see backend/lib/classes/db.py)
        record_label  NVARCHAR(256) NOT NULL,  -- human-readable label captured at write time
        change_type   NVARCHAR(16)  NOT NULL,  -- create / update / delete
        changed_by    NVARCHAR(256) NOT NULL,
        changes       JSON          NOT NULL,  -- {field: {old, new}, ...}
        created_at    DATETIME2(3)  NOT NULL CONSTRAINT DF_dc_history_created_at DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_dc_history_table_key ON dbo.data_collector_history (table_name, record_key, created_at DESC, dc_history_id DESC);
END;
GO
