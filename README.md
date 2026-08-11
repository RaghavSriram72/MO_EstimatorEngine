# Midnight Oil Estimator Engine

A cost estimator engine that utilizes bin packing and regression to estimate costs based on user provided data in a quick and efficient manner.

---

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.9+)
- [pip](https://pip.pypa.io/en/stable/)
- [uv] (https://docs.astral.sh/uv/getting-started/)

---

## Project Structure

```
.
├── frontend/   # Next.js application
└── backend/    # FastAPI application
```

---

## Getting Started

### 1. Backend (FastAPI)

Navigate to the `backend` folder and set up a virtual environment:

```bash
cd backend
uv venv
```

Activate the virtual environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows
venv\Scripts\activate
```

Install dependencies:

```bash
uv sync
```

Start the FastAPI development server:

```bash
uvicorn main:app --reload --host X.X.X.X --port XXXX # last two are optional
```

The API will be available at `API_BASE` as inputted into the .env file.
Interactive API docs are available at `API_BASE/docs`.

---

### 2. Frontend (Next.js)

Open a new terminal, navigate to the `frontend` folder, and install dependencies:

```bash
cd frontend
npm install
```

Start the Next.js development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

---

## Database Setup (SQL Server 2025)

Create the database and tables (SSMS or `sqlcmd`):

```bash
sqlcmd -S <server> -i sql\create_database.sql
sqlcmd -S localhost -C -i sql\create_database.sql
```

```bash
sqlcmd -S <server> -d MidnightOilEstimator -i sql\create_tables.sql
sqlcmd -S localhost -d MidnightOilEstimator -C -i sql\create_tables.sql

```

Both scripts are idempotent — re-running them is safe and will add anything missing.

Then load the existing data (users, projects, quotes, history, and the reference/cost
tables) from the MongoDB exports in `MONGO_database\`. Pick one of the two variants:

```bash
sqlcmd -S <server> -d MidnightOilEstimator -i sql\migrate_mongo.sql
sqlcmd -S localhost -d MidnightOilEstimator -C -i sql\migrate_mongo.sql
```

reads the `.json` files off disk — edit `@MongoDir` near the top of the script first, and
note the SQL Server service account needs read access to that folder. If it can't reach the
folder (or you lack `ADMINISTER BULK OPERATIONS`), use the self-contained variant instead:

```bash
sqlcmd -S <server> -d MidnightOilEstimator -i sql\migrate_mongo_data.sql
sqlcmd -S localhost -d MidnightOilEstimator -C -i sql\migrate_mongo_data.sql
```

which embeds the same export as literals and needs no filesystem access. Both are idempotent
and record what they loaded in `dbo.migration_mongo_map` — don't drop that table, or a
re-run will duplicate every migrated record.

---

## Environment Variables

In the `backend` folder create a `.env` file and add the following lines:
```md
SQLSERVER_HOST=localhost
SQLSERVER_DATABASE=MidnightOilEstimator
# For SQL authentication (omit both to use Windows integrated auth):
SQLSERVER_USER=<username>
SQLSERVER_PASSWORD=<password>
# Optional overrides:
# SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server
# SQLSERVER_CONN_STR=<full ODBC connection string; overrides everything above>
```

In the `frontend` folder create a `.env.local` file and add the following lines:
```md
API_URL=http://<host>:<port> # host and port as specified above. Defaults to `localhost` and `8000` respectively
```
