# GenDev7 Internet Provider Comparison

## 1. 🗺️ Project Overview & Live Demo

**BetterSurf: Real-Time Internet Provider Comparison** – This project is a full-stack web application allowing users to input an address and instantly compare internet offers from 5 different providers. It streams results live via **WebSocket**, ensuring a reliable UX despite API delays, and features robust error handling, advanced sorting/filtering, and sharing capabilities.

### 🚀 Live Demo

Explore *BetterSurf* live:

*   **Frontend Web App**: [Web App](https://gendev-web.vercel.app/)
*   **Backend API**: [API](https://d61c7czwgnmbn.cloudfront.net)
*   **API Documentation**: [API Docs](https://d61c7czwgnmbn.cloudfront.net/docs)

### 📁 Repository Structure

The frontend (**Next.js**) and backend (**FastAPI**) components were developed independently and unified into this repository using a git subtree merge. The root contains [`GenDevWeb`](./GenDevWeb) (frontend) and [`GenDevBackend`](./GenDevBackend) (backend), preserving clean commit histories and modularity.

### 🔧 Setup

For local setup, please follow the detailed instructions in the respective README files:

*   **Backend Setup**: [`GenDevBackend/README.md`](./GenDevBackend/README.md)
*   **Frontend Setup**: [`GenDevWeb/README.md`](./GenDevWeb/README.md)

---

## 2. ✅ Challenge Requirements Compliance

### 👍 Minimum Requirements Met:

*   ✅ **Robust API Failure Handling**: Utilizes **WebSockets** with a 2-phase timeout system, **Tenacity**-based retries (exponential backoff), and a per-provider circuit breaker pattern (see Section 4.2).
*   ✅ **Comprehensive Sorting & Filtering**: Implements five sorting algorithms (including a recommendation engine) and multi-criteria filtering (provider, speed, duration, connection, TV, youth discounts) (see Section 4.3).
*   ✅ **Advanced Share Link Feature**: Slug-based shareable links via **Redis** (24h TTL, configurable) for search results and individual offers, preserving query parameters.
*   ✅ **API Credentials Security**: Employs environment-based credential management (Pydantic `SecretStr`) ensuring keys are never exposed to the frontend or logs.

### ✨ Optional Features Implemented:

*   ✅ **Address Autocompletion**: Integrates **Google Places API**, secured with domain-restricted keys.
*   ✅ **Comprehensive Input Validation**: Strict **Pydantic** models (backend) and domain-specific address validation; user-friendly frontend validation.
*   ✅ **Persistent Session State**: Stores the 5 most recent searches in browser `localStorage`.

---

## 3. 🏗️ Architecture Overview

### 🏛️ System Architecture

A decoupled two-tier architecture: **Next.js** frontend and **FastAPI** backend.

*   **Frontend** (Vercel): Renders UI, establishes **WebSocket** connection to backend for live data.
*   **Backend** (AWS EC2): Orchestrates parallel calls to provider APIs, aggregates results, caches in **Redis**, and communicates via **WebSocket** & REST.
*   **Nginx** reverse proxy (fronted by **CloudFront**): Manages HTTP(S) and **WebSocket** upgrades for the backend.

This design ensures separation of concerns; the browser interacts only with the FastAPI API, and API keys are server-managed.

### 💻 Technology Stack

**Backend:**

*   **Framework/Language**: FastAPI (Python)
*   **Data Validation**: Pydantic
*   **HTTP Client**: httpx (asynchronous API calls)
*   **Retry Logic**: Tenacity (resilient external API calls)
*   **Logging**: Loguru
*   **Testing**: Pytest
*   **Containerization**: Docker & Docker Compose
*   **Caching & Sharing**: Redis
*   **Web Server/Proxy**: Gunicorn (with Uvicorn workers), Nginx

**Frontend:**

*   **Framework**: Next.js 15 (React 19, App Router)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS, ShadCN/UI
*   **Address Autocompletion**: Google Places API
*   **Code Quality**: ESLint, Prettier
*   **UI Enhancements**: Sonner (toast notifications), React Server Components, Suspense

---

## 4. ⭐ Core Features & Implementation

### 📡 4.1 Real-Time Provider Comparison

-   **WebSocket Implementation**: Dedicated WebSocket for asynchronous server-pushed offer updates, enabling near-instant frontend changes without polling.
-   **Intelligent Two-Phase Loading**:
    *   **Phase 1**: Queries all providers in parallel. Ends either when all providers except for ServusSpeed (historically the slowest) complete or after 10s, whichever comes first.
    *   **Phase 2**: If ServusSpeed (or other providers from Phase 1) are pending, system waits longer and sends second batch of data via WebSocket.
    *   *Bypass*: Direct results if only one provider is selected (higher timeout).
-   **Performance Benefits**:
    *   Faster providers' offers appear quickly (`INITIAL_OFFERS`).
    *   `FINAL_OFFERS` update sent once all providers respond/timeout.
    *   Ensures responsiveness even with slow APIs, improving perceived performance.

### 🛡️ 4.2 Advanced Error Handling & Resilience

#### 🔄 **Tenacity Retry Logic**

Each provider API call is wrapped with **Tenacity**:

-   **Attempts**: Up to 8 per provider.
-   **Backoff**: Exponential (0.1s, 0.2s...), capped at 1s interval.
-   **Conditions**: Custom `ProviderError` and `httpx.HTTPError`.
-   **Logging**: Each attempt and outcome logged.

#### ⚡ **Circuit Breaker Pattern**

A per-provider circuit breaker prevents failing providers from degrading performance:

-   **States**: **Closed** (normal), **Open** (5 consecutive failures, short-circuits for 5s cooldown), **Half-Open** (one test request post-cooldown).
-   **Resilience**: One misbehaving API doesn't stall the system.

#### 🧩 **Provider Pattern**

An abstract `ProviderBase` class standardizes error handling:

-   Incorporates Tenacity retry and circuit breaker logic via decorators on `__call__`.
-   Subclasses implement API-specific `fetch(address)` (decorated for circuit breaking), raising `ProviderError` for retryable issues.
-   Ensures uniform resilience across integrations.

### 📊 4.3 Intelligent Sorting & Filtering System

#### ↕️ **Sorting Options (Client-Side)**

-   **Recommended (Default)**: Algorithmic ranking (cost, promotions, speed, speed/€, connection type, features).
-   **Price (Low to High)**: Effective 24-month monthly price.
-   **Speed (High to Low)**: Download speed (Mbps).
-   **Contract Duration (Short to Long)**.
-   **Provider (A–Z)**.

#### 🔍 **Filter Categories (Client-Side)**

-   **Contract Durations**: Specific lengths (e.g., 1, 12, 24 months).
-   **Connection Types**: Multi-select (DSL, Fiber, Cable, Mobile).
-   **Minimum Speed**: Slider/input.
-   **TV Inclusion**: Toggle.
-   **Provider Selection**: Multi-select (can be sent to backend to limit queries).
-   **Youth Offers**: Toggle based on `max_age`.

All filters are combinable.

### 🔌 4.4 Provider Integration Details

Backend adapters normalize diverse provider APIs into a common `Offer` model:

-   **WebWunder (SOAP)**: `zeep` for WSDL interaction.
-   **ByteMe (REST/CSV)**: `pandas` for CSV processing, cleaning, and deduplication.
-   **PingPerfect (REST/JSON)**: HMAC-SHA256 authentication; supports "wantsFiber" flag.
-   **VerbynDich (Paginated REST)**: Concurrent page fetching (up to 10 parallel via `asyncio.Semaphore`).
-   **ServusSpeed (REST/Basic Auth)**: Two-step fetch (available products, then parallel detail requests within a time budget) to manage slowness.

Data is mapped to a unified `Offer` schema, enriching fields and normalizing types.

### ✔️ 4.5 Data Validation & Offer Processing

Raw provider data undergoes rigorous validation and normalization using Pydantic `Offer` models:

-   Ensures data integrity, type normalization (e.g., integer cents for currency), and consistent offer representation.
-   Handles mandatory fields, connection type normalization, cross-field validation (e.g., promotional periods), and automatic field setting (e.g., `tv_included` based on `tv_package_name`).
-   **Business Logic Validation**: Pricing and contract duration consistency, voucher normalization.
-   **Data Quality & Metadata**: Enriches offers with fields like `max_age` (youth offers), `installation_service_included`, `data_cap_gb`, and clear promotional period distinctions for accurate UI display and calculations.

### 🔗 4.6 Sharing System

Share results via short, secure links using encoded slugs and Redis:

-   **Slug Generation**: Short, URL-safe slug encodes a zlib-compressed, base64url-encoded JSON payload (search parameters, filters, timestamp).
-   **Redis Storage**: Actual offer list for a slug stored in Redis (key: slug, TTL: 24h).
-   **URL Structure**: Frontend uses clean URLs like `/{slug}`.
-   **Endpoints**: `GET /compare/{slug}` (retrieve), `POST /offers/share-link` (create for single offer).
-   **Client Integration**: Slugs sent via WebSocket; final offers slug updates browser URL.
-   **Security/Privacy**: Opaque slugs; address info within payload is inherent to comparison. Transient Redis storage.

### 💾 4.7 Search & Persistent State

-   Last 5 search queries (address, filters) stored client-side in browser **`localStorage`**.
-   "Recent Searches" dropdown for quick re-runs.
-   FIFO replacement when limit exceeded.

---

## 5. ☁️ Deployment & Infrastructure

### ⚙️ Backend Deployment (AWS EC2)

Dockerized application on AWS EC2 for consistency and resilience.

-   **Containerization**: **Docker** container; **Docker Compose** orchestrates FastAPI, Nginx, and Redis services for one-command deployment.
-   **Reverse Proxy (Nginx)**: Listens on port 80, forwards HTTP to FastAPI (Gunicorn on 8000), configured for **WebSocket** upgrades.
-   **SSL/Security & CDN (AWS CloudFront)**: Fronts the API endpoint, providing HTTPS, caching for static assets (e.g., OpenAPI docs), WebSocket forwarding, and DDoS protection.
-   **Health Monitoring**: FastAPI `GET /health` endpoint used by Docker Compose for internal health checks.
-   **Scalability**: **Gunicorn** runs FastAPI with multiple **Uvicorn** workers (default: 4, configurable). Horizontally scalable (stateless, shared Redis). Logs to `stdout`/`stderr` for Docker/CloudWatch.

### 🖥️ Frontend Deployment (Vercel)

Next.js frontend deployed on Vercel.

-   **Build & Deployment**: Optimized static/SSR bundle via Next.js build; Vercel handles CI/CD and global CDN serving.
-   **Environment Configuration**: Managed via Vercel platform variables (e.g., `NEXT_PUBLIC_API_URL`, domain-restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). No sensitive provider credentials on frontend.
-   **Performance**:
    *   Leverages Next.js/Vercel optimizations (code-splitting, CDN caching, optimized images/scripts).
    *   Strategic use of React Server Components & Suspense minimizes client-side bundles and provides graceful loading.
    *   Tailwind CSS (purged) ensures small CSS footprint.
    *   Fast FCP due to minimal blocking scripts and pre-rendering.

The architecture prioritizes robustness, security, and performance.

---

## 6. 📚 API Documentation

Comprehensive **OpenAPI 3.0 (Swagger UI)** and **ReDoc** documentation details all endpoints, models, and schemas.

➡️ **Explore the live [API Documentation](https://d61c7czwgnmbn.cloudfront.net/docs)**

### Key API Endpoints Overview:

#### 📡 WebSocket: `GET /ws/compare`

-   **Purpose**: Real-time internet provider comparison.
-   **Interaction**: Client sends JSON (address, filters). Server streams `INITIAL_OFFERS`, `FINAL_OFFERS`, `STATUS`, `ERROR` messages. (See `WsCompareAddressRequest`, `WsMessage` schemas).

#### 🌐 REST Endpoints

-   **`GET /health`**: Health check.
-   **`GET /compare/{slug}`**: Retrieve cached comparison by share slug.
-   **`POST /offers/share-link`**: Create share link for a single offer.
-   **`GET /docs`**: Swagger UI.
-   **`GET /redoc`**: ReDoc UI.

#### 🔑 Authentication

-   Public API (no end-user auth). Provider credentials server-side. CORS enabled.

*Consult the [full API documentation](https://d61c7czwgnmbn.cloudfront.net/docs) for details.*

---

## 7. 🧪 Testing Strategy

Comprehensive testing with **Pytest**.

-   **Unit Tests**: Isolate modules (data processing, provider integrations, validators). Simulate API responses (errors, edge cases) with Pytest fixtures and Hypothesis. Test `Offer` model validators.
-   **Integration Tests**: Validate end-to-end workflows (FastAPI `TestClient`). Key test (`test_comparison_service.py`) simulates WebSocket flow with dummy providers (monkey-patching). Test sharing logic.
-   **API Mocking**: **External provider APIs never called during tests.** Monkey-patch `httpx.AsyncClient` to return predefined `Response` objects. Simulates timeouts/exceptions for retry/circuit breaker logic.
-   **Test Coverage**: High coverage (**100% files exercised, ~93% line coverage** via `coverage.py`). Critical logic, complex flows, and edge cases tested. CI runs prevent regressions.
*   **Continuous Integration (Backend)**: The backend code within the `GenDevBackend` subdirectory is subject to automated testing via a GitHub Actions CI pipeline. This workflow, configured in its original private development repository, runs the complete Pytest suite on pushes and pull requests to `main`, publishing test results. The code in this submission is identical to the version validated by this CI process.

---

## 8. 🔒 Security Considerations

Measures to protect data and system integrity.

-   **Credential Management**: Provider API keys in environment variables, loaded via `CredentialManager` into Pydantic `SecretStr` (masks values). No hard-coded secrets. Backend never exposes credentials.
-   **API Key Restrictions**: Frontend Google Places API key domain-restricted. All other provider keys server-side.
-   **Input Sanitization & Validation**: FastAPI + Pydantic validate JSON inputs against schemas (422 on failure), mitigating injection risks. Domain-specific address validation.
-   **CORS Configuration**: Production restricted to frontend origin.
-   **Sensitive Data in Transit**: All frontend-backend communication (HTTP & WebSocket) over **HTTPS** (via CloudFront).
-   **Logging**: Avoids logging sensitive credentials. Address/query parameters logged for debug.

---

## 9. ⚡ Performance Optimizations (Backend & System)

Focus on efficient data handling and communication. (Frontend performance detailed in Section 5).

-   **Caching Strategy (Backend)**:
    *   **Redis**: Primary cache for completed offer lists (keyed by share slug) for O(1) share link retrieval.
    *   **FastAPI**: Caches OpenAPI schema generation and dependencies.
-   **WebSocket Efficiency**:
    *   Reduces overhead vs. polling; lightweight handshake, server-pushed updates.
    *   Server-side async I/O to providers is faster.
    *   Supports incremental results and status messages efficiently.
-   **Load Handling (Backend)**:
    *   Handles multiple simultaneous WebSocket comparisons via async I/O and Gunicorn workers.
    *   Provider response times (main bottleneck) mitigated by two-phase loading and parallelism.

These optimizations contribute to a snappy user experience and a scalable system.

---

## 10. 🔮 Future Improvements

Potential enhancements:

-   **Enhanced Caching**: Cache individual provider API responses; cache full address requests (balancing real-time needs). This wasnt integrated as it conflicts with the project statement ("displaying only actual offers that the internet providers are able to conclude")
-   **Persistent Offer Storage**: Integrate a database (e.g., PostgreSQL) for historical tracking and potentially faster initial loads.
-   **Expanded Test Coverage**: More backend edge-case tests; implement frontend tests (Jest, RTL, Cypress/Playwright).
-   **Frontend Enhancements**: Pagination for large results, theme switching (light/dark mode), UI/UX refinements based on feedback.
-   **Dependency Management**: Make python services take dependencies like settings as __init__ arg so it can be cached by fastapi.

---

## 11. 🚧 Known Issues & Considerations

While *BetterSurf* is a robust and feature-rich application, the following points are noted for transparency and potential future refinement:

*   **Minor Visual Artifacts:**
    *   Occasional, minor visual artifacts, such as a brief flicker in the status bar or during the offer loading sequence, may be observed. These are superficial and do not impact core application functionality or the overall user experience.
*   **Frontend Modularity Enhancements:**
    *   The frontend codebase presents opportunities for further modularization. Certain larger React components and custom hooks could be decomposed into smaller, more granular units to further enhance long-term maintainability and code clarity. The current architecture, however, remains robust and understandable.
*   **Google Places API Versioning:**
    *   The Google Places API integration may generate console warnings from the SDK, recommending an update to a newer version. The currently implemented SDK version remains fully supported by Google and is not scheduled for deprecation for at least the next 12 months. Migration, when deemed necessary, is anticipated to be a straightforward process with minimal development overhead.
*   **Transient Google Maps SDK Diagnostic:**
    *   A transient CORS-related error from the Google Maps SDK may occasionally appear in the browser console, typically upon the first page laod. This diagnostic message is non-disruptive, and the address autocompletion feature initializes and functions correctly without any perceptible impact on its performance or the user experience.

---

Made with ❤️ by Justin Lanfermann
