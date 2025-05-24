# BetterSurf Internet-Provider Comparison
[![Python Version](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-%5E0.115.12-brightgreen.svg)](https://fastapi.tiangolo.com/)

---

## 📖 Table of Contents

1. [About](#about)  
2. [Features](#features)  
3. [Prerequisites](#prerequisites)  
4. [Getting Started](#getting-started)  
   - [Clone the Repo](#clone-the-repo)  
   - [Install Dependencies](#install-dependencies)  
   - [Configuration](#configuration)  
   - [Run Locally](#run-locally)  
5. [Dockerized Deployment](#dockerized-deployment)  
6. [API Reference](#api-reference)  
   - [Health Check](#health-check)  
   - [HTTP Compare](#http-compare)  
   - [WebSocket Compare](#websocket-compare)  
7. [CORS & HTTPS](#cors--https)  
   - [CORS Settings](#cors-settings)  
   - [HTTPS with ngrok](#https-with-ngrok)  

---

## 📌 About

**BetterSurf** is a FastAPI-based service that aggregates and compares internet-provider offers from multiple vendors.  
It exposes both REST and WebSocket endpoints and comes fully Dockerized for easy deployment.

---

## 🚀 Features

- 🔄 **HTTP & WebSocket** endpoints for real-time offer streaming  
- 🛡️ Health-check & graceful shutdown  
- 🔌 Circuit-breaker integration per provider  
- ☁️ CORS middleware preconfigured  
- 📜 Auto-generated OpenAPI docs (`/docs` & `/redoc`)  
- 🐳 Docker & Docker-Compose setup ready for production  
- ⚙️ Env-based settings with secure credential management  

---

## 🛠️ Prerequisites

- Python **3.12**  
- Docker & Docker-Compose (if using containers)  
- `ngrok` or equivalent (for HTTPS tunneling)  

---

## 🏁 Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/jaylann/gendev.git
cd bettersurf
````

### 2. Install Dependencies

We use **uv** for ultra-fast installs. Fallback to `pip` if you prefer:

```bash
# Using uv
uv pip install --system -r requirements.txt

# Or with pip
pip install --no-cache-dir -r requirements.txt
```

### 3. Configuration

1. Copy `.env.example` to `.env`

2. Fill in your API keys and credentials:

   ```dotenv
   # .env
   VERBYNDICH_API_KEY=YOUR_API_KEY_HERE
   SERVUSSPEED_USERNAME=YOUR_USERNAME_HERE
   SERVUSSPEED_PASSWORD=YOUR_PASSWORD_HERE
   PINGPERFECT_CLIENT_ID=YOUR_CLIENT_ID_HERE
   PINGPERFECT_SECRET=YOUR_SECRET_HERE
   WEBWUNDER_API_KEY=YOUR_API_KEY_HERE
   BYTEME_API_KEY=YOUR_API_KEY_HERE
   ```

3. (Optional) Override any service endpoints if needed.

### 4. Run Locally

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

* **Docs**:  [http://localhost:8000/docs](http://localhost:8000/docs)
* **Redoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🐳 Dockerized Deployment

Build and run with Docker Compose:

```bash
docker-compose up --build -d
```

* The FastAPI app listens on `8000` internally.
* Nginx proxies HTTP (`/`) and WebSocket (`/ws/`) traffic on port `80`.
* Built-in health-check ensures the app is ready before Nginx routes traffic.

---

## 📚 API Reference

Refer to the [OpenAPI docs](http://localhost:8000/docs) for full schema.

---

## 🔒 CORS & HTTPS

### CORS Settings

By default, CORS is wide open for development:

```python
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["GET","POST","OPTIONS"],
  allow_headers=["*"],
)
```

> **⚠️ Production:** Restrict `allow_origins` and `allow_methods` to your front-end domains.

### HTTPS with ngrok

To expose your local server over HTTPS for testing:

1. Install [ngrok](https://ngrok.com/).

2. Start your FastAPI app on port 8000.

3. In a new terminal, run:

   ```bash
   ngrok http 8000
   ```

4. Copy the generated `https://…ngrok.io` URL and use it to call your API endpoints securely.

---

Made with ❤️ by Justin Lanfermann