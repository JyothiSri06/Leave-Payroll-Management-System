# 🏢 Scalable Multi-Tenant Leave & Payroll Management ERP (PERN + Redis)

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Multi--Tenant-blue.svg)
![Redis](https://img.shields.io/badge/Redis-Cache--Aside-red.svg)
![Architecture](https://img.shields.io/badge/Architecture-ACID--Compliant-purple.svg)

A high-performance enterprise Employee Resource Planning (ERP) platform featuring **multi-tenant PostgreSQL isolation**, **Redis cache-aside performance optimization**, **automated idempotent payroll pipelines**, **concurrency race-condition prevention**, **ACID transactions**, and an **AI-driven HR compliance assistant**.

> **💡 Technical Interviewer Quick-Start:**  
> Demo accounts are seeded out of the box across multiple tenants:
> - **Acme Corp Admin:** `john@example.com` / `password123`
> - **Acme Corp Employee:** `employee@example.com` / `password123`
> - **Globex Corp Admin:** `alice@globex.com` / `password123` (Isolated Tenant B)

---

## 🏗️ System Architecture

```
                                +-----------------------------------+
                                |     React.js Client Application   |
                                |       (Vercel / Port 5173)        |
                                +-----------------+-----------------+
                                                  |
                                                  | HTTP / REST (JWT + Tenant Header)
                                                  v
                                +-----------------+-----------------+
                                |     Node.js / Express.js API      |
                                |     (Render / Middleware Layer)   |
                                +--------+-----------------+--------+
                                         |                 |
                         Cache Lookup    |                 | SQL Queries (ACID Transactions)
                       (Cache-Aside)     v                 v
                       +-----------------+---+     +-------+-------------------+
                       |    Redis Cache      |     |  PostgreSQL Database      |
                       | (In-Memory / TTL)  |     |  (Multi-Tenant Isolated)  |
                       +---------------------+     +---------------------------+
```

---

## 🔄 Core Workflows & Data Flows

### 1. Multi-Tenant Authorization & Isolation Flow
- **Tenant Context Extraction:** Upon login, JWT payload embeds `{ id, tenant_id, role, email }`.
- **Query Scoping:** Backend `requireTenant` middleware enforces `WHERE tenant_id = req.user.tenant_id` on **100% of data access queries**, preventing cross-tenant data leaks at the database layer.

### 2. High-Frequency Redis Cache-Aside Pattern
```
Client Request ---> API Middleware ---> Redis Lookup (Key: tenant:{tid}:employee:{id})
                                              |
                                      +-------+-------+
                                      |               |
                                  Cache Hit       Cache Miss
                                      |               |
                               Return Cached Data     v
                                          PostgreSQL Query
                                              |
                                          Store in Redis (TTL 1h)
                                              |
                                          Return Response
```
- **Write Invalidation:** Any update (`PUT /api/employees/:id`) explicitly purges related Redis keys (`safeCache.del(...)`), preventing stale data propagation.

### 3. Automated & Idempotent Payroll Pipeline
- **Idempotency Guarantee:** Structural database constraint `UNIQUE(tenant_id, employee_id, pay_period_start, pay_period_end)` guarantees duplicate execution attempts perform safe UPSERTs instead of creating phantom financial records.
- **Formula:** 
  $$\text{Gross Pay} = \text{Fixed Salary (Basic + HRA + Special)} + \text{Overtime Pay} + \text{Bonus}$$
  $$\text{Net Pay} = \text{Gross Pay} - (\text{PF} + \text{PT} + \text{ESI} + \text{TDS (Tax)} + \text{LOP Deductions} + \text{Late Deductions})$$

---

## ⚡ Measured Performance Benchmark

A reproducible automated benchmark script (`server/scripts/benchmark.js`) measures read throughput and latency reduction comparing direct PostgreSQL queries against Redis cache-aside reads under identical load (100 iterations):

| Metric | Baseline (PostgreSQL Direct) | Redis Cache-Aside Layer | Performance Improvement |
| :--- | :--- | :--- | :--- |
| **Average Latency** | `2.091 ms` | `0.002 ms` | **>99.9% Latency Reduction** |
| **p95 Latency** | `1.778 ms` | `0.001 ms` | **99.9% Improvement** |
| **Cache Hit Rate** | N/A | `100.0%` | Peak Throughput Boost |

> *To execute locally:* `cd server && node scripts/benchmark.js`

---

## 🛡️ Reliability & Resilience Engineering

1. **ACID Database Transactions (`withTransaction`):** All multi-step workflows (e.g. Leave Approval + Balance Deduction, Payroll Processing, Salary Revision) are wrapped inside explicit PostgreSQL transactions (`BEGIN ... COMMIT ... ROLLBACK`).
2. **Race-Condition Prevention (Row Locking):** High-concurrency balance updates execute `SELECT ... FOR UPDATE` row locks, preventing race conditions or balance over-drafting during simultaneous requests.
3. **Graceful Redis Fallback:** The custom cache wrapper (`src/utils/cache.js`) traps connection errors and gracefully falls back to in-memory pass-through without interrupting primary API request execution.
4. **Enhanced Health Monitoring (`/health`):** Active readiness probe checking database pool connectivity, Redis cluster status, system uptime, and memory status.
5. **Graceful Server Shutdown:** Listener hooks on `SIGTERM` / `SIGINT` flush pending transactions and gracefully close connection pools.

---

## 🔒 Security Architecture & PII Protection

- **Stateless JWT & bcrypt:** Passwords hashed using bcrypt (10 salt rounds). JWT expiration set to 8 hours.
- **Role-Based Access Control (RBAC):** Express middleware `requireRole(['ADMIN'])` and `requireSelfOrAdmin()` prevent non-admin employees from accessing organizational data or another employee's salary records.
- **PII Exposure Guard:** Database queries strip `password` hashes and reset tokens before returning JSON objects.
- **Tenant-Aware Audit Logging (`audit_logs`):** Structured audit logger records actor, tenant, action, entity, timestamp, and sanitized diffs (automatically redacting sensitive fields like passwords).

---

## 🛠️ Verification & Test Suite

The repository includes comprehensive Jest test suites covering key engineering claims:

```bash
cd server
npm test
```

- `tests/auth.test.js`: Validates JWT creation, expiry, invalid password rejection, and RBAC middleware.
- `tests/tenant_isolation.test.js`: Proves Tenant A cannot access Tenant B employees, payroll, or leaves.
- `tests/payroll.test.js`: Verifies net pay calculation accuracy and idempotent duplicate run handling.
- `tests/concurrency.test.js`: Validates row locking and race condition prevention during concurrent leave approvals.

---

## 🎯 Technical Interview Defense Guide (Nokia / PBC Focus)

#### 1. "How is Multi-Tenancy implemented?"
> *"We implemented shared-database, tenant-discriminator-column multi-tenancy. Every table includes `tenant_id` linked via foreign keys. The tenant ID is embedded in the cryptographically signed JWT token upon login. Backend authorization middleware (`requireTenant`) attaches `tenant_id` to every database query, ensuring tenant isolation is structurally enforced at the data layer rather than relying on UI filtering."*

#### 2. "What happens if Redis goes down?"
> *"Our Redis cache module is wrapped in a fail-safe proxy (`safeCache`). If the Redis connection drops or throws an exception, it logs a warning and transparently passes reads and writes through to PostgreSQL or local in-memory fallback. The application continues functioning without throwing HTTP 500 errors to end users."*

#### 3. "How do you prevent race conditions during leave approval or salary updates?"
> *"We use PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) inside an explicit transaction block (`withTransaction`). When an admin approves a leave request or updates salary, the database locks the targeted row until the transaction completes, preventing concurrent requests from reading stale balances or overriding data."*

---

## 💻 Local Setup Instructions

```bash
# 1. Clone repository
git clone https://github.com/JyothiSri06/Leave-Payroll-Management-System.git
cd Leave-Payroll-Management-System

# 2. Setup & Seed Backend
cd server
npm install
node setup_local_db.js
npm run dev

# 3. Setup Frontend
cd ../client
npm install
npm run dev
```

---

*Designed and engineered as a demonstration of high-throughput, multi-tenant enterprise software patterns.*
