# 📱 RestoBill Android APK

**RestoBill Android** is a modern, high-performance, 100% offline-first Restaurant Billing and POS (Point of Sale) Android application tailored for restaurants, cafes, food trucks, and bakeries. Built with **Capacitor** and **in-app SQLite**, it features complete **GST compliance**, **thermal receipt printing**, **multi-table draft orders**, and **role-based access control**.

---

## 🌟 Key Highlights

* ⚡ **100% Offline SQLite:** Runs completely offline on any Android tablet or phone with an embedded SQLite database.
* 🧾 **GST Compliant:** Supports CGST/SGST breakdowns, custom tax slabs (5%, 12%, 18%), HSN/SAC codes, and customer GSTIN.
* 🖨️ **Receipt & Invoice Printing:** Mobile receipt printing and PDF generation for thermal printers and sharing.
* 🔐 **Role-Based Access Control:** Admin (`admin` / `admin123`), Manager, and Cashier modes.
* 💾 **Direct DB Backup & Restore:** Export and import full SQLite `.db` backup files directly on your device.
* 🎨 **Curated Modern UI:** Clean, responsive design optimized for mobile phones and POS tablets.

---

## 🚀 How to Get the APK

### 1. Download Pre-built APK (GitHub Actions)
1. Go to the **[Actions tab](https://github.com/rahulastrorock/RestoBillAPK/actions)** in this repository.
2. Click on the latest workflow run under **Build Android APK**.
3. Under **Artifacts**, download `RestoBill-debug-apk` and install the `.apk` on your Android device!

### 2. Build Locally with Android Studio
```bash
# 1. Install dependencies
npm install

# 2. Sync web assets with Android
npm run sync

# 3. Open in Android Studio
npm run open
```
In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

---

## 📂 Project Structure

```text
├── android/                 # Native Android Gradle project (Capacitor)
├── src/
│   └── renderer/           # Complete mobile UI & offline SQLite engine
│       ├── index.html      # Main app entry
│       ├── css/styles.css  # Responsive POS styles
│       └── js/
│           ├── mobile-api.js # In-app SQLite & IndexedDB persistence layer
│           ├── lib/          # Offline wasm & chart libraries
│           ├── pos.js        # Billing & table order logic
│           └── app.js        # Core controller
├── capacitor.config.ts     # Capacitor configuration
└── package.json            # Android app dependencies
```

---

## 🔑 Default Credentials

* **Username:** `admin`
* **Password:** `admin123`
