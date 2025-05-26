


# GenDev7 Internet Provider Comparison

## 1. Project Overview & Live Demo

**Responsive Web Application for Internet Provider Comparison**

This modern web application enables users to enter any address and instantly compare real-time internet offers from 5 different providers. Built with a focus on reliability and user experience, it handles API failures gracefully while delivering comprehensive comparison data through an intuitive interface.

### 🚀 **Live Demo Links**

* **Frontend**: [https://gendev-web.vercel.app/](https://gendev-web.vercel.app/)
* **Backend API**: [https://d61c7czwgnmbn.cloudfront.net](https://d61c7czwgnmbn.cloudfront.net)
* **API Documentation**: [https://d61c7czwgnmbn.cloudfront.net/docs](https://d61c7czwgnmbn.cloudfront.net/docs)

### 📁 **Repository Structure**

Frontend and backend were developed independently in separate repositories for optimal development workflow, then merged using git subtree for unified submission to maintain clean commit history and modular architecture.

## 2. Challenge Requirements Compliance ✅

### **Minimum Requirements Met:**

* ✅ **Robust API Failure Handling**: WebSocket with intelligent 2-phase timeout system, Tenacity retry logic with exponential backoff, Circuit breaker pattern for provider resilience
* ✅ **Comprehensive Sorting & Filtering**: 5 sorting algorithms including intelligent recommendation engine, multi-criteria filtering by provider, speed, duration, connection type, and pricing
* ✅ **Advanced Share Link Feature**: Slug-based sharing with Redis storage (24h TTL, configurable), supports both complete search results and individual offer sharing with query parameter preservation
* ✅ **API Credentials Security**: Environment-based credential manager with SecretStr encryption, zero credential exposure to frontend

### **Optional Features Implemented:**

* ✅ **Address Autocompletion**: Google Places API integration with domain-restricted API keys
* ✅ **Comprehensive Input Validation**: Pydantic models for backend validation, additional frontend address validation with error handling
* ✅ **Persistent Session State**: Recent searches stored in localStorage with seamless navigation between previous searches

## 3. Architecture Overview

### System Architecture Diagram

\[Add architectural diagram showing Frontend ↔ Backend ↔ APIs ↔ Redis flow]

### Technology Stack

**Backend:**

* FastAPI (Python)
* Pydantic for typing
* Pytest for testing
* Docker + Docker Compose
* Redis for caching
* Nginx reverse proxy
* Gunicorn WSGI server

**Frontend:**

* Next.js with App Router
* TypeScript
* TailwindCSS + ShadCN/UI
* Google Places API
* Prettier formatting
## 4. Core Features & Implementation

### 4.1 Real-Time Provider Comparison

* **WebSocket Implementation**: Bi-directional real-time communication enabling instant updates as providers respond.
* **Intelligent Two-Phase Loading System:**

  * **Phase 1**: Completes within 10 seconds or when all providers except ServusSpeed (empirically the slowest) respond.
  * **Phase 2**: Handles ServusSpeed with an extended timeout; skipped if user selects a single provider.
* **Performance Benefits**: Immediate visibility of offers from faster providers prevents UI blocking, enhancing perceived performance.

### 4.2 Advanced Error Handling & Resilience

#### **Tenacity Retry Logic**

The system employs a sophisticated retry strategy using the Tenacity library, ensuring robust handling of transient errors during provider fetch operations.

**Key Retry Configuration:**

* **Attempts**: Default of **8 attempts** per provider call.
* **Wait Strategy**: Exponential backoff starting at **0.1s**, doubling with each retry up to a maximum of **1 second** between attempts, minimizing load on provider APIs.
* **Exception Handling**: Retries occur specifically on `ProviderError` and `httpx.HTTPError` exceptions, capturing both logical errors and network issues.
* **Logging**: Detailed debug logs provide retry attempt information, aiding in troubleshooting and performance analysis.

**Example Retry Flow:**

```plaintext
Attempt 1 → Fail → Wait 0.1s
Attempt 2 → Fail → Wait 0.2s
Attempt 3 → Fail → Wait 0.4s
Attempt 4 → Fail → Wait 0.8s
Attempt 5 → Fail → Wait 1.0s (max)
... up to Attempt 8
```

#### **Circuit Breaker Pattern**

To further enhance resilience, a circuit breaker pattern is integrated to prevent cascading failures and ensure graceful degradation.

**Circuit Breaker States:**

* **Closed**: Normal operation, requests flow freely.
* **Open**: Triggered after a provider exceeds **5 consecutive failures**, temporarily halting further requests.
* **Half-Open**: Activated after a configurable **30-second recovery timeout**, allowing limited test requests to verify recovery.

**State Transitions:**

* **Closed → Open**: 5 consecutive provider failures.
* **Open → Half-Open**: After a 30-second pause.
* **Half-Open → Closed**: Upon 3 consecutive successful health checks.
* **Half-Open → Open**: Single failure during the half-open test phase.

#### **Provider Pattern**

* Abstract base classes (`ProviderBase`) encapsulate shared logic for handling retries, circuit breaker integration, and consistent error handling.
* Each provider implements the abstract `fetch` method for custom logic.

### 4.3 Intelligent Sorting & Filtering System

#### **Sorting Options:**

* **Recommended**: Multi-factor algorithmic scoring considering cost efficiency, speed-to-price ratio, contract flexibility, provider reliability, and feature completeness.
* **Price (Low to High)**: Sorted ascending after promotional adjustments.
* **Speed (High to Low)**: Sorted descending by Mbps.
* **Contract Duration (Short to Long)**: Ascending by months.
* **Provider (A-Z)**: Alphabetical order.

#### **Filter Categories:**

* **Contract Durations**: User-selectable durations.
* **Connection Types**: DSL, Fiber, Cable, Mobile.
* **Minimum Speed**: Adjustable thresholds.
* **TV Inclusion**: Filter presence of TV packages.
* **Provider Selection**: Multi-select.
* **Youth Offers**: Special discounts targeting youth and students.

### 4.4 Provider Integration Details

**Providers and Special Handling:**

* **WebWunder**: SOAP/XML, specific XML validation.
* **ByteMe**: CSV parsing with duplicate checks.
* **PingPerfect**: REST API with HMAC-SHA256 authentication, fiber-specific offers.
* **VerbynDich**: String pagination handling.
* **Servus Speed**: RESTful API with basic authentication, empirically slower response.

### 4.5 Data Validation & Offer Processing

**Offer Structure Validation:**

* Prices as integer (EUR-cent) for monetary precision.
* Mandatory fields enforced: provider, plan, speed, pricing.
* Normalization of connection types (case-insensitive mapping).
* Cross-field validation for consistency.

**Business Logic Validation:**

* Ensures valid pricing logic (introductory, regular pricing).
* Checks contract duration consistency.
* Voucher logic (percentage, cashback).
* Detects TV packages from naming.

**Data Quality Assurance:**

* Validates youth offers and age restrictions.
* Tracks technician installation inclusion.
* Manages data caps clearly.
* Controls promotional period logic.

### 4.6 Sharing System

* **Slug Generation**: Short, unique identifiers created via hashing of address and selected filters.
* **Redis Storage**: JSON storage with a 24-hour TTL for shared data.
* **URL Structure**: Clean, query-param-friendly URLs.
* **Single/Bulk Sharing**: Dedicated endpoints for specific or complete results.

### 4.7 Search & Persistent State

* Recent searches stored in `localStorage` (maximum 20 entries).
* Easy navigation and quick retrieval between previous searches.


---

## 5. Deployment & Infrastructure

### Backend Deployment (AWS EC2)

* **Containerization**: Docker Compose setup
* **Reverse Proxy**: Nginx configuration
* **SSL/Security**: CloudFront integration
* **Health Monitoring**: \[Specify health check endpoints and monitoring]
* **Scalability**: \[Explain Gunicorn worker scaling, load balancer potential]

### Frontend Deployment (Vercel)

* **Static Site Generation**: \[Explain build process]
* **Environment Configuration**: \[API endpoints, Google Places API key handling]
* **Performance Optimizations**: \[List specific optimizations implemented]

## 6. API Documentation

* **OpenAPI Specification**: Available at `/docs` endpoint
* **WebSocket Endpoints**: \[Document WebSocket connection and message formats]
* **REST Endpoints**: \[List key endpoints with brief descriptions]
* **Authentication**: \[Explain any API authentication for external access]

## 7. Testing Strategy

* **Unit Tests**: Pytest implementation for \[specify coverage areas]
* **Integration Tests**: \[List key integration test scenarios]
* **API Mocking**: \[Explain provider API mocking for tests]
* **Test Coverage**: \[Add coverage percentage if available]

## 8. Security Considerations

* **Credential Management**: Environment variables with SecretStr
* **API Key Restrictions**: Google Places API key domain restrictions
* **Input Sanitization**: Pydantic validation preventing injection attacks
* **CORS Configuration**: \[Explain CORS setup for frontend-backend communication]

## 9. Performance Optimizations

* **Caching Strategy**: Redis implementation for \[specify what's cached]
* **WebSocket Efficiency**: Real-time updates reduce polling overhead
* **Frontend Optimizations**: \[List specific Next.js optimizations]
* **Database Considerations**: \[Mention potential database integration for offer tracking]

## 10. Development Setup & Installation

### Prerequisites

* \[List required software versions: Node.js, Python, Docker, etc.]

### Backend Setup

```bash
[Add step-by-step setup commands]
```

### Frontend Setup

```bash
[Add step-by-step setup commands]
```

### Environment Configuration

* \[List required environment variables]
* \[Provide .env.example files]

## 11. Usage Examples

### Basic Search Flow

\[Add screenshots or step-by-step user flow]

### Sharing Features

\[Show examples of shared URLs and how they work]

### API Usage Examples

\[Provide curl commands or code snippets for key endpoints]

## 12. Known Limitations & Future Improvements

### Current Limitations:

* \[List any known issues or limitations]

### Potential Improvements:

* **Enhanced Caching**: Address and provider response caching (conflicted with "actual offers" requirement)
* **Database Integration**: Offer tracking and historical data
* **Expanded Test Coverage**: \[Specify areas needing more tests]
* **Additional Providers**: Framework ready for new provider integration

## 13. Troubleshooting

### Common Issues:

* \[List common setup/runtime issues and solutions]

### Debug Information:

* \[Explain logging setup and how to access logs]

## 14. Contributing Guidelines

* **Code Style**: Prettier configuration and TypeScript standards
* **Adding New Providers**: \[Explain abstract base class requirements]
* **Testing Requirements**: \[Specify testing standards for contributions]

## 15. Technical Decisions & Trade-offs

### Why WebSockets over REST?

\[Explain real-time update benefits for slow providers]

### Why Two-Phase Loading?

\[Explain ServusSpeed timeout strategy]

### Architecture Choices:

\[Explain key architectural decisions and their benefits]

## 16. Contact & Support

* **Demo Access**: \[Provide demo credentials if needed]
* **Repository Access**: Private repo with [gendev@check24.de](mailto:gendev@check24.de) access
* **Questions**: \[Contact information]

---

## Missing Elements to Add:

1. **\[Screenshots/Demo GIFs of the application in action]**
2. **\[Specific performance metrics - response times, success rates]**
3. **\[Detailed error handling examples for each provider]**
4. **\[Code quality metrics - test coverage percentages]**
5. **\[Specific validation rules for offer filtering]**
6. **\[Exact retry and timeout configurations]**
7. **\[Monitoring and logging setup details]**
8. **\[Load testing results or performance benchmarks]**
9. **\[Specific examples of handled edge cases]**
10. **\[Version numbers and dependency specifications]**
