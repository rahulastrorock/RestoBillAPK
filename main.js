const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Service imports
const { initDatabase, getDb, closeDatabase } = require('./src/database/db');
const { runMigrations } = require('./src/database/migrations');
const { seedData } = require('./src/database/seed');
const AuthService = require('./src/services/auth');
const MenuService = require('./src/services/menu');
const BillingService = require('./src/services/billing');
const UserService = require('./src/services/users');
const ReportService = require('./src/services/reports');
const PrintService = require('./src/services/print');
const SettingsService = require('./src/services/settings');
const GDriveService = require('./src/services/gdrive');

let mainWindow;
let printWindow;

// ─── Window Creation ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RestoBill',
    show: false,
    backgroundColor: '#0f1117',
    frame: true,
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// ─── Database Initialization ─────────────────────────────────────
function initApp() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'restobill.db');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  console.log('Database path:', dbPath);

  // Initialize database
  initDatabase(dbPath);
  runMigrations();
  seedData();

  // Initialize services
  AuthService.init();
  MenuService.init();
  BillingService.init();
  UserService.init();
  ReportService.init();
  SettingsService.init();
  PrintService.init();
  GDriveService.init(userDataPath);
}

// ─── IPC Handler Wrapper ─────────────────────────────────────────
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error) {
      console.error(`IPC Error [${channel}]:`, error.message);
      return { success: false, error: error.message };
    }
  });
}

