# WasteSmart Backend (Phase 1 — Foundation)

Modular Python Flask + MySQL backend foundation for **WasteSmart – Smart Urban Waste Management System**.

## Phase 1 Scope
- Flask application factory (`app.create_app`)
- Environment-based configuration (`development`, `testing`, `production`)
- SQLAlchemy + PyMySQL configuration for MySQL
- Flask-Migrate initialization (`flask db ...`)
- Strict development CORS policy (`http://localhost:3000`)
- Live database health check endpoint (`GET /api/health`)

> **Note:** Database models/tables, authentication, complaint APIs, and AI module integration are intentionally deferred to subsequent phases.

---

## Folder Structure

```text
backend/
├── app/
│   ├── __init__.py          # Flask application factory & JSON error handlers
│   ├── config.py            # Environment config & MySQL URI builder
│   ├── extensions.py        # Unbound SQLAlchemy, Migrate, and CORS instances
│   └── routes/
│       ├── __init__.py      # Routes package marker
│       └── health.py        # GET /api/health endpoint
├── .env.example             # Environment variable template
├── .gitignore               # Ignores .venv, __pycache__, .env, logs
├── README.md                # Setup & run instructions
├── requirements.txt         # Phase 1 Python dependencies
└── run.py                   # Application entrypoint
```

---

## Windows PowerShell Setup

### 1. Create MySQL Database (if not already created)
Run in MySQL client (`mysql -u root -p`):
```sql
CREATE DATABASE IF NOT EXISTS wastesmart_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Create & Activate Virtual Environment (Isolated inside `backend/`)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

*(If PowerShell blocks script activation, run once for your current user:)*
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3. Install Dependencies
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables
```powershell
Copy-Item .env.example .env
```
Open `backend\.env` and fill in:
- `SECRET_KEY` (generate a strong random string, e.g. `python -c "import secrets; print(secrets.token_hex(32))"`)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (or `DATABASE_URL`)

### 5. Initialize Flask-Migrate Folder (Optional in Phase 1, ready for Phase 2 models)
```powershell
flask --app run.py db init
```

### 6. Start the Flask Development Server
```powershell
python run.py
```
The server starts at `http://127.0.0.1:5000`.

### 7. Verify `GET /api/health`
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health" -Method Get
```
- **When MySQL is reachable (`200 OK`):**
  ```json
  {
    "status": "ok",
    "service": "wastesmart-backend",
    "database": "connected",
    "timestamp": "2026-11-25T03:52:00+00:00"
  }
  ```
- **When MySQL is unreachable (`503 Service Unavailable`):**
  ```json
  {
    "status": "degraded",
    "service": "wastesmart-backend",
    "database": "disconnected",
    "error": "Database connectivity check failed.",
    "detail": "OperationalError",
    "timestamp": "2026-11-25T03:52:00+00:00"
  }
  ```
