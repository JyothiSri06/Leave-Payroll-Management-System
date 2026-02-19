# Leave + Payroll Management System (PERN Stack)

A comprehensive Employee Resource Planning (ERP) solution for managing staff, attendance, leaves, and automated payroll processing using Node.js, Express, React, PostgreSQL, and Redis, integrated with AI-driven compliance insights.

---

## 🏗️ Project Architecture
- **Frontend**: React (Vite) + Tailwind CSS + Context API
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Relational Data) + Redis (Session/List Caching)
- **AI Integration**: Gemini-powered Compliance Bot for HR policy queries.

---

## 💾 Database Schema & Field Details

### 1. Employees (`employees`)
| Field Name | Description |
| :--- | :--- |
| `id` | Unique UUID identifier (Primary Key). |
| `first_name` / `last_name` | Employee's legal name. |
| `email` | Unique login credential. |
| `role` | `ADMIN` (Full control) or `EMPLOYEE` (Self-service). |
| `salary` | Total Monthly Gross Salary (CTC). |
| `basic_salary` | Core component (used for PF calculations). |
| `hra` | House Rent Allowance. |
| `special_allowance`| Additional monthly perks. |
| `tax_slab_id` | Link to the respective tax configuration. |

### 2. Attendance (`attendance`)
| Field Name | Description |
| :--- | :--- |
| `clock_in` / `clock_out` | Timestamps for daily presence. |
| `late_minutes` | Calculated after 9:30 AM grace period. |
| `overtime_hours` | Hours worked beyond the standard 9-hour shift. |

### 3. Payroll Runs (`payroll_runs`)
| Field Name | Description |
| :--- | :--- |
| `gross_pay` | Sum of (Basic + HRA + Allowances + Bonus). |
| `deductions` | Sum of (PF + PT + ESI + LOP + Manual Cuts). |
| `net_pay` | Final "Take Home" salary deposited. |
| `tax_deducted` | TDS (Tax) based on income slab. |

---

## 🖥️ UI Working Principles

### 👑 Admin Command Center
- **Run Payroll**: Automatically fetches employee data and applies business logic (3 lates = 1 day pay cut, automatic LOP for excess leaves).
- **Edit Salary**: Modular structure allowing Admins to adjust Basic/HRA/Special Allowance components.
- **Leave Management**: Direct Approve/Reject functionality that updates real-time balances.

### 👤 Employee Portal
- **Smart Attendance**: One-click Clock In/Out with immediate feedback on "Late" or "Overtime" status.
- **AI Assistant**: A chat widget to ask questions like "Explain my tax deduction" or "What is the HRA policy?".
- **Payslip Viewer**: Professional breakdown of earnings and statutory deductions.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (Database: `payroll_erp`)
- Redis (Optional, for caching)

### Manual Installation
1. **Backend**:
   ```bash
   cd server
   npm install
   npm run dev
   ```
2. **Frontend**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

---

## ⚙️ Automated Services
- **Leave Accrual**: Runs on the 1st of every month to credit leaves (Sick: 1, Casual: 1, Earned: 1.25).
- **Audit Logs**: Every salary change or payroll generation is tracked via database triggers for security.
