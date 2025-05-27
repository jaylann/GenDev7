# GenDev7 Internet Provider Comparison

## 1. 🗺️ Project Overview & Live Demo

**Responsive Web Application for Internet Provider Comparison** – This project (code-named *BetterSurf*) is a full-stack web app that allows users to input any address and instantly compare real-time internet offers from 5 different providers. Built with a focus on reliability and UX, it streams provider results live over WebSocket and gracefully handles API delays or failures. Users see comprehensive plan details in an intuitive interface, with robust error handling and sharing capabilities.

### 🚀 **Live Demo Links**

* **Frontend**: [Web App](https://gendev-web.vercel.app/)
* **Backend API**: [API](https://d61c7czwgnmbn.cloudfront.net)
* **API Documentation**: [API Docs](https://d61c7czwgnmbn.cloudfront.net/docs)

### 📁 **Repository Structure**

Frontend and backend were developed independently (Next.js app and FastAPI service), then unified via a git subtree merge for submission. The repository root contains both: GenDevWeb (frontend) and GenDevBackend (backend), preserving a clean commit history and a modular architecture.

## 2. ✅ Challenge Requirements Compliance

### 👍 **Minimum Requirements Met:**

* ✅ **Robust API Failure Handling**: Uses WebSockets with an intelligent 2-phase timeout system for results streaming, Tenacity-based retry logic with exponential backoff, and a circuit breaker pattern per provider for resilience (see Section 4.2).
* ✅ **Comprehensive Sorting & Filtering**: Five sorting algorithms including an intelligent recommendation engine, plus multi-criteria filtering by provider, speed, contract duration, connection type, TV option, and youth discounts (see Section 4.3).
* ✅ **Advanced Share Link Feature**: Slug-based shareable links backed by Redis (24h TTL, configurable) for both complete search results and individual offers, preserving all query parameters (address and filters) in the slug payload.
* ✅ **API Credentials Security**: Environment-based credential manager using Pydantic **SecretStr** to keep keys secure. No provider credentials are ever exposed to the frontend.

### ✨ **Optional Features Implemented:**

* ✅ **Address Autocompletion**: Google Places API integration for address lookup, secured with domain-restricted API keys.
* ✅ **Comprehensive Input Validation**: Strict Pydantic models on the backend for all requests, plus additional domain-specific address validation (e.g. matching ZIP to city). Frontend provides user-friendly validation errors for incomplete addresses.
* ✅ **Persistent Session State**: Recent searches (up to 20) are stored in browser localStorage for quick access, enabling users to seamlessly revisit previous comparisons.

## 3. 🏗️ Architecture Overview

### 🏛️ System Architecture

The system follows a decoupled microservice-style architecture with a **Next.js** frontend and a **FastAPI** backend. The **frontend** (deployed on Vercel) renders the UI and opens a WebSocket connection to the **backend** (running on AWS EC2) for live data streaming. The FastAPI backend orchestrates parallel calls to multiple **provider APIs**, aggregates and caches results in **Redis**, and communicates back to the client via WebSocket and REST endpoints. An Nginx reverse proxy (with CloudFront) fronts the backend container, handling HTTP(S) traffic and WebSocket upgrades. This setup ensures a clear separation: the browser interacts only with the FastAPI API (never directly with provider services), and all sensitive API keys remain on the server side.

### 💻 Technology Stack

**Backend:** FastAPI (Python) for the web service, **Pydantic** for data modeling and validation, **httpx** for async HTTP calls to providers, **Tenacity** for resilient retries, **Loguru** for structured logging, **Pytest** for testing, containerized via **Docker** (+ Compose). A **Redis** in-memory datastore provides caching and sharing capabilities. Nginx is used as a reverse proxy, and **Gunicorn** (with Uvicorn workers) serves the FastAPI app in production.

**Frontend:** Next.js 15 (React 19) with the App Router architecture, written in **TypeScript**. Styling is done with **Tailwind CSS** (using ShadCN/UI components). It integrates the **Google Places API** for address autocompletion. Developer tooling includes ESLint and **Prettier** for code quality. React’s latest features (Server Components, Suspense) are leveraged for performance, and the UI uses libraries like **Sonner** for non-blocking toast notifications.

## 4. ⭐ Core Features & Implementation

### 📡 4.1 Real-Time Provider Comparison

* **WebSocket Implementation**: The client and server communicate over a dedicated WebSocket endpoint for comparisons. This bi-directional channel enables the backend to push offer updates asynchronously as soon as each provider returns data, resulting in near-instant updates on the frontend without polling.

* **Intelligent Two-Phase Loading System**: Provider fetches are managed in two phases to optimize speed:

  * **Phase 1**: Fast providers (all except ServusSpeed) are queried in parallel. This phase ends as soon as **either** all non-ServusSpeed providers have responded or 10 seconds have elapsed, whichever comes first. ServusSpeed (historically the slowest) is launched in the background during this phase.
  * **Phase 2**: If ServusSpeed is still pending after phase 1, the system waits longer for it in a second phase. Any remaining pending tasks (including ServusSpeed) are awaited to gather final results. If the user had selected only a single provider (especially if it’s ServusSpeed), the two-phase mechanism is bypassed and results are delivered in one step.

* **Performance Benefits**: Faster providers’ offers appear almost immediately (often in a few seconds), rather than the user waiting for the slowest provider. This means the UI can render partial results (Phase 1’s **INITIAL\_OFFERS**) quickly while still indicating that a slower provider is being awaited. The user’s perceived performance is improved, as they begin exploring initial offers while final aggregation continues in the background. Once the slowest provider responds (or the extended timeout expires), a **FINAL\_OFFERS** update is sent with the complete deduplicated list, if any additional offers arrived. This approach ensures responsiveness even when one API is sluggish.

### 🛡️ 4.2 Advanced Error Handling & Resilience

#### 🔄 **Tenacity Retry Logic**

To deal with transient provider failures (timeouts, 5xx errors, etc.), the backend wraps each provider call in a robust **Tenacity** retry mechanism. This ensures that momentary issues do not immediately result in lost data. The retry configuration is tuned as follows:

* **Attempts**: Up to **8 attempts** per provider request. If a provider’s API doesn’t succeed after 8 tries, it’s considered unavailable and the error will bubble up as a ProviderError (surfaced in logs and in the WebSocket status message if appropriate).
* **Backoff Strategy**: Exponential backoff starting at 0.1s, doubling each time (0.1s → 0.2s → 0.4s → …) capping at a 1s interval. This yields quick retries for transient issues but avoids overwhelming a provider with rapid-fire requests. The maximum delay between attempts is 1 second.
* **Retry Conditions**: Retries are triggered only for specific exception types – namely custom ProviderError (application-level errors like invalid responses) and network exceptions from httpx (httpx.HTTPError). This prevents logic bugs or bad input from causing infinite retries. Other errors propagate immediately.
* **Logging & Transparency**: Each retry attempt and outcome is logged at debug level. The system logs when a provider call fails and will try again, which provider, and the final result (success or giving up). This helps in troubleshooting and performance tuning. An example flow: a provider might time out on first call, Tenacity logs the failure and waits \~0.1s, retries, perhaps succeeds on second try – all of this happens behind the scenes, and the user only experiences a slight delay for that provider’s data.

#### ⚡ **Circuit Breaker Pattern**

In addition to retries, a **circuit breaker** is in place to handle persistent failures and prevent a flailing provider from degrading the whole system. Each provider has its own circuit-breaker state:

* **Closed (Normal)**: All requests go through as normal. The breaker starts in this state.
* **Open (Tripped)**: If a provider fails 5 times consecutively, the circuit **opens**. In open state, further calls to that provider are **short-circuited** (skipped immediately) for a cooldown period. This prevents wasting resources on a provider that is likely down and speeds up overall comparison by not waiting on hopeless requests.
* **Half-Open (Test)**: After a cooldown (configured as 5 seconds of recovery timeout by default), the circuit half-opens. In this state, a limited number of test requests are allowed through to the provider to probe if it’s healthy again.
* **Transitions**: After the cooldown, the **next** incoming request for that provider will be allowed (instead of skipped). If that request succeeds, the breaker assumes the provider is back – it resets to Closed and normal operation resumes (failure count resets). If the test request fails, the breaker immediately re-opens and the cycle repeats. (The implementation uses a failure counter and timestamps to manage these states under the hood.)

This pattern ensures one misbehaving API won’t continuously stall our comparison. When a circuit is open, the backend logs a warning and returns an empty result for that provider instantly (so the user might simply not see that provider’s offers for that session, rather than waiting or erroring). The circuit breaker settings are kept somewhat lenient to favor availability: it only takes **5 failures** to open, and only **1 success** to close (the system assumes quick recovery to maximize user benefit).

#### 🧩 **Provider Pattern**

To implement the above consistently, all provider connectors share a common design:

* An abstract base class ProviderBase defines a standard interface and wraps the provider-specific logic with the retry and circuit-breaker decorators. The provider’s __call__ method (invoked when the provider is awaited) runs the Tenacity retry loop and calls the subclass’s fetch() method. The fetch() method of each provider is further decorated to be *circuit breaker protected*, meaning it will check is_allowed() before executing and record success/failure after.
* Each provider subclass implements its own fetch(address) with the API-specific steps. They raise ProviderError for any condition that should trigger a retry or be reported as a failure. This design makes error handling uniform across providers and ensures that features like retries and circuit breaking apply to all providers in the same way without duplicating code.

Overall, this combination of **retries** and **circuit breaking** means the system is resilient: intermittent errors are transparently handled, and sustained outages in one external API won’t drag down the whole comparison process.

### 📊 4.3 Intelligent Sorting & Filtering System

#### ↕️ **Sorting Options:**

Once all offers are collected (or as they arrive on the frontend), users can sort the results in multiple ways. Five sorting modes are implemented:

* **Recommended** (Default): A multi-factor algorithmic ranking that scores offers holistically. This algorithm considers several weighted factors: the 24-month total cost (combining introductory and regular fees), the value of any promotions (vouchers/discounts), the download speed (with a slight penalty for very low speeds), the “bang-for-buck” (speed per Euro) metric, the connection type (Fiber vs DSL vs Cable, etc., favoring more reliable mediums), and extra features (unlimited data vs data cap, free installation, TV included, no age restriction). Each offer receives a normalized score between 0 and 1 based on these criteria, and the list is sorted by this score (highest first). This **Recommended** sort gives a balanced ordering where the “best value” offers (not just the cheapest or fastest) float to the top.
* **Price (Low to High)**: Simple cost comparison, but to be meaningful, the app calculates the effective monthly price accounting for promotions. We compute the average monthly cost over 24 months for each plan (blending promo months and regular months) and sort by that. This way, a plan with a low intro price but a high later price is accurately reflected in the ordering.
* **Speed (High to Low)**: Sorts by the advertised download speed (Mbps) in descending order. If two plans have the same speed, their order is undefined (or falls back to insertion order).
* **Contract Duration (Short to Long)**: Sorts by the total contract length in months, ascending. A 12-month contract will come before a 24-month contract, etc. (This can help users who prefer shorter commitments.)
* **Provider (A–Z)**: Alphabetical order by provider name. Useful if the user wants to group or find offers from a specific provider easily.

These sorting options can be toggled instantly on the frontend without additional API calls (sorting is done in-memory in the browser on the fetched data).

#### 🔍 **Filter Categories:**

Users can refine the results using a rich set of filters, all of which are implemented in the UI and applied client-side:

* **Contract Durations**: Filter by contract length (e.g. show only 1-year plans, or only month-to-month, etc.). The available duration options are derived from the data (e.g., 1, 12, 24 months).
* **Connection Types**: Filter by the technology medium – DSL, Fiber, Cable, Mobile. Users can multi-select these to include, for example, only Fiber and Cable plans and exclude others.
* **Minimum Speed**: A slider or input to set a minimum required download speed (in Mbps). Offers with speed_down_mbit below this threshold are filtered out.
* **TV Inclusion**: A toggle to filter by whether a TV package is included. Users can choose “Yes” (only offers that include TV service) or “No” (only offers without TV) to suit their preference.
* **Provider Selection**: Multi-select specific providers to include or exclude. For instance, a user might uncheck one or two providers to focus on the rest. The frontend sends the selected provider list to the backend WebSocket request so that unwanted providers aren’t even queried if excluded.
* **Youth Offers**: A toggle to show only “young people” or student offers. Many providers have special plans for customers under a certain age (max_age in our data). If this filter is set to “Yes,” only offers that have a youth discount (and thus an age restriction) are shown. This helps, for example, a student user to quickly see plans they are eligible for, or conversely to exclude those special deals if they don’t apply.

All filters can be combined. The filtering logic is applied in the frontend hook before sorting: each offer must pass all active filters to be displayed. The UI dynamically indicates how many offers remain after filtering, and the WebSocket can be re-run with different provider selections or fiber-only preference as needed (other filters are purely client-side).

### 🔌 4.4 Provider Integration Details

Each provider’s API is different – the backend contains adapter modules for each, normalizing their responses into a common Offer model. Below are the providers and notable implementation details or quirks:

* **WebWunder** – Exposes a SOAP-based API (WSDL). The integration uses the zeep library and manual XML handling. A SOAP XML request is constructed for the given address and sent with the required SOAPAction header and API key. The XML response is parsed for <products> entries. There is strict validation: if no <product> nodes are found in the SOAP response, the code raises a ProviderError (meaning WebWunder had no offers or returned an unexpected format). This ensures we don’t accidentally treat an empty or errored response as a success. The XML parsing also handles nested fields like connection type, speeds, etc., converting them into our internal models.
* **ByteMe** – Provides data via a REST endpoint that returns CSV-formatted text. The adapter issues an HTTP GET with the address parameters and an API key header. The CSV response is read into a pandas DataFrame for convenient processing. The integration then *cleans* the DataFrame: it normalizes data types, drops any invalid rows (e.g. missing essential fields or non-positive prices/speeds), and sorts and de-duplicates offers by a unique product ID. ByteMe was known to sometimes list the same plan twice; our logic keeps only the first occurrence of each productId. Finally, the cleaned data is mapped to Offer objects via a factory. This provider’s use of pandas and CSV required careful memory handling but given the moderate dataset size it performs well.
* **PingPerfect** – Offers a REST JSON API. The integration here is noteworthy for its **HMAC-SHA256 authentication** scheme. Each request must be signed with a secret key. Our code constructs a JSON payload for the address and an optional “wantsFiber” flag, then computes a signature using a timestamp and the secret via an HMAC-SHA256 digest. This signature (and a client ID) are sent in headers (X-Client-Id, X-Signature, X-Timestamp) with the request. The API returns a list of offerings in JSON, which we validate and convert into Offer objects. PingPerfect’s API can return both fiber and non-fiber options; if the user specifically requested fiber-only, we set a flag to filter their results on the provider side. This saves processing time by not retrieving DSL/Cable offers when the user is only interested in fiber.
* **VerbynDich** – Uses a paginated REST API. For a given address, results might span multiple “pages” of data. To optimize, our integration fetches pages concurrently in batches of up to 10 at a time. It uses an asyncio.Semaphore to limit to 10 parallel requests (to be gentle on the API, higher counts than this resulted in many 429 errors). The code keeps requesting new pages until it hits a page marked as “last page” in the response. When the last page is detected, any remaining queued tasks are cancelled to avoid unnecessary work. This concurrent pagination strategy dramatically improves VerbynDich’s response time for addresses with many results (up to 30 pages, as configured). All pages’ results are combined and transformed to Offer models.
* **ServusSpeed** – A REST API with Basic HTTP auth. ServusSpeed tends to be the slowest provider, so special care is taken. The integration first calls an “available products” endpoint to get a list of product IDs for the address. This is a quick summary call. Then, for each product ID, it must call a detail endpoint to get full offer info. To speed this up, up to 3 detail requests are run in parallel (controlled by a semaphore). If the overall process is taking too long, our logic will not wait indefinitely: we compute a time budget (cap) for fetching details so that the provider doesn’t hold up the whole comparison excessively. In fact, if the initial “available products” call itself takes almost the entire allowed time, we will *skip* fetching details and return no offers for ServusSpeed rather than timing out the user’s session. Every ServusSpeed detail request is wrapped in a tiny retry (1 retry on network error) because these calls can occasionally fail individually. All this means ServusSpeed’s data will arrive either in the FINAL phase or not at all, but it won’t block the INITIAL offers beyond the first 10 seconds. ServusSpeed requires a username/password (stored securely and passed via httpx auth) for every request.

Despite these differences, after each provider’s raw data is parsed and validated, it’s converted into the unified Offer schema. This includes mapping fields (e.g., every provider’s price is converted to euro-cents integer, their specific flags mapped to our common fields) and enriching with any missing info (like deriving tv_included booleans, normalizing connection type names, etc.).

### ✔️ 4.5 Data Validation & Offer Processing

Raw data from providers is rigorously validated and normalized before being used in the app. This happens at multiple layers:

**Offer Structure Validation:** The Offer model (Pydantic) enforces a clean, consistent schema for all provider offers.

* All monetary values are stored as integer cents (EUR) to avoid floating-point issues. For example, a price of €29.99/month would be represented as 2999 cents.
* Mandatory fields are required: every Offer must have a provider name, a plan name, a product\_id, a download speed, and at least one price (intro or regular). If any of these are missing or invalid, the offer object won’t even be created (the validator will error out).
* Connection types are normalized to a fixed set of literals: "DSL", "Cable", "Fiber", or "Mobile". The model accepts various case-insensitive inputs (even common misspellings like “fibre”) and maps them to the canonical form. This ensures consistency when filtering by connection type.
* Cross-field validation rules are applied to catch inconsistent data:

  * If an offer has no monthly price at all (both promo and regular missing), that’s invalid.
  * If an offer has a promotional period (e.g., 6 months at a promo rate and the remaining of 24 months at a regular rate), then **both** the promo price and regular price must be provided. It would be inconsistent to have a promo duration but only one price.
  * The model also automatically sets certain fields for convenience: for instance, if a tv_package_name is provided, it will set tv_included = True regardless of the input for tv_included. This way, even if a provider doesn’t explicitly tell us “TV included = yes”, the presence of a TV package name triggers that flag.

**Business Logic Validation:** Beyond basic schema, additional checks ensure the offers make sense business-wise:

* Pricing logic checks: If an introductory price (price_cents_month_intro) is present, there should be a corresponding contract_regular_months field to indicate how long that intro price lasts, and a regular price after that. Conversely, if contract_regular_months is shorter than total contract_duration_months, we expect an intro price was in effect for the difference. These rules prevent scenarios like a plan claiming 6 months promo but no promo price given.
* Contract duration consistency: The data model differentiates total contract length vs. the length of any promotional period. We validate these to avoid impossible combinations (e.g., promo duration longer than total contract, or missing regular period data).
* Voucher logic normalization: If an offer comes with a voucher, our model captures its type (absolute amount off, percentage discount, cashback, etc.). A validator auto-sets the voucher type to “PERCENTAGE” if a percentage value is provided. It also separates percentage vs absolute values into different fields. This prevents confusion (only one of voucher_value_percent or voucher_value_cents should be filled for an offer).
* TV package detection: As noted, if the provider’s data indicates a TV service name, we mark that offer as including TV. We also sanitize blank or “false” values in such fields during factory parsing so that tv_package_name is either a meaningful string or None, never an empty string pretending to be a valid name.

**Data Quality Assurance:** We include additional metadata in the Offer model to help the frontend clearly present details and do any final filtering:

* **Youth offers**: If an offer is only for young customers, the max_age field will have a value (e.g., 25 or 28). Our system populates this when provided (some APIs explicitly give a max age for youth tariffs). The frontend can use this (as it does with the Youth filter) to label or filter such offers. Plans with no age limit have max_age = None.
* **Technician installation**: The installation_service_included boolean flags whether a free technician installation is part of the plan. We derive this from provider data (e.g., ByteMe has a field for installation service which we normalize to a bool, PingPerfect indicates if installation fee is included in their JSON, etc.). This helps users see if they might have to pay extra for installation.
* **Data caps**: If an offer has a monthly data cap, we record the cap in GB (data_cap_gb). Unlimited plans are denoted by data_cap_gb = None. During parsing, any “unlimited” or missing cap is set to None, and any numeric cap is kept as an integer. This allows the UI to, for example, display “Unlimited data” vs “100 GB cap” clearly.
* **Promotional periods**: Our model has both contract_duration_months and contract_regular_months. The latter is essentially “after the promo period, how many months are left of contract at regular price.” By setting a default (often equal to total duration if not specified) and validating the combination, we ensure we can always compute things like average monthly cost correctly. For example, if a 24-month contract has 12 promo months at €20 and the remaining 12 months at €30, the model would have contract_duration_months=24, contract_regular_months=12, price_intro=2000, price_regular=3000 (in cents). This consistent representation makes downstream computations (sorting, scoring) straightforward.

Overall, by the time offers reach the frontend, they are validated, normalized objects. Any offer failing these checks would be excluded (and likely logged for analysis). This guarantees that the comparisons and calculations in the UI are based on clean data – e.g., no missing prices, no inconsistent durations, etc. Additionally, it gives us confidence in things like the Recommended sort, which relies on these fields being present.

### 🔗 4.6 Sharing System

A standout feature is the ability to share comparison results via a short link. The backend implements a secure sharing mechanism using encoded slugs and Redis:

* **Slug Generation**: When a comparison is performed, the backend generates a short **slug** (a string token) that encapsulates the results. Under the hood, this slug is an encoding of a payload containing the search parameters (address + filters) and a timestamp. We serialize the payload JSON and compress it with zlib, then base64-url encode it – producing a URL-safe string (no special characters) that’s typically only \~8-12 characters long for an initial search. Each slug is unique (it includes a timestamp or unique offer identifier) so that multiple different searches of the same address will still get different slugs.
* **Redis Storage**: The actual offers corresponding to a slug are stored server-side in a Redis cache. When sending INITIAL or FINAL offers to the frontend, the backend does two things: it sends the slug to the client and concurrently saves the offer list in Redis with that slug as the key. A Time-To-Live (TTL) of 24 hours is set on these cache entries. This means shareable results are available for a day (configurable via an env var) unless refreshed. Redis allows all backend instances (or workers) to share this state.
* **URL Structure**: The slug is included in the frontend’s URL as a route parameter (e.g. /compare/ABC123 where ABC123 is the slug) when a user clicks “Share”. These URLs are clean and contain no query params besides the slug – the slug itself contains any needed context. Opening such a URL triggers the frontend to connect to the backend’s REST endpoint to fetch the data for that slug.
* **Sharing Endpoints**: There are two API endpoints to support sharing:

  * `GET /compare/{slug}` – Returns the offers (and metadata) associated with a slug (if it exists and not expired). The backend will decode the slug, retrieve the cached offers from Redis, and respond with the same structure as a live comparison result. If the slug is invalid or expired, appropriate 400/404 errors are returned.
  * `POST /offers/share-link` – Generates a slug for a single offer out of a comparison. The client uses this when a user wants to share *a specific plan* (not the whole list). The request includes the “original” page slug and an offer key (a combination of provider + product ID). The backend finds that offer in the cached list, creates a new slug for it, stores just that one offer under the new slug, and returns it. This way, when someone opens the single-offer link, the app can highlight or show details for just that one plan.
* **Client Integration**: The frontend receives the slug in real-time via WebSocket messages (slug field) for both initial and final offers payloads. It uses the final offers slug to update the URL (so if the user hits refresh or shares that URL, it can be reconstructed). When loading a page with a slug, the app will call the GET endpoint to load the results. This architecture ensures that even if the app is closed or the user’s session is lost, the slug alone is enough to retrieve the comparison results from the backend.

Security/privacy: The slug is effectively an opaque random token (not guessable, since it’s compressed and encoded data). It’s not reversible without the secret (compression dictionary), and we don’t expose any user personal data in it – it contains address info, but someone with the slug can already fetch the offers which include the address region anyway. The slug approach means we don’t require a database – everything is transient in cache. The 24h expiration balances usefulness with not storing data indefinitely. Also, because the slug includes a timestamp (ts), repeated searches for the same address yield different slugs, so someone cannot scrape old results by guessing a previous slug.

### 💾 4.7 Search & Persistent State

To enhance UX, the application remembers recent user searches and allows quick toggling between them:

* The last 20 search queries are stored in the browser’s **localStorage** (including address and any filters used). This is done entirely client-side for privacy – no account or server storage is involved.
* The frontend provides a “Recent Searches” dropdown menu where the user can see their last searches and re-run them with one click. Choosing a past entry will populate the address field and immediately initiate a new comparison for that address (using the cached providers list on backend for speed, if within the same session).
* This persistent state survives page reloads. It effectively acts like a history for the user, which is useful in a comparison context (e.g., checking offers for a previous address again).
* No explicit limit beyond 20 entries is kept to avoid unbounded growth. Old entries drop off as new ones are added, in FIFO order.

This feature, combined with the shareable links, makes it convenient to conduct multiple comparisons and switch back and forth or share them, which is especially useful for a “find the best offer” scenario.

---

## 5. ☁️ Deployment & Infrastructure

### ⚙️ Backend Deployment (AWS EC2)

* **Containerization**: The backend is packaged as a Docker container for consistency across environments. A Docker Compose configuration defines three services: the FastAPI app, Nginx, and Redis. This allows one-command deployment of the whole stack on any host.
* **Reverse Proxy**: Nginx is used as a reverse proxy in front of the FastAPI (Gunicorn) server. It listens on port 80 and forwards requests to the app on port 8000. It’s configured to handle both HTTP and WebSocket routes (`/ws/compare` upgrade to WS) and serves as a convenient place for SSL termination (in our case, SSL is handled by CloudFront in front, but Nginx could handle it if we enabled port 443).
* **SSL/Security (CloudFront)**: The live API endpoint is behind AWS CloudFront, which provides HTTPS and caching. CloudFront is set up to forward WebSocket traffic and cache static assets (like the OpenAPI docs JSON). It also provides a layer of DDoS protection. In production, the Nginx container could be configured with HTTPS certificates as well, but using CloudFront allowed us to avoid managing certs on the instance.
* **Health Monitoring**: The deployment uses a health check endpoint to manage service availability. The FastAPI app defines a simple `GET /health` endpoint that returns `{"status": "ok"}`. Docker Compose is configured to continuously hit this endpoint (internal localhost) to ensure the app is responsive. Nginx is set to wait until the health check passes before routing traffic to the app. This prevents cold-start issues where Nginx might otherwise try to send requests to an app that isn’t ready. Additionally, this health endpoint can be used by external load balancers or uptime monitors to verify the service health.
* **Scalability**: The backend process is run by Gunicorn with multiple Uvicorn worker processes (by default **4 workers**, tunable via env). This allows the API to handle multiple concurrent requests (or WebSocket connections) in parallel, utilizing multiple CPU cores. For further scaling, the service could be replicated behind a load balancer – since state is not stored on the app server (aside from cache in Redis, which is shared), the app is horizontally scalable. In the current setup, a single EC2 instance is sufficient, but the infrastructure is ready for scaling out if needed (e.g., putting an ALB in front of multiple container instances). Logging and monitoring can be handled via CloudWatch integration (the app logs to stdout/err which Docker captures).

### 🖥️ Frontend Deployment (Vercel)

* **Static Site Generation**: The Next.js frontend is deployed on Vercel, which excels at hosting Next.js apps. We utilize Next’s **build and export** capabilities – the app is built into an optimized bundle. Most pages (the landing and compare page shell) are static or use Server-Side Rendering only for initial load. The dynamic data (offers) is fetched via APIs in the client, so the site can be essentially served as a static SPA after initial load. Vercel handles the CI/CD – every push triggers a build, and the site is served from Vercel’s global CDN for fast performance.
* **Environment Configuration**: The frontend is configured via environment variables for any keys and endpoints. In development, a `.env.local` file provides values. For production, Vercel’s environment variables store:

  * `NEXT_PUBLIC_API_URL` – the base URL of the backend API (e.g., our CloudFront URL). By keeping it in env, we can switch between a local backend and the deployed backend easily.
  * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` – the Google Places API key for address autocomplete. This key is restricted to the domain of our Vercel app (and localhost for dev) to prevent abuse.
    These variables are injected at build time. The frontend does not expose any sensitive secrets – the Google API key is public but restricted, and all provider credentials remain on the backend.
* **Performance Optimizations**: We followed Next.js and general best practices to ensure the frontend is fast:

  * **Code Splitting & Lazy Loading**: Thanks to Next’s App Router and React’s dynamic imports, the JavaScript is split so that only the code needed for the initial view is loaded. Components like the compare results table or provider logos are dynamically loaded when needed.
  * **React Server Components & Suspense**: We leverage React 19’s Server Components for parts of the UI that don’t need to be client-side interactive. This reduces bundle size sent to the browser. We also use Suspense for the address autocomplete component, meaning the UI can gracefully show loading states for that part without blocking the rest.
  * **Caching**: Vercel CDN caches the static assets and Next’s built output. Additionally, the API results themselves aren’t cached on the client (since they’re real-time), but the share link mechanism allows re-using fetched data by slug. Also, the recent searches stored in localStorage mean repeated searches avoid a new Google API call for autocompletion (recent addresses are stored).
  * **Responsive & Lightweight UI**: The UI uses Tailwind CSS which comes with autoprefixing and purging of unused styles, resulting in a very small CSS footprint. There are virtually no large images or heavy libraries in use; even maps are not embedded (we only use the Places API for text autocompletion, not loading map if not necessary). This keeps the page load under a few hundred KB of resources.
  * **Monitoring & Analytics**: (If applicable) We could use Vercel’s analytics or custom logging to measure TTFB and rendering speed. But anecdotally, the app achieves a fast First Contentful Paint due to minimal blocking scripts.

Overall, the deployment architecture ensures that the system is **robust** (with health checks and container orchestration), **secure** (with no credentials in client code and HTTPS everywhere), and **performant** (CDN delivery, parallel backends, optimized frontend).

## 6. 📚 API Documentation

The application provides an OpenAPI 3.0 specification accessible via the `/docs` endpoint (Swagger UI) on the backend. This interactive documentation lists all endpoints, request/response models, and schemas in detail. Below is a summary of key API endpoints and their usage:

* **📡 WebSocket Endpoint**: `GET /ws/compare` (Upgradable to WebSocket) – This is the real-time comparison endpoint. Clients open a WebSocket connection to this URL. After connection, the client **must send a JSON payload** containing the address and optional filters to initiate a comparison. The payload adheres to the `WsCompareAddressRequest` schema, for example:

  ```json
  {
    "street": "Some St",
    "house_number": "123",
    "plz": "80331",
    "city": "Munich",
    "providers": ["WebWunder","ByteMe"],
    "wants_fiber": false
  }
  ```

  The server will respond by streaming a sequence of messages. Two primary message types are:

  * **INITIAL_OFFERS** – sent once the first phase results are ready (see Section 4.1). Contains a partial list of offers (offers array), a slug, and flag will_refine=true (if more results will follow).
  * **FINAL_OFFERS** – sent at the end of the second phase (or immediately if all data returned quickly). Contains the complete list of offers (which may be the same as initial plus any late arrivals) and a final slug, with will_refine=false.

  Additionally, the server may send:

  * **STATUS** updates (type field could be e.g. "STATUS") to indicate progress (for example, when each provider returns). These contain a message or perhaps a provider_name and notifies the client of events like “PingPerfect offers received” or similar. *(Note: The exact shape of status messages can be inferred from the `WsMessage` schema, which includes optional message and provider_name fields.)*
  * **ERROR** message – if something goes wrong. For instance, if the input payload is invalid, the server will send a message with type: "ERROR" and a human-readable error in the message field, and then close the socket. If address validation fails (like an invalid postal code for the city), an ERROR is sent with details in a validation_issues field, then the connection closes.

  The WebSocket stays open until the FINAL\_OFFERS is sent, then the server closes it (or it can be kept open for re-use, but our client currently closes after final). The client does not need to send anything after the initial request; all data flows from server to client.

* **🌐 REST Endpoints**:

  * `GET /health` – Simple health check endpoint. Returns 200 OK with `{"status":"ok"}` if the service is up. Used internally for container orchestration and can be used by external monitors.
  * `GET /compare/{slug}` – Retrieve cached comparison results by slug (for shared links). On success, returns a JSON with the same structure as the WebSocket final response: e.g., `{ slug: "...", offers: [ ... ], address: {...} }` (address is included for convenience). If the slug is not found or expired, returns 404. If the slug format is invalid (e.g., a random string), returns 400.
  * `POST /offers/share-link` – Create a share-link for a single offer. The client must send JSON like `{ "original_page_slug": "<slug>", "offer_key": "ProviderName:ProductId" }`. If the original slug is valid and that offer exists, the response will be `{"shared_slug": "<newSlug>"}` which can be used in `/compare/{shared_slug}` to retrieve just that one offer. Use case: user clicks “share this plan” on the frontend.
  * `GET /docs` and `GET /redoc` – These serve the API’s Swagger UI and ReDoc documentation respectively. They are available in deployment (the CloudFront link provided).

  All GET endpoints are idempotent and side-effect free. The only POST (`/offers/share-link`) does not modify data on the server beyond writing to cache and is safe to call.

* **🔑 Authentication**: There is **no authentication required** for end-users of the API – it’s open for the frontend to consume. (In a public deployment, one might enforce an API key or rate limiting, but for this coding challenge it’s not necessary.) We do enforce CORS so that only our frontend’s domain can call the APIs from a browser. All sensitive provider credentials are on the server side. Each provider request is authenticated with API keys or basic auth as needed (managed by our CredentialManager and settings), but this is transparent to clients. In summary, users can access the comparison API without login, and providers are accessed securely by the backend with credentials that are never exposed.

## 7. 🧪 Testing Strategy

The project includes an extensive test suite to ensure code reliability and correctness. We aimed for both broad **coverage** and meaningful **scenario testing**:

* **Unit Tests**: For most modules (especially data processing ones), we have isolated unit tests. Each provider integration has tests (e.g., `tests/providers/test_webwunder_provider.py`, etc.) that simulate API responses and verify that we correctly parse and handle them – including edge cases like empty results or error responses. Factories and validators are also tested (for example, ByteMe’s factory is fed sample CSV rows to ensure the cleaning logic drops bad entries and deduplicates properly). We used **Pytest** fixtures and hypothesis strategies in places – for instance, generating random address inputs to feed the address validator to ensure it catches invalid combinations. The Offer model’s validators are tested with combinations of fields to confirm that invalid data raises errors (e.g., missing prices, mismatched durations).
* **Integration Tests**: Higher-level tests exercise the system workflow end-to-end in a controlled setting. We utilize FastAPI’s TestClient to simulate API calls. For example, there’s a test for the full WebSocket flow (`test_comparison_service.py`) that injects dummy provider classes (monkey-patching the real providers) which return known values with delays – then it asserts that the WebSocket messages come in the correct order (INITIAL then FINAL), with the expected merged offers. We also test the sharing logic in integration: calling the compare endpoint, then using the returned slug to call the share endpoints, verifying that the data matches. These tests ensure that all pieces (caching, slug encoding/decoding, routing) work together.
* **API Mocking**: External provider APIs are **never called** in our tests. We mock them out using a few techniques. For REST providers, we often monkey-patch the `httpx.AsyncClient.get/post` within that provider’s context to return a predefined Response object (with sample JSON/XML/CSV). For example, in WebWunder tests, we load a sample SOAP XML from file and have the httpx call return it as if it were from the API. For VerbynDich, we monkey-patch `_fetch_page` to return canned JSON for page 1, 2, etc., then test that our logic stops at the right time. By simulating various scenarios (including timeouts or exceptions by raising in the mock), we confirm our retry and circuit logic – e.g., we can force 5 failures and then ensure `is_allowed()` returns False thereafter. This approach gives us confidence that even error paths work as designed, without actually hitting third-party services during tests.
* **Test Coverage**: We achieved high coverage: **100% of files** have been exercised by tests, and about **94% of lines** of code are covered by the test suite. This includes practically all critical logic (the small percentage of uncovered lines are mostly log messages and exception branches that are hard to trigger). The coverage report was generated using the `coverage.py` tool and validates that our tests are thorough. This high coverage was important given the complex flows (retries, websockets, etc.) – it helps ensure that edge cases (like a provider never responding, or a slug expiring) have been considered. We also run these tests in CI to prevent regressions on future code changes.

In summary, the testing strategy combines fine-grained unit tests for data handling with full-path integration tests for the core user flows. The result is a robust codebase where we can refactor with confidence and be assured that the comparison logic, error handling, and sharing features all work as intended under various conditions.

## 8. 🔒 Security Considerations

* **Credential Management**: All provider API credentials (keys, secrets, usernames, etc.) are stored in environment variables and loaded via our CredentialManager which wraps them in Pydantic SecretStr objects. This means that even within the running application, the credentials aren’t easily printable (if logged accidentally, they appear as ********). We never hard-code secrets in the repo. This reduces the risk of leakage. Additionally, the `.env` files are listed in `.gitignore` to avoid committing any secrets. The backend only exposes the data retrieved, never the credentials themselves.
* **API Key Restrictions**: The only API key used in the frontend is for Google Places, which is restricted to our domain (and localhost for dev) in the Google Cloud Console. Thus, it cannot be misused from other origins. All other third-party API keys stay on the backend (never sent to client). The providers identified by key (WebWunder, ByteMe, PingPerfect, VerbynDich) all have their keys stored server-side; even the PingPerfect HMAC secret never leaves the server (only the resulting signature does).
* **Input Sanitization & Validation**: We treat all user inputs (addresses, etc.) as untrusted. FastAPI + Pydantic automatically parses and validates JSON inputs against schemas. This means if a required field is missing or a field is of the wrong type, the API will reject the request with a clear 422 error. We further perform domain-specific validation on addresses (the `AddressValidator.validate_address` routine checks for things like valid postal code format and plausible city name matches) – any violations result in an error message sent back to the user. Because we do not directly interface with a database (no SQL injection vector) and we carefully validate and encode outputs, the typical web injection attacks are largely mitigated. For example, even the slug encoding uses JSON and base64, so there’s no chance of special characters causing scripting issues in URLs.
* **CORS Configuration**: By default, our FastAPI app is configured with a permissive CORS policy during development (allowing `*` origins and common methods). However, in production deployment we restrict it to the specific frontend origin. This ensures that third-party sites cannot directly make XHR/WebSocket requests to our API (browsers will block them if origin doesn’t match). Since our API is public, CORS is the main mechanism preventing abuse via browsers. (Server-to-server calls are still possible, but those could be rate-limited or protected behind an API gateway if needed in a real product.)
* **Sensitive Data in Transit**: All communication between frontend and backend is over HTTPS (enabled via CloudFront). WebSocket connections are upgraded under that same TLS. So address data and offers are encrypted in transit. We do not transmit any personally identifiable information aside from the address the user inputs (which is necessary for the service).
* **Logging**: We avoid logging sensitive information. Provider credentials never appear in logs. We do log addresses and query parameters for audit/debug, which is acceptable for this application (address is not highly sensitive). If needed, we could mask parts of the address in logs.

In summary, the application follows security best practices relative to the scope: no leaked secrets, strict input validation, limited exposure of functionality (only what’s needed for the frontend), and secure communications. The result is a service that can be used by end users confidently without risking data exposure or integrity issues.

## 9. ⚡ Performance Optimizations

* **Caching Strategy**: The backend employs caching at strategic points. The primary cache is the Redis store for completed offer lists (keyed by slug). This yields two benefits: (1) It makes the share link feature efficient (loading a slug is a simple O(1) Redis GET, no recomputation or provider calls), and (2) it can act as a short-term memory for repeated searches. For example, if the same address is searched twice within the cache TTL, the second time we could theoretically short-circuit and use the cached offers (though currently the app triggers fresh searches unless using the share slug). We also use in-memory caching for VerbynDich page fetches (an LRU so we don’t refetch the same page twice in a session). Aside from data caching, we also cache the OpenAPI schema generation (FastAPI does this by default) so that docs load quickly.
* **WebSocket Efficiency**: Moving to a WebSocket push model greatly reduces overhead compared to polling. Instead of the client hammering the server for updates or making five separate provider requests from the browser, it does one lightweight WebSocket handshake and one request. The backend fan-out to providers is done server-side (which is faster due to proximity and async IO), and results are pushed in a compact form. This not only improves latency but also lowers load: one persistent connection is cheaper than many short HTTP requests. Additionally, because we send incremental results, the user might even cancel the operation early (e.g., they got a result they like from the initial offers and leave) which means we might abort pending provider tasks, saving work. The WebSocket also allows us to stream status messages (like “Still waiting on ServusSpeed...”) without any extra client effort.
* **Frontend Optimizations**: We paid attention to frontend performance:

  * **Next.js optimizations**: using the App Router means a lot of the UI is server-rendered or statically rendered. This leads to smaller JS bundles. We also used Next’s Image and Script optimization for any external assets (though our app has virtually no external scripts other than Google Places).
  * **Minimal re-renders**: The React components are optimized to only render when necessary. For example, the offer list is memoized and only updates when new offers arrive or filters change (using hooks like useMemo and useOfferProcessing to avoid heavy computations each render).
  * **Debounced user input**: The address autocomplete input is debounced so that we don’t fire too many Google API calls on every keystroke. This improves perceived speed and avoids hitting rate limits.
  * **CDN and Compression**: Vercel serves our assets with gzip/brotli compression and via a global CDN. Our static assets (JS/CSS) are cached and very small (the entire site’s JS is on the order of a few tens of KB after tree-shaking). Time-to-first-byte is low because our pages are pre-rendered. We also leverage HTTP/2 for multiplexing resource loads.

In load-testing, the backend can handle multiple simultaneous WebSocket comparisons thanks to async IO (each additional connection incurs minimal overhead, and Gunicorn’s worker model can utilize CPU for parsing/merging). The bottleneck usually lies in provider response times, which we mitigated via the two-phase approach and parallelism. On the frontend, using the modern React/Next stack means we capitalize on framework optimizations out of the box – and the site remains responsive even as dozens of offers are rendered and manipulated.

Overall, these optimizations ensure that the application feels **snappy and scalable**: users get results quickly, and the system can handle a growing load with intelligent use of resources.