// ─── Register All IPC Handlers ───────────────────────────────────
function registerIpcHandlers() {

  // ── Auth ──────────────────────────────────────────────────────
  handleIpc('auth:login', (username, password) => {
    return AuthService.login(username, password);
  });

  handleIpc('auth:changePassword', (userId, oldPassword, newPassword) => {
    return AuthService.changePassword(userId, oldPassword, newPassword);
  });

  // ── Categories ────────────────────────────────────────────────
  handleIpc('menu:getCategories', () => {
    return MenuService.getCategories();
  });

  handleIpc('menu:addCategory', (data) => {
    return MenuService.addCategory(data);
  });

  handleIpc('menu:updateCategory', (id, data) => {
    return MenuService.updateCategory(id, data);
  });

  handleIpc('menu:deleteCategory', (id) => {
    return MenuService.deleteCategory(id);
  });

  // ── Menu Items ────────────────────────────────────────────────
  handleIpc('menu:getItems', (categoryId) => {
    return MenuService.getItems(categoryId);
  });

  handleIpc('menu:getAllItems', () => {
    return MenuService.getAllItems();
  });

  handleIpc('menu:addItem', (data) => {
    return MenuService.addItem(data);
  });

  handleIpc('menu:updateItem', (id, data) => {
    return MenuService.updateItem(id, data);
  });

  handleIpc('menu:deleteItem', (id) => {
    return MenuService.deleteItem(id);
  });

  handleIpc('menu:searchItems', (query) => {
    return MenuService.searchItems(query);
  });

  // ── Orders / Billing ─────────────────────────────────────────
  handleIpc('orders:create', (orderData) => {
    return BillingService.createOrder(orderData);
  });

  handleIpc('orders:getAll', (filters) => {
    return BillingService.getOrders(filters);
  });

  handleIpc('orders:getById', (id) => {
    return BillingService.getOrderById(id);
  });

  handleIpc('orders:void', (id, userId, reason) => {
    return BillingService.voidOrder(id, userId, reason);
  });

  handleIpc('orders:getNextOrderNo', () => {
    return BillingService.getNextOrderNo();
  });

  handleIpc('orders:getDailyOrders', (date) => {
    return BillingService.getDailyOrders(date);
  });

  // ── Customers ─────────────────────────────────────────────────
  handleIpc('customers:getAll', () => {
    return BillingService.getCustomers();
  });

  handleIpc('customers:search', (query) => {
    return BillingService.searchCustomers(query);
  });

  handleIpc('customers:add', (data) => {
    return BillingService.addCustomer(data);
  });

  handleIpc('customers:update', (id, data) => {
    return BillingService.updateCustomer(id, data);
  });

  // ── Users ─────────────────────────────────────────────────────
  handleIpc('users:getAll', () => {
    return UserService.getAll();
  });

  handleIpc('users:add', (data) => {
    return UserService.addUser(data);
  });

  handleIpc('users:update', (id, data) => {
    return UserService.updateUser(id, data);
  });

  handleIpc('users:delete', (id) => {
    return UserService.deleteUser(id);
  });

  handleIpc('users:toggleActive', (id) => {
    return UserService.toggleActive(id);
  });

  // ── Reports ───────────────────────────────────────────────────
  handleIpc('reports:dailySummary', (date) => {
    return ReportService.getDailySummary(date);
  });

  handleIpc('reports:salesReport', (startDate, endDate) => {
    return ReportService.getSalesReport(startDate, endDate);
  });

  handleIpc('reports:gstReport', (startDate, endDate) => {
    return ReportService.getGstReport(startDate, endDate);
  });

  handleIpc('reports:topItems', (startDate, endDate, limit) => {
    return ReportService.getTopItems(startDate, endDate, limit);
  });

  handleIpc('reports:categoryWiseSales', (startDate, endDate) => {
    return ReportService.getCategoryWiseSales(startDate, endDate);
  });

  handleIpc('reports:hourlyDistribution', (date) => {
    return ReportService.getHourlyDistribution(date);
  });

  handleIpc('reports:paymentModeBreakdown', (startDate, endDate) => {
    return ReportService.getPaymentModeBreakdown(startDate, endDate);
  });

  // ── Expenses ──────────────────────────────────────────────────
  handleIpc('expenses:getAll', (startDate, endDate) => {
    return ReportService.getExpenses(startDate, endDate);
  });

  handleIpc('expenses:add', (data) => {
    return ReportService.addExpense(data);
  });

  handleIpc('expenses:delete', (id) => {
    return ReportService.deleteExpense(id);
  });

  // ── Settings ──────────────────────────────────────────────────
  handleIpc('settings:getAll', () => {
    return SettingsService.getAll();
  });

  handleIpc('settings:get', (key) => {
    return SettingsService.get(key);
  });

  handleIpc('settings:update', (key, value) => {
    return SettingsService.update(key, value);
  });

  handleIpc('settings:updateBulk', (settings) => {
    return SettingsService.updateBulk(settings);
  });

  // ── Printing ──────────────────────────────────────────────────
  handleIpc('print:receipt', async (orderData, settings) => {
    const html = PrintService.generateReceiptHtml(orderData, settings);
    await printHtml(html, 'receipt');
    return true;
  });

  handleIpc('print:invoice', async (orderData, settings) => {
    const html = PrintService.generateInvoiceHtml(orderData, settings);
    await printHtml(html, 'invoice');
    return true;
  });

  handleIpc('print:getPreview', (orderData, settings, type) => {
    if (type === 'invoice') {
      return PrintService.generateInvoiceHtml(orderData, settings);
    }
    return PrintService.generateReceiptHtml(orderData, settings);
  });

  // ── Google Drive ──────────────────────────────────────────────
  handleIpc('gdrive:getAuthUrl', () => {
    return GDriveService.getAuthUrl();
  });

  handleIpc('gdrive:authenticate', (code) => {
    return GDriveService.authenticate(code);
  });

  handleIpc('gdrive:backup', () => {
    const dbPath = path.join(app.getPath('userData'), 'restobill.db');
    return GDriveService.backupDatabase(dbPath);
  });

  handleIpc('gdrive:restore', (fileId) => {
    const dbPath = path.join(app.getPath('userData'), 'restobill.db');
    return GDriveService.restoreDatabase(dbPath, fileId);
  });

  handleIpc('gdrive:getBackups', () => {
    return GDriveService.listBackups();
  });

  handleIpc('gdrive:getStatus', () => {
    return GDriveService.getStatus();
  });

  handleIpc('gdrive:disconnect', () => {
    return GDriveService.disconnect();
  });

  // ── Audit Log ─────────────────────────────────────────────────
  handleIpc('audit:getLog', (limit, offset) => {
    return ReportService.getAuditLog(limit, offset);
  });

  handleIpc('audit:add', (entry) => {
    return ReportService.addAuditEntry(entry);
  });

  // ── App Utilities ─────────────────────────────────────────────
  handleIpc('app:getVersion', () => {
    return app.getVersion();
  });

  handleIpc('app:getDbPath', () => {
    return path.join(app.getPath('userData'), 'restobill.db');
  });

  handleIpc('app:openExternal', (url) => {
    shell.openExternal(url);
    return true;
  });

  handleIpc('app:exportData', async (type, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Data',
      defaultPath: `restobill_${type}_${new Date().toISOString().slice(0, 10)}`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, data, 'utf-8');
      return result.filePath;
    }
    return null;
  });
}

// ─── Print Helper ────────────────────────────────────────────────
function printHtml(html, type) {
  return new Promise((resolve, reject) => {
    if (printWindow) {
      printWindow.close();
    }

    printWindow = new BrowserWindow({
      show: false,
      width: type === 'receipt' ? 302 : 794,
      height: type === 'receipt' ? 900 : 1123,
      webPreferences: {
        contextIsolation: true,
      },
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
      const options = type === 'receipt'
        ? { silent: true, printBackground: true, margins: { marginType: 'none' } }
        : { silent: false, printBackground: true, margins: { marginType: 'default' } };

      printWindow.webContents.print(options, (success, reason) => {
        if (printWindow) {
          printWindow.close();
          printWindow = null;
        }
        if (success) {
          resolve(true);
        } else {
          // Don't reject on cancel
          resolve(false);
        }
      });
    });
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────
app.whenReady().then(() => {
  initApp();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  app.quit();
});

app.on('before-quit', () => {
  closeDatabase();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred: ${error.message}`);
});
