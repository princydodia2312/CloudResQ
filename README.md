🌪️ CloudResQ — Intelligent Disaster Response System

A real-time, cloud-native disaster response platform designed to enable rapid incident reporting, multi-role coordination, and efficient emergency handling using modern web and distributed system principles.

🎯 Key Features

⚡ Real-time incident reporting
📡 Live updates across multiple roles (Public / Authority / Rescue)
📍 Geolocation-based reporting and tracking
🧠 Scalable, stateless backend architecture
🔐 Role-based access control via secure headers
🐳 Fully containerized deployment using Docker
☁️ Cloud-ready architecture (AWS services integration)

🏗️ System Architecture

User (Browser)
      │
      ▼
Frontend (React + Vite)
      │
      ▼
Nginx (Docker Container)
      │
      ▼
Backend API (Flask + Gunicorn)
      │
      ├── DynamoDB (Reports & Rate Limiting)
      ├── S3 (Media Storage)
      └── API Gateway WebSocket (Real-time updates)
      
⚙️ Tech Stack

Layer	Technology	Purpose

Frontend	React + Vite	Multi-role UI
Backend	Flask + Gunicorn	REST API
Real-Time	AWS API Gateway WebSockets + Lambda	Live communication
Database	DynamoDB	Scalable NoSQL storage
Storage	AWS S3	Image/video storage
Auth	bcrypt + Role Tokens	Lightweight security
DevOps	Docker + Docker Compose	Containerized deployment
Web Server	Nginx (Alpine)	Static serving + routing

🚀 Local Setup (One Command)

Prerequisites
Docker installed
Git installed
Run the project
git clone <your-repo-url>
cd ResQNet
docker-compose up --build

Access the apps

Service	URL
Public App	http://localhost:3000

Authority App	http://localhost:3001

Rescue App	http://localhost:3002

Backend API	http://localhost:5000/api/health

📡 API Overview

Method	Endpoint	Description

GET	/api/health	System health
POST	/api/reports	Submit incident
GET	/api/reports	Fetch reports
PATCH	/api/reports/:id/status	Update status
GET	/api/stats	Dashboard metrics

🔐 Authentication Model

The system uses a lightweight role-based access control mechanism:

Requests include X-Role-Token header
Tokens are validated using bcrypt hashing
Ensures secure access without session overhead

⚡ Real-Time Communication

Implemented using WebSockets (API Gateway + Lambda)
Stores active connections in DynamoDB

Enables:
Instant report updates
Live dashboards
Multi-user synchronization

📈 Scalability Design
Horizontal Scaling
Stateless backend (no session storage)
Data stored in DynamoDB/S3
Any instance can handle any request
Vertical Scaling
EC2 instance upgrades supported
Container-based architecture for easy replication

🧠 System Design Highlights
Microservices-inspired architecture
Event-driven communication
Cloud-native storage
Containerized deployment
Separation of concerns (frontend / backend / infra)

📁 Project Structure

ResQNet/
├── backend/
├── frontend-public/
├── frontend-authority/
├── frontend-rescue/
├── docker-compose.yml
└── README.md
⚠️ Note on GPS Feature

Geolocation works only in secure environments:

✅ Works on localhost
❌ Blocked on HTTP (EC2 public IP)
✅ Requires HTTPS (production setup)

🚀 Future Improvements

HTTPS setup using Cloudflare / Nginx
Load balancer + auto-scaling
JWT-based authentication
Map integration (live tracking)
Notification system enhancements

⭐ Final Note

This project demonstrates:

Real-world system design
Cloud-native thinking
Scalable architecture
Production-level deployment practices
