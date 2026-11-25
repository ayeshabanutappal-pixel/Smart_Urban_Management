# WasteSmart – Smart Urban Waste Detection and Management System

### AI-Powered Waste Identification and Intelligent Municipal Coordination

WasteSmart is an AI-powered smart city waste management platform designed to improve urban sanitation through intelligent waste identification, citizen complaint reporting, location-based tracking, and municipal coordination.

The platform connects citizens, field sanitation workers, and municipal administrators through a unified system to support efficient waste reporting, monitoring, and management.

## Project Overview

Urban waste management faces challenges such as improper garbage disposal, delayed complaint resolution, inefficient worker coordination, and limited real-time monitoring.

WasteSmart addresses these challenges through a centralized digital platform that combines computer vision, geolocation, complaint management, and administrative analytics.

The system aims to make waste reporting easier for citizens, improve coordination among sanitation teams, and provide municipal administrators with better visibility into waste management activities.

## Key Features

### 1. AI-Based Waste Detection
- Upload waste images for automated object identification.
- Uses YOLOv8 and OpenCV for computer vision.
- Identifies supported objects and displays detection results.
- Generates annotated images with bounding boxes and confidence scores.

### 2. Citizen Complaint Management
- Citizen registration and login.
- Report garbage-related issues.
- Submit complaint details and location information.
- Track complaint status and resolution progress.
- View previously submitted complaints.

### 3. Location-Based Waste Tracking
- Interactive map using Leaflet and React Leaflet.
- GPS-based complaint location support.
- Geocoding integration.
- Location-based visualization of reported waste issues.

### 4. Municipal Administration Dashboard
- Centralized dashboard for municipal administrators.
- View and manage citizen complaints.
- Monitor waste management activities.
- Access analytics and reports.
- Coordinate sanitation operations.

### 5. Field Worker Management
- Field worker registration and management.
- Assign workers to reported complaints.
- Worker portal and task management.
- Monitor worker activity and complaint resolution.

### 6. Analytics and Reporting
- Visual representation of waste management statistics.
- Complaint monitoring and status analysis.
- Dashboard charts and reports.
- CSV reporting support.

### 7. Notifications and User Management
- Role-based access for citizens, field workers, and administrators.
- User profile management.
- Notification management.
- Authentication using JSON Web Tokens (JWT).

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS |
| Build Tool | Vite |
| Backend | Python, Flask |
| Database | MySQL |
| ORM | Flask-SQLAlchemy |
| Database Driver | PyMySQL |
| Authentication | Flask-JWT-Extended |
| AI / Computer Vision | YOLOv8, OpenCV |
| AI Framework | Ultralytics |
| Maps | Leaflet, React Leaflet |
| Charts | Chart.js |
| API Communication | REST APIs |
| Version Control | Git and GitHub |

## System Architecture

The WasteSmart platform follows a modular architecture consisting of a frontend application, Flask backend, MySQL database, and AI detection service.

```text
                 WASTESMART PLATFORM
                         |
          +--------------+--------------+
          |              |              |
       CITIZEN       FIELD WORKER    MUNICIPAL ADMIN
          |              |              |
          +--------------+--------------+
                         |
                  REACT FRONTEND
                  React + TypeScript
                         |
                    REST APIs
                         |
                  FLASK BACKEND
                         |
          +--------------+--------------+
          |              |              |
      AUTHENTICATION  COMPLAINTS     WORKER
          |           MANAGEMENT    MANAGEMENT
          |              |              |
          +--------------+--------------+
                         |
                   MYSQL DATABASE
                         |
                  AI DETECTION SERVICE
                         |
                    YOLOv8 + OpenCV
                         |
                WASTE IDENTIFICATION
                         |
                RESULTS AND TRACKING
```

## Project Structure

