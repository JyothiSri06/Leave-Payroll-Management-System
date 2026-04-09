# Target: Product-Based Companies (PBC)

Product-based companies (like Amazon, Uber, Atlassian) don't just want to see that you know a framework. They want to see **System Design thinking, Performance, Security, and Edge-Case handling**. 

Below are highly-engineered bullet points designed specifically to pass elite ATS systems and grab the attention of PBC Hiring Managers.

---

**Project Title:** Scalable Payroll & HR Automation ERP  
**Tech Stack:** React, Node.js, Express, PostgreSQL, Redis, JWT, Zod

### Option 1: The "Backend / Systems Engineering" Focus
*(Best if you are applying for SDE-1 or Backend heavy roles)*

* **Scalable Architecture:** Designed and deployed a full-stack HR ERP system (PERN stack), modeling complex relational database schemas in PostgreSQL to handle multi-tenant employee records and region-specific tax slabs.
* **Concurrency & Safety:** Engineered end-of-month payroll pipelines using automated background Cron jobs, leveraging SQL transactional locks and constraints to eliminate race conditions during concurrent leave accruals.
* **Performance Optimization:** Implemented a Redis in-memory caching layer for high-frequency dashboard queries, reducing theoretical database hits and optimizing API latency under heavy read workloads.
* **Security Hardening:** Secured the authentication pipeline by implementing strict bcrypt payload hashing, stateless JWT session verification, and schema validation via Zod to prevent SQL injection and malformed logic attacks.

### Option 2: The "Product / Full-Stack" Focus 
*(Best if you are applying for Full-Stack or Generalist SWE roles)*

* **End-to-End Delivery:** Architected a high-performance Payroll Management System replacing manual data entry with automated logic for daily attendance tracking, cascaded leave approvals, and dynamic net-pay calculations.
* **AI Product Integration:** Decreased manual HR query load by integrating the Google Gemini Large Language Model (LLM), engineering a contextual chatbot capable of parsing localized tax guidelines and company compliance policies conversationally.
* **Frictionless UX & Deployment:** Deployed the API (Render) and client (Vercel) serverlessly, engineering an intentional "One-Click Demo Authentication" architecture that bypassed registration friction to maximize stakeholder/recruiter engagement.
* **State Management:** Built a responsive, glass-morphic enterprise UI using React and TailwindCSS, managing highly complex, nested application state for multi-role viewing environments (Admin Dashboards vs Employee Self-Service).

---

### 🔥 Pro-Tip for PBC Interviews:
If an interviewer from a Product-Based Company reads these, expect them to ask you:
1. *"Why did you choose PostgreSQL over MongoDB?"* (Answer: Payroll requires ACID transactions and strict schemas. If a payroll calculation fails halfway, it needs to rollback completely).
2. *"What happens if Redis goes down?"* (Answer: Explain how your cache layer is designed to gracefully fallback to hitting the primary database and not crash the whole app).
