-- ============================================================================
-- Midnight Oil Estimator — SQL Server 2025
-- Step 1 of 2: create the database.
--
-- Run with:  sqlcmd -S <server> -i sql\create_database.sql
-- Then run:  sqlcmd -S <server> -d MidnightOilEstimator -i sql\create_tables.sql
--
-- NOTE: the database name below matches the backend default
-- (SQLSERVER_DATABASE env var). If you rename it here, set
-- SQLSERVER_DATABASE in backend/.env to match.
-- ============================================================================

IF DB_ID(N'MidnightOilEstimator') IS NULL
BEGIN
    CREATE DATABASE [MidnightOilEstimator];
END;
GO
