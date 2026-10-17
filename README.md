# 🍽️ RestoBill

**RestoBill** is a modern, high-performance, offline-first Restaurant Billing and POS (Point of Sale) desktop software tailored for Indian restaurants, cafes, food trucks, and bakeries. Built with Electron and SQLite, it features complete **GST compliance**, **ESC/POS thermal receipt printing**, **cloud auto-backup with Google Drive**, and **role-based access control**.

---

## 🌟 Key Highlights

* ⚡ **Lightning Fast Billing:** Optimized keyboard shortcuts and instant menu search for high-volume billing counters.
* 🧾 **GST Compliant:** Supports CGST/SGST breakdowns, custom tax slabs (5%, 12%, 18%), HSN/SAC codes, and customer GSTIN on B2B invoices.
* 🖨️ **Thermal & Standard Printing:** Native silent printing for 58mm (2-inch) and 80mm (3-inch) ESC/POS thermal printers (EZO, TVS, Epson, NGX, etc.) as well as A4/A5 laser/inkjet invoices and PDF export.
* ☁️ **Google Drive Auto-Backup:** Automatic encrypted cloud backups of the SQLite database in the background and on app exit.
* 🔐 **Role-Based Access Control (RBAC):**
  * **Administrator:** Complete access to all features, settings, user management, and audit logs.
  * **Manager:** Access to POS, analytics dashboard, order history, menu editing, reports, and settings.
  * **Cashier:** Streamlined interface restricted to **Billing (POS)**, **Order History**, and **Customer Directory**.
* 🌐 **100% Offline-First:** Runs completely offline without internet dependencies. Internet is only required for optional Google Drive backups.
* 🎨 **Modern Design:** Curated dark & light themes, smooth animations, and zoom scaling controls (`Ctrl +` / `Ctrl -`).

---

## 📸 Modules & Features

### 🛒 1. Billing (Point of Sale)
* **Order Modes:** Dine-In (with table assignment), Takeaway / Counter, and Delivery.
* **Instant Search & Category Filtering:** Search items by name, code, or filter by category.
* **Discounts & Custom Charges:** Apply flat (₹) or percentage (%) discounts per bill.
* **Split & Multiple Payment Modes:** Cash, UPI / QR, Card, and custom split payments.
* **Hold / Draft Orders:** Park multiple ongoing bills and resume them at any time.

### 📜 2. Order History & Management
* View all completed and voided orders with itemized breakdowns and applied taxes.
* One-click bill reprinting (thermal receipt or A4 PDF).
* Order cancellation / voiding with mandatory reason tracking.
* Export order registers to CSV for accounting software (Tally, Zoho Books, Excel).

### 👥 3. Customer Directory & Loyalty
* Manage customer profiles with names, phone numbers, and GSTIN for B2B billing.
* Lifetime spend, visit counts, and last visit tracking.
* One-click "Start Bill" directly from customer profiles.

### 📋 4. Menu & Category Management
* Add and update categories and dishes with prices and tax slabs.
* Veg / Non-Veg visual indicators.
* HSN / SAC code assignment per item.
* Quick active/inactive item toggles for out-of-stock items.

### 📊 5. Analytics & Business Reports
* **Daily Sales Summary:** Gross sales, net collections, discounts given, and voided orders.
* **GST Tax Report:** Detailed CGST, SGST, and taxable turnover breakdown for easy GST filing.
* **Visual Charts:** Hourly distribution of footfall, payment mode breakdowns, and top-selling dishes.
* **Expense Tracker:** Log daily petty cash, raw material, and utility expenses.
* **Audit Trail:** Security log recording user logins, password changes, and voided bills.

### ☁️ 6. Backup & Restore
* Direct integration with the Google Drive API.
* Scheduled automatic background backup every few minutes.
* Safe SQLite WAL checkpoints prior to database backups to guarantee zero data loss.
* One-click database restoration from cloud backup snapshots.

---

## ⌨️ POS Keyboard Shortcuts

Boost your billing counter speed with built-in hotkeys:

| Key | Action |
| :--- | :--- |
| <kbd>F1</kbd> | Navigate to **Billing (POS)** |
| <kbd>F2</kbd> | Navigate to **Dashboard** *(Admin/Manager)* |
| <kbd>F3</kbd> | Navigate to **Order History** |
| <kbd>F4</kbd> | Navigate to **Menu Management** *(Admin/Manager)* |
| <kbd>F5</kbd> | Navigate to **Reports** *(Admin/Manager)* |
| <kbd>F6</kbd> | Navigate to **Settings** *(Admin/Manager)* |
| <kbd>F8</kbd> | Focus **Menu Search** in POS |
| <kbd>F9</kbd> | **Save & Print** current order |
| <kbd>F10</kbd> | **Save** order (without printing) |
| <kbd>Esc</kbd> | Close active modal dialog or slide-out detail panel |
| <kbd>Ctrl</kbd> + <kbd>+</kbd> | Zoom In interface |
| <kbd>Ctrl</kbd> + <kbd>-</kbd> | Zoom Out interface |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | Reset interface zoom to 100% |

---

## 🛠️ Tech Stack

* **Platform:** [Electron](https://www.electronjs.org/) (v33+)
* **Database:** [SQLite3](https://www.sqlite.org/) via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (synchronous, WAL mode)
* **Frontend:** Modern Vanilla JavaScript (ES6+), Semantic HTML5, and custom responsive Vanilla CSS
* **Security:** `bcryptjs` password hashing, Electron Context Isolation & Preload IPC API bridge
* **Analytics:** [Chart.js](https://www.chartjs.org/)
* **Packaging:** [`electron-builder`](https://www.electron.build/) for Windows executable (`.exe`) & NSIS installer

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
* [npm](https://www.npmjs.com/) (bundled with Node.js)
* Python & C++ Build Tools (required by node-gyp for compiling `better-sqlite3` on Windows)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rahulastrorock/RestoBill.git
   cd RestoBill
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Rebuild native SQLite bindings for Electron:**
   ```bash
   npm run rebuild
   ```

4. **Launch the development application:**
   ```bash
   npm run dev
   ```

---

## 📦 Building for Production

To generate a standalone Windows installer or portable executable:

* **Build Windows NSIS Installer:**
  ```bash
  npm run build
  ```
* **Build Windows Portable Executable:**
  ```bash
  npm run build:portable
  ```

Output binaries will be generated in the `dist/` directory.

---

## 🖨️ Thermal Printer Setup Guide

RestoBill supports thermal receipt printers out of the box:
1. Connect your thermal printer (USB or Bluetooth) and install its manufacturer Windows driver (e.g. POS-58, POS-80, EZO, TVS, Epson).
2. Open **Settings > Printer** in RestoBill:
   * **Printer Type:** Choose `ESC/POS Thermal Printer`.
   * **Paper Width:** Choose `58mm` (2-inch) or `80mm` (3-inch).
   * **Footer Note:** Add custom thank-you message / UPI ID.
3. Click **Test Print Receipt** to verify paper alignment and font rendering.

---

## 🔒 Security & Privacy

* **Sensitive Data:** Database files (`*.db`), Google Drive tokens (`credentials.json`, `gdrive_token.json`), and build artifacts are strictly excluded from version control via `.gitignore`.
* **Zero Telemetry:** RestoBill does not collect or transmit analytics or business data. All data remains strictly on your local machine and your private Google Drive account.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
