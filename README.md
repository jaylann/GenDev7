# GenDev7 Internet Provider Comparison

## 1. 🗺️ Project Overview & Live Demo

**Responsive Web Application for Internet Provider Comparison** – This project (code-named *BetterSurf*) is a full-stack web app that allows users to input any address and instantly compare real-time internet offers from 5 different providers. Built with a focus on reliability and UX, it streams provider results live over **WebSocket** and gracefully handles API delays or failures. Users see comprehensive plan details in an intuitive interface, with robust error handling and sharing capabilities.

### 🚀 Live Demo

Explore *BetterSurf* live:

*   **Frontend Web App**: [Web App](https://gendev-web.vercel.app/)
*   **Backend API**: [API](https://d61c7czwgnmbn.cloudfront.net)
*   **API Documentation**: [API Docs](https://d61c7czwgnmbn.cloudfront.net/docs)

### 📁 Repository Structure

The frontend and backend components were developed independently (a **Next.js** application and a **FastAPI** service, respectively) and subsequently unified into this repository using a git subtree merge for submission. The repository root contains both [`GenDevWeb`](./GenDevWeb) (frontend) and [`GenDevBackend`](./GenDevBackend) (backend), preserving a clean commit history and maintaining a modular architecture.

### 🔧 Setup

To get *BetterSurf* up and running on your local machine, please follow the detailed setup instructions in the respective README files for the backend and frontend components:

*   **Backend Setup**: [`GenDevBackend/README.md`](./GenDevBackend/README.md)
*   **Frontend Setup**: [`GenDevWeb/README.md`](./GenDevWeb/README.md)

These guides provide comprehensive, step-by-step instructions to ensure a smooth setup process.

---

## 2. ✅ Challenge Requirements Compliance

### 👍 Minimum Requirements Met:

*   ✅ **Robust API Failure Handling**: Utilizes **WebSockets** with an intelligent 2-phase timeout system for results streaming, **Tenacity**-based retry logic with exponential backoff, and a circuit breaker pattern per provider for enhanced resilience (see Section 4.2).
*   ✅ **Comprehensive Sorting & Filtering**: Implements five sorting algorithms, including an intelligent recommendation engine, alongside multi-criteria filtering by provider, speed, contract duration, connection type, TV option, and youth discounts (see Section 4.3).
*   ✅ **Advanced Share Link Feature**: Features slug-based shareable links backed by **Redis** (24h TTL, configurable) for both complete search results and individual offers. These links preserve all query parameters (address and filters) within the slug payload.
*   ✅ **API Credentials Security**: Employs an environment-based credential manager using Pydantic's `SecretStr` to ensure API keys remain secure and are never exposed to the frontend.

### ✨ Optional Features Implemented:

*   ✅ **Address Autocompletion**: Integrates the **Google Places API** for seamless address lookup, secured with domain-restricted API keys.
*   ✅ **Comprehensive Input Validation**: Leverages strict **Pydantic** models on the backend for all incoming requests, supplemented by domain-specific address validation (e.g., matching ZIP code to city). The frontend provides user-friendly validation errors for incomplete addresses.
*   ✅ **Persistent Session State**: Stores recent searches (up to 5) in the browser's `localStorage` for quick access, allowing users to seamlessly revisit previous comparisons.

---

## 3. 🏗️ Architecture Overview

### 🏛️ System Architecture

The system adopts a decoupled two-tier architecture, featuring a **Next.js** frontend and a **FastAPI** backend.

*   The **Frontend** (deployed on Vercel) is responsible for rendering the user interface and establishes a **WebSocket** connection to the backend for live data streaming.
*   The **Backend** (running on AWS EC2) orchestrates parallel calls to multiple third-party **provider APIs**. It aggregates results, caches them in **Redis**, and communicates back to the client via **WebSocket** and standard REST endpoints.
*   An **Nginx** reverse proxy, fronted by **CloudFront**, manages HTTP(S) traffic and **WebSocket** upgrades for the backend container.

This design ensures a clear separation of concerns: the browser interacts exclusively with the **FastAPI** API (never directly with provider services), and all sensitive API keys are securely managed on the server side.

### 💻 Technology Stack

**Backend:**

*   **Framework/Language**: **FastAPI** (Python)
*   **Data Validation**: **Pydantic**
*   **HTTP Client**: **httpx** (for asynchronous calls to provider APIs)
*   **Retry Logic**: **Tenacity** (for resilient external API calls)
*   **Logging**: **Loguru** (for structured logging)
*   **Testing**: **Pytest**
*   **Containerization**: **Docker** & **Docker Compose**
*   **Caching & Sharing**: **Redis** (in-memory datastore)
*   **Web Server/Proxy**: **Gunicorn** (with **Uvicorn** workers) serving the **FastAPI** app, **Nginx** (as reverse proxy)

**Frontend:**

*   **Framework**: **Next.js 15** (utilizing **React 19** and the App Router architecture)
*   **Language**: **TypeScript**
*   **Styling**: **Tailwind CSS** with **ShadCN/UI** components
*   **Address Autocompletion**: **Google Places API**
*   **Code Quality**: **ESLint** (linting), **Prettier** (formatting)
*   **UI Enhancements**: **Sonner** (for non-blocking toast notifications), React Server Components, and Suspense for optimized performance.
## 4. ⭐ Core Features & Implementation

### 📡 4.1 Real-Time Provider Comparison

-   **WebSocket Implementation**: Client-server communication occurs over a dedicated WebSocket. This enables the backend to push offer updates asynchronously as providers respond, delivering near-instant frontend updates without polling.

-   **Intelligent Two-Phase Loading**: Provider data fetching is optimized through a two-phase system:
    *   **Phase 1**: Queries fast providers (all except ServusSpeed) in parallel. Ends when these providers respond or after 10 seconds, whichever is first. ServusSpeed (historically slowest) is initiated in the background.
    *   **Phase 2**: If ServusSpeed is pending post-Phase 1, the system waits longer for it. This is also the case for all other providers that dont finish in Phase 1.
    *   *Bypass*: If only a single provider is selected, this two-phase mechanism is bypassed for direct results.

-   **Performance Benefits**:
    *   Offers from faster providers appear quickly (often within seconds) as `INITIAL_OFFERS`, allowing users to start exploring while slower providers are awaited.
    *   A `FINAL_OFFERS` update with the complete, deduplicated list is sent once all providers respond or timeout.
    *   This ensures responsiveness even if one API is sluggish, significantly improving perceived performance.

### 🛡️ 4.2 Advanced Error Handling & Resilience

#### 🔄 **Tenacity Retry Logic**

Each provider API call is wrapped with **Tenacity** for robust retries against transient failures (timeouts, 5xx errors):

-   **Attempts**: Up to **8 attempts** per provider.
-   **Backoff Strategy**: Exponential backoff (0.1s, 0.2s, 0.4s...) capped at a 1s interval between retries.
-   **Retry Conditions**: Triggered by custom `ProviderError` (e.g., invalid responses) and `httpx.HTTPError` (network issues).
-   **Logging**: Each retry attempt and outcome is logged for troubleshooting.

#### ⚡ **Circuit Breaker Pattern**

A circuit breaker (per provider) prevents a persistently failing provider from degrading system performance:

-   **States**:
    *   **Closed**: Normal operation; requests pass through.
    *   **Open**: After 5 consecutive failures, the circuit opens. Subsequent calls are short-circuited for a cooldown period (default 5s), returning an empty result instantly for that provider.
    *   **Half-Open**: Post-cooldown, allows one test request. Success resets to **Closed**; failure re-opens the circuit.
-   **Resilience**: Ensures one misbehaving API doesn't stall the entire comparison. Settings favor availability (5 failures to open, 1 success to close).

#### 🧩 **Provider Pattern**

A common design pattern standardizes error handling for all provider connectors:

-   An abstract `ProviderBase` class defines a standard interface, incorporating Tenacity retry and circuit breaker logic via decorators around its `__call__` method.
-   Each provider subclass implements a `fetch(address)` method with API-specific logic, decorated for circuit breaker protection, and raises `ProviderError` for retryable issues.
-   This ensures uniform, non-redundant resilience across all integrations.

### 📊 4.3 Intelligent Sorting & Filtering System

#### ↕️ **Sorting Options**

Users can instantly sort results client-side using five modes:

-   **Recommended (Default)**: A multi-factor algorithmic ranking. Scores offers based on 24-month total cost, promotions, download speed, speed-per-Euro, connection type (Fiber > Cable > DSL), and extra features (unlimited data, free installation, TV, no age restriction). Prioritizes "best value" offers.
-   **Price (Low to High)**: Sorts by effective monthly price over 24 months, accounting for promotions.
-   **Speed (High to Low)**: Sorts by download speed (Mbps) descending.
-   **Contract Duration (Short to Long)**: Sorts by contract length (months) ascending.
-   **Provider (A–Z)**: Alphabetical sort by provider name.

#### 🔍 **Filter Categories**

Client-side filters allow users to refine results:

-   **Contract Durations**: Select specific contract lengths (e.g., 1, 12, 24 months), derived from available data.
-   **Connection Types**: Multi-select (DSL, Fiber, Cable, Mobile).
-   **Minimum Speed**: Slider/input for minimum download speed (Mbps).
-   **TV Inclusion**: Toggle for offers with/without TV packages.
-   **Provider Selection**: Multi-select providers. Selections can be sent to the backend to avoid querying unwanted providers.
-   **Youth Offers**: Toggle for plans with age restrictions (e.g., student offers), based on `max_age` data.

All filters can be combined, and the UI dynamically shows the number of matching offers.

### 🔌 4.4 Provider Integration Details

Backend adapters normalize diverse provider APIs into a common `Offer` model:

-   **WebWunder (SOAP)**: Uses `zeep` for WSDL-based interaction. Constructs SOAP XML requests, parses responses, and validates `<product>` presence.
-   **ByteMe (REST/CSV)**: Fetches CSV data, processed with `pandas` for cleaning, type normalization, and deduplication by `productId`.
-   **PingPerfect (REST/JSON)**: Implements **HMAC-SHA256 authentication**. Sends signed requests (payload, timestamp, secret) with `X-Client-Id`, `X-Signature`, `X-Timestamp` headers. Supports a "wantsFiber" flag for server-side filtering.
-   **VerbynDich (Paginated REST)**: Fetches pages concurrently (up to 10 parallel requests via `asyncio.Semaphore`) until the "last page" is detected, optimizing for addresses with many results.
-   **ServusSpeed (REST/Basic Auth)**: Known for slowness. A two-step fetch: first, "available products" (quick summary), then parallel detail requests (up to 3, semaphore-controlled) for each product ID within a time budget. May skip details if initial call is too slow, ensuring it doesn't excessively delay overall comparison.

Post-parsing, all data is mapped to the unified `Offer` schema, enriching fields like `tv_included` and normalizing connection types.

### ✔️ 4.5 Data Validation & Offer Processing

Raw provider data undergoes rigorous validation and normalization:

**Offer Structure Validation (`Pydantic` `Offer` model):**

-   Monetary values stored as integer cents (EUR).
-   Mandatory fields: provider name, plan name, `product_id`, download speed, price.
-   Connection types normalized (e.g., "DSL", "Cable", "Fiber", "Mobile").
-   Cross-field validation: e.g., promotional periods require both promo and regular prices.
-   Automatic field setting: e.g., `tv_package_name` presence sets `tv_included = True`.

**Business Logic Validation:**

-   Pricing consistency: Introductory prices align with promotional durations and subsequent regular prices.
-   Contract duration consistency: Promo duration vs. total contract length.
-   Voucher normalization: Auto-detects voucher type (percentage/absolute) and stores in distinct fields.

**Data Quality & Metadata (for frontend clarity):**

-   **Youth offers**: `max_age` field indicates age limits.
-   **Technician installation**: `installation_service_included` boolean.
-   **Data caps**: `data_cap_gb` (integer GB), `None` for unlimited.
-   **Promotional periods**: Clear distinction between `contract_duration_months` and `contract_regular_months` (post-promo period) for accurate cost calculations.

Validated, normalized offers ensure reliable UI comparisons and calculations (e.g., for the "Recommended" sort).

### 🔗 4.6 Sharing System

Share comparison results or individual offers via short, secure links using encoded slugs and Redis:

-   **Slug Generation**:
    *   A short, URL-safe **slug** (e.g., `ABC123`) is generated, encoding a zlib-compressed, base64url-encoded JSON payload of search parameters (address, filters) and a timestamp. Slugs are unique per search.
-   **Redis Storage**:
    *   The actual offer list corresponding to a slug is stored in Redis (slug as key) with a 24-hour TTL (configurable). This allows shared state across backend instances.
-   **URL Structure**:
    *   Frontend uses clean URLs like `/{slug}`. The slug itself contains all necessary context.
-   **Sharing Endpoints**:
    *   `GET /compare/{slug}`: Retrieves offers for a slug from Redis. Returns 400/404 for invalid/expired slugs.
    *   `POST /offers/share-link`: Generates a new slug for a *single specific offer* from an existing comparison.
-   **Client Integration**:
    *   Slugs are sent to the client via WebSocket. The final offers slug updates the browser URL.
    *   Opening a slugged URL triggers a fetch from the `GET /compare/{slug}` endpoint.
-   **Security/Privacy**:
    *   Slugs are opaque tokens. Address info within the slug payload is inherent to the comparison result.
    *   No persistent database needed; data is transient in Redis cache. Timestamps ensure new slugs for repeated searches.

### 💾 4.7 Search & Persistent State

The application enhances UX by remembering recent searches:

-   The last 5 search queries (address and filters) are stored client-side in browser **`localStorage`**.
-   A "Recent Searches" dropdown allows users to quickly re-run previous comparisons.
-   State persists across page reloads. Oldest entries are removed (FIFO) when the 5-entry limit is exceeded.

This, combined with shareable links, facilitates easy revisiting and sharing of comparisons.
---

## 5. ☁️ Deployment & Infrastructure

### ⚙️ Backend Deployment (AWS EC2)

The backend is a Dockerized application deployed on an AWS EC2 instance, designed for consistency and resilience.

-   **Containerization**:
    *   Packaged as a **Docker** container.
    *   **Docker Compose** orchestrates three services: the FastAPI application, Nginx (reverse proxy), and Redis (caching/sharing). This setup enables one-command deployment.
-   **Reverse Proxy (Nginx)**:
    *   Listens on port 80, forwarding HTTP requests to the FastAPI app (Gunicorn on port 8000).
    *   Configured for **WebSocket** upgrades (for `/ws/compare`).
    *   Can handle SSL termination, though currently managed by CloudFront.
-   **SSL/Security (AWS CloudFront)**:
    *   The live API endpoint is fronted by **AWS CloudFront**, providing:
        *   HTTPS (SSL/TLS).
        *   Caching for static assets (e.g., OpenAPI docs).
        *   WebSocket traffic forwarding.
        *   A layer of DDoS protection.
-   **Health Monitoring**:
    *   FastAPI exposes a `GET /health` endpoint (`{"status": "ok"}`).
    *   Docker Compose uses this for internal health checks, ensuring the app is responsive before Nginx routes traffic to it.
    *   Suitable for external load balancers or uptime monitors.
-   **Scalability**:
    *   **Gunicorn** runs the FastAPI app with multiple **Uvicorn** worker processes (default: 4, configurable via environment variables), utilizing multiple CPU cores for concurrent request handling.
    *   The application is horizontally scalable (stateless, with shared Redis), allowing replication behind a load balancer (e.g., AWS ALB) if needed.
    *   Logging to `stdout`/`stderr` is captured by Docker, suitable for CloudWatch integration.

### 🖥️ Frontend Deployment (Vercel)

The Next.js frontend is deployed on Vercel, leveraging its strengths for hosting modern web applications.

-   **Build & Deployment**:
    *   Utilizes Next.js's build and export capabilities, resulting in an optimized static/SSR bundle.
    *   Dynamic data (offers) is fetched client-side via APIs.
    *   **Vercel** handles CI/CD: every push triggers a build, and the site is served from Vercel’s global CDN.
-   **Environment Configuration**:
    *   Managed via environment variables (e.g., `.env.local` for development, Vercel platform variables for production).
    *   Key variables:
        *   `NEXT_PUBLIC_API_URL`: Backend API base URL.
        *   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Places API key, domain-restricted for security.
    *   No sensitive provider credentials are exposed; they remain on the backend.
-   **Performance Optimizations**:
    *   **Code Splitting & Lazy Loading**: Next.js App Router and React dynamic imports ensure only necessary JavaScript is initially loaded.
    *   **React Server Components & Suspense**: Reduces client-side bundle size and provides graceful loading states (e.g., for address autocomplete).
    *   **Caching**: Vercel CDN caches static assets. Real-time API results are not client-cached, but share links (slugs) allow data reuse, and `localStorage` caches recent search addresses.
    *   **Responsive & Lightweight UI**:
        *   **Tailwind CSS** provides a small CSS footprint (purged and autoprefixed).
        *   Minimal use of large images or heavy libraries. Google Places API used for text autocomplete, not full map embeds.
    *   Fast First Contentful Paint (FCP) due to minimal blocking scripts.

The overall deployment architecture prioritizes **robustness** (health checks, containerization), **security** (no client-side secrets, HTTPS), and **performance** (CDN, backend parallelism, optimized frontend).

## 6. 📚 API Documentation

Comprehensive **OpenAPI 3.0 (Swagger UI)** and **ReDoc** documentation is available, detailing all endpoints, request/response models, and schemas.

➡️ **Explore the live [API Documentation](https://d61c7czwgnmbn.cloudfront.net/docs)**

### Key API Endpoints Overview:

#### 📡 WebSocket: `GET /ws/compare`

-   **Purpose**: Real-time internet provider comparison.
-   **Interaction**: Client sends an initial JSON request (address, filters). Server streams `INITIAL_OFFERS`, `FINAL_OFFERS`, `STATUS`, and `ERROR` messages.
    *   *Refer to `WsCompareAddressRequest` and `WsMessage` schemas in the API docs.*

#### 🌐 REST Endpoints

-   **`GET /health`**: Health check.
-   **`GET /compare/{slug}`**: Retrieve cached comparison results by share slug.
-   **`POST /offers/share-link`**: Create a share link for a single offer.
    *   *Request/response details are in the API docs.*
-   **`GET /docs`**: Swagger UI.
-   **`GET /redoc`**: ReDoc UI.

#### 🔑 Authentication

-   **Public API**: No end-user authentication.
-   **Security**: CORS enabled. Provider credentials managed server-side.

*For detailed information on request/response formats, parameters, and data models, please consult the [full API documentation](https://d61c7czwgnmbn.cloudfront.net/docs).*
## 7. 🧪 Testing Strategy

The project employs a comprehensive testing strategy using **Pytest**, focusing on reliability and correctness across all modules.

-   **Unit Tests**:
    *   Isolate and test individual modules, especially data processing, provider integrations (e.g., `tests/providers/test_webwunder_provider.py`), factories, and validators.
    *   Simulate API responses (including errors and edge cases) to verify parsing and handling.
    *   Utilize Pytest fixtures and Hypothesis for generating varied test inputs (e.g., random addresses for address validation).
    *   Test `Offer` model validators for correct error handling with invalid data.
-   **Integration Tests**:
    *   Validate end-to-end workflows using FastAPI’s `TestClient`.
    *   A key test (`test_comparison_service.py`) simulates the WebSocket flow with dummy providers (via monkey-patching) to assert correct message order and data merging.
    *   Test sharing logic by calling compare endpoints and using returned slugs with share endpoints.
-   **API Mocking**:
    *   **External provider APIs are never called during tests.**
    *   Techniques include monkey-patching `httpx.AsyncClient.get/post` to return predefined `Response` objects (e.g., sample XML/JSON/CSV loaded from files).
    *   Simulates various scenarios like timeouts or exceptions to confirm retry and circuit breaker logic (e.g., forcing failures to test circuit opening).
-   **Test Coverage**:
    *   Achieved high coverage: **100% of files** exercised, **~94% line coverage** (via `coverage.py`).
    *   Ensures critical logic, including complex flows (retries, WebSockets) and edge cases, are tested.
    *   Tests run in CI to prevent regressions.

This strategy combines unit tests for granular validation with integration tests for core user flows, ensuring a robust codebase.

## 8. 🔒 Security Considerations

Security is a priority, with measures implemented to protect data and system integrity.

-   **Credential Management**:
    *   Provider API credentials stored in environment variables, loaded via `CredentialManager` into Pydantic `SecretStr` objects (masks values if logged).
    *   No hard-coded secrets; `.env` files are in `.gitignore`.
    *   Backend never exposes credentials to the client.
-   **API Key Restrictions**:
    *   Frontend Google Places API key is domain-restricted (production Vercel domain & localhost).
    *   All other third-party API keys (WebWunder, ByteMe, PingPerfect, VerbynDich) remain server-side. PingPerfect HMAC secret never leaves the server.
-   **Input Sanitization & Validation**:
    *   All user inputs are treated as untrusted.
    *   FastAPI + Pydantic validate JSON inputs against schemas (422 error on failure).
    *   Domain-specific address validation (`AddressValidator.validate_address`) checks format and plausibility.
    *   Mitigates common web injection attacks (no direct DB interface; careful output encoding like base64 for slugs).
-   **CORS Configuration**:
    *   Development: Permissive CORS.
    *   Production: Restricted to the specific frontend origin, preventing direct API calls from unauthorized third-party sites via browsers.
-   **Sensitive Data in Transit**:
    *   All frontend-backend communication (HTTP & WebSocket) is over **HTTPS** (via CloudFront), encrypting address data and offers.
    *   Only user-inputted address (necessary for service) is transmitted; no other PII.
-   **Logging**:
    *   Avoids logging sensitive information like provider credentials.
    *   Address/query parameters logged for debug/audit; can be masked if necessary.

The application adheres to relevant security best practices, ensuring user confidence and data protection.
## 9. ⚡ Performance Optimizations

Performance was a key consideration, addressed through caching, efficient communication, and frontend best practices.

-   **Caching Strategy**:
    *   **Redis**: Primary cache for completed offer lists (keyed by share slug). Enables efficient share link retrieval (O(1) lookup) and can act as short-term memory for repeated searches.
    *   **In-Memory**: LRU cache for VerbynDich page fetches to avoid redundant calls within a session.
    *   **FastAPI**: Caches OpenAPI schema generation for faster doc loading.
-   **WebSocket Efficiency**:
    *   Reduces overhead compared to polling; one lightweight handshake and server-pushed updates.
    *   Server-side fan-out to providers is faster (async I/O, proximity).
    *   Lower load: one persistent connection is cheaper than many HTTP requests.
    *   Supports incremental results and status messages efficiently.
-   **Frontend Optimizations**:
    *   **Next.js (App Router)**: Server-rendered/statically-rendered UI components lead to smaller JS bundles. Next.js Image/Script optimization used.
    *   **Minimal Re-renders**: React components optimized (e.g., memoized offer list, `useMemo`, custom hooks) to prevent unnecessary re-renders.
    *   **Debounced Input**: Address autocomplete input is debounced to limit Google API calls.
    *   **CDN & Compression**: Vercel serves assets with gzip/brotli compression via a global CDN. Small JS/CSS bundles and low TTFB due to pre-rendering and HTTP/2.
-   **Load Handling**:
    *   Backend handles multiple simultaneous WebSocket comparisons via async I/O and Gunicorn workers.
    *   Provider response times are the main bottleneck, mitigated by the two-phase loading and parallelism.
    *   Frontend remains responsive with modern React/Next.js stack optimizations.

These optimizations ensure a snappy user experience and a scalable system.

## 10. 🔮 Future Improvements

While the current application is robust, potential enhancements include:

-   **Enhanced Caching**:
    *   Implement caching for individual provider API responses.
    *   Cache results for full address requests (balancing with the need for real-time offers).
-   **Persistent Offer Storage**:
    *   Integrate a database (e.g., PostgreSQL, MongoDB) to store offers long-term. This would enable historical offer tracking and potentially faster initial loads for known addresses.
-   **Expanded Test Coverage**:
    *   Increase the number of backend test cases for even greater edge-case coverage.
    *   Implement frontend tests (e.g., using Jest, React Testing Library, Cypress/Playwright) for UI components and user flows.
-   **Frontend Enhancements**:
    *   **Pagination**: For very large result sets in the offer list.
    *   **Theme Switching**: Add light and dark mode options.
    *   **UI/UX Refinements**: General improvements to visual design, user interaction, and accessibility based on user feedback.
