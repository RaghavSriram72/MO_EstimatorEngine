# Project Name

Midnight Oil Estimator Engine

---

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.9+)
- [pip](https://pip.pypa.io/en/stable/)

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
python -m venv venv
```

Activate the virtual environment:

```bash
# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI development server:

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.
Interactive API docs are available at `http://localhost:8000/docs`.

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


