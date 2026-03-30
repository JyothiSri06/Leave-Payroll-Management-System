# 🏢 Leave + Payroll Management System (PERN Stack)

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-blue.svg)

A comprehensive Employee Resource Planning (ERP) solution designed for intuitive staff management, real-time attendance tracking, automated leave accruals, and precise payroll processing. Integrated with an **AI-driven compliance bot** for seamless HR policy querying.

> **💡 Recruiter & Reviewer Note:** This project features **One-Click Demo Accounts**. You do not need to register. Simply navigate to the Login page and click **"Demo Admin"** or **"Demo Employee"** for instant access to the respective portals.

---

## ✨ Key Features & Technical Highlights

* **Automated Payroll Engine:** Applies complex business logic dynamically (e.g., 3 lates = 1 day pay cut, automatic LOP deduction for excess leaves).
* **AI-Powered HR Assistant:** Integrated with Gemini API to parse complex tax or policy queries (e.g., "Explain my tax deduction") directly within the employee portal.
* **Smart Attendance System:** One-click Clock In/Out with sub-minute accuracy, dynamically tracking "Late" and "Overtime" thresholds.
* **Automated Cron Jobs:** Backend services run automatically to credit monthly leaves (Sick: 1, Casual: 1, Earned: 1.25) and execute scheduled database backups.
* **Secure Audit Logging:** Database triggers automatically record every salary adjustment or payroll generation to guarantee tamper-proof security histories.
* **Responsive Visuals:** Built entirely with Tailwind CSS, supporting dark-mode and providing an enterprise-grade glassmorphic aesthetic.

---

## 🏗️ Project Architecture & Tech Stack

- **Frontend**: React 19 (Vite), Tailwind CSS, Context API, Lucide Icons, Chart.js.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL (Relational Data & Schema Triggers).
- **Authentication**: JWT Strategy.
- **AI Integration**: Google Gemini API.

---

## 📸 Platform Previews

### Admin Command Center
*(Add a screenshot of the Admin Dashboard here: `![Admin Dashboard](./screenshots/admin.png)`)*
Provides Admins with top-down control over payroll generation, manual salary interventions, organization-wide attendance, and one-click leave request approvals.

### Employee Self-Service Portal
*(Add a screenshot of the Employee Portal here: `![Employee Portal](./screenshots/employee.png)`)*
Empowers employees with daily attendance statistics, leave balances, an interactive payslip generator, and direct access to the AI HR assistant.

---

## 💾 Core Database Schema Models

#### 1. Employees (`employees`)
Stores strict personal data, authentication details, role (`ADMIN` or `EMPLOYEE`), and detailed salary configurations (Basic, HRA, Special Allowances). Linked to region-specific `tax_configuration` tables.

#### 2. Leave Management (`leave_balances` & `leave_ledger`)
Calculates cascading totals per leave-type (Sick, Casual, Earned). Handled transactionally to prevent race conditions during end-of-month processing.

#### 3. Payroll Records (`payroll_runs`)
Maintains historical, immutable records of all processed pay runs, including exact gross pay, deduction itemizations (PF, PT, ESI, Income Tax), and net payouts. 

---

---
 
 ## 🚀 Getting Started (Local Development)
 
 ### Prerequisites
 - Node.js (v18+)
 - PostgreSQL (Database: `payroll_erp`)
 - Google Gemini API Key
 
 ### Installation
 
 1. **Clone the repository:**
    ```bash
    git clone <your-repo-link>
    cd <your-repo-name>
    ```
 
 2. **Backend Setup:**
    ```bash
    cd server
    npm install
    # Create a .env file based on .env.example
    npm run dev
    ```
 
 3. **Frontend Setup:**
    ```bash
    cd client
    npm install
    npm run dev
    ```
 
 ---

## 🌐 Production Deployment Guide

Follow these steps to deploy the full-stack application and connect all services.

### 1. Database (Supabase / Neon)
1. Create a new PostgreSQL project on **Supabase** or **Neon**.
2. Run the SQL commands found in `server/database/schema.sql` (or `schema.sql` in the root) within your database's SQL editor to set up the tables and triggers.
3. **Important:** Run the `server/src/seed.js` script locally (pointing to your production DB URL) or manually insert demo users to enable the "One-Click Login" feature.

### 2. Backend (Render)
1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Set the **Root Directory** to `server`.
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. Add the following **Environment Variables**:
    - `DATABASE_URL`: Your production PostgreSQL connection string.
    - `JWT_SECRET`: A long random string (e.g., `my_secret_key_123`).
    - `FRONTEND_URL`: Your Vercel deployment URL (e.g., `https://project.vercel.app`).
    - `GEMINI_API_KEY`: Your Google AI API key.
    - `NODE_ENV`: `production`

### 3. Frontend (Vercel)
1. Create a new project on Vercel and import your repository.
2. Set the **Framework Preset** to `Vite`.
3. Set the **Root Directory** to `client`.
4. Add the following **Environment Variable**:
    - `VITE_API_URL`: Your Render backend URL (e.g., `https://project-api.onrender.com`).
5. Deploy! Vercel will automatically build the React app and link it to your backend.

---

*Designed and Developed as a showcase of Full-Stack Architecture patterns.*