```text
Smart_Urban_Management/
│
├── backend/
│   ├── app/
│   │   ├── models/          # Database models
│   │   ├── routes/          # Backend API routes
│   │   ├── utils/           # Utility functions
│   │   ├── config.py        # Application configuration
│   │   └── extensions.py    # Flask extensions
│   │
│   ├── ai_module/
│   │   └── ai/
│   │       ├── detector.py  # YOLO waste detection
│   │       └── README.md
│   │
│   ├── ai_service/
│   │   └── server.py       # AI sidecar service
│   │
│   ├── migrations/          # Database migrations
│   ├── tests/               # Backend tests
│   ├── requirements.txt
│   └── run.py
│
├── public/
│   └── assets/
│       └── images/
│
├── src/
│   ├── components/          # Reusable UI components
│   ├── data/                # Application seed data
│   ├── pages/               # Application pages
│   ├── services/            # API and geocoding services
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

## Installation and Setup

### Prerequisites

Install the following software before running the application:

- Node.js and npm
- Python 3.10 or later
- MySQL Server
- Git
- Visual Studio Code (recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/ayeshabanutappal-pixel/Smart_Urban_Management.git
```

Navigate into the project directory:

```bash
cd Smart_Urban_Management
```

### 2. Frontend Setup

Install the frontend dependencies:

```bash
npm install
```

Create a local `.env` file using `.env.example` and configure the required environment variables.

Start the frontend development server:

```bash
npm run dev
```

Open the application in your browser:

```text
http://localhost:3000
```

### 3. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Create the backend environment file:

```powershell
Copy-Item .env.example .env
```

Configure the MySQL connection details, Flask secret key, and JWT secret key in `backend/.env`.

### 4. Database Setup

Create the MySQL database:

```sql
CREATE DATABASE wastesmart_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Configure the database credentials in the backend environment file.

Initialize or apply the available database migrations:

```bash
flask --app run.py db upgrade
```

### 5. Start the Backend Server

From the backend directory:

```bash
python run.py
```

The Flask backend runs at:

```text
http://127.0.0.1:5000
```

Check backend and database connectivity:

```text
http://127.0.0.1:5000/api/health
```

### 6. AI Detection Service

The project also includes a separate AI sidecar service using YOLOv8 and OpenCV.

Install its dependencies using the AI module requirements:

```bash
pip install -r ai_module/ai/requirements.txt
```

From the project root, start the AI service:

```bash
python backend/ai_service/server.py
```

The AI sidecar is configured to run locally at:

```text
http://127.0.0.1:5001
```

The YOLO model weights must be available at the configured model path.

**Note:** The frontend, Flask backend, MySQL database, and AI service must be configured and running as required for their respective live features.

## API and Backend Modules

The Flask backend contains modules for:

- Authentication and user management.
- Complaint reporting and tracking.
- Dashboard statistics.
- Waste detection integration.
- Worker management and task assignment.
- Notifications.
- Geocoding.
- Database health monitoring.

## AI Model and Limitations

The current AI detection module uses YOLOv8 Nano (`yolov8n.pt`) with pre-trained MS COCO weights.

It can identify supported objects such as bottles, cups, and other recognizable objects.

**Current limitation:** The general-purpose COCO model is not specifically trained for all municipal waste categories. Loose garbage, decomposed waste, and certain types of wrappers may not be reliably identified.

Future development can include fine-tuning the model using specialized waste datasets such as TACO.

## Future Enhancements

- Custom AI model training for urban waste classification.
- Improved waste classification accuracy.
- Real-time municipal monitoring.
- Advanced geospatial analytics.
- Smart route optimization for sanitation workers.
- Integration with smart waste collection infrastructure.
- Scalable cloud deployment.
- Mobile application for citizens and sanitation workers.

## Project Information

**Project Name:** WasteSmart – Smart Urban Waste Detection and Management System

**Tagline:** AI-Powered Waste Identification and Intelligent Municipal Coordination

**Team Name:** Tech Avengers

**Hackathon:** PRASUNEX Innovathon 2026

**GitHub Repository:**  
https://github.com/ayeshabanutappal-pixel/Smart_Urban_Management

## Conclusion

WasteSmart aims to transform traditional urban waste management into a more intelligent, transparent, and coordinated process by combining AI-powered identification, digital complaint management, geolocation, and municipal coordination.

The project focuses on supporting cleaner cities through technology-driven sanitation management.

---

*WasteSmart – Building cleaner and smarter urban communities.*
