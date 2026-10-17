const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable GPU disk cache to prevent "Gpu Cache Creation failed: -2" and "Unable to move cache: Access is denied (0x5)" on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Ensure single instance lock so two instances never conflict over cache or SQLite database
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('RestoBill is already running. Focusing existing instance.');
  app.quit();
  process.exit(0);
}

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
  const icoPath = path.join(__dirname, 'src', 'renderer', 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'src', 'renderer', 'assets', 'icon.png');
  const appIcon = fs.existsSync(icoPath) ? icoPath : pngPath;

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    icon: appIcon,
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

  if (fs.existsSync(appIcon)) {
    try { mainWindow.setIcon(appIcon); } catch (e) {}
  }

  mainWindow.loadFile('src/renderer/index.html');

  // Handle Zoom shortcuts (Ctrl++, Ctrl+-, Ctrl+0) with full keyboard layout support
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta)) {
      // Zoom In: Ctrl + Plus, Ctrl + Equal, Ctrl + NumpadAdd
      if (
        input.key === '=' ||
        input.key === '+' ||
        input.key === 'Add' ||
        input.code === 'Equal' ||
        input.code === 'NumpadAdd'
      ) {
        event.preventDefault();
        const currentFactor = mainWindow.webContents.getZoomFactor();
        const newFactor = Math.min(Math.round((currentFactor + 0.1) * 10) / 10, 2.0);
        mainWindow.webContents.setZoomFactor(newFactor);
        mainWindow.webContents.send('app:zoomChanged', Math.round(newFactor * 100));
      }
      // Zoom Out: Ctrl + Minus, Ctrl + Underscore, Ctrl + NumpadSubtract
      else if (
        input.key === '-' ||
        input.key === '_' ||
        input.key === 'Subtract' ||
        input.code === 'Minus' ||
        input.code === 'NumpadSubtract'
      ) {
        event.preventDefault();
        const currentFactor = mainWindow.webContents.getZoomFactor();
        const newFactor = Math.max(Math.round((currentFactor - 0.1) * 10) / 10, 0.5);
        mainWindow.webContents.setZoomFactor(newFactor);
        mainWindow.webContents.send('app:zoomChanged', Math.round(newFactor * 100));
      }
      // Reset zoom: Ctrl + 0
      else if (
        input.key === '0' ||
        input.code === 'Digit0' ||
        input.code === 'Numpad0'
      ) {
        event.preventDefault();
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.webContents.send('app:zoomChanged', 100);
      }
    }

    // Toggle DevTools with F12 or Ctrl+Shift+I
    if (input.type === 'keyDown') {
      if (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i'))) {
        event.preventDefault();
        mainWindow.webContents.toggleDevTools();
      }
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  let isClosingWithBackup = false;
  mainWindow.on('close', async (e) => {
    if (isClosingWithBackup) return;

    try {
      const backupEnabled = SettingsService.get('backup_enabled');
      const backupOnExit = SettingsService.get('backup_on_exit');

      if (backupEnabled === '1' && backupOnExit !== '0' && GDriveService.drive) {
        e.preventDefault();
        isClosingWithBackup = true;
        console.log('[AutoBackup] App closing: creating automatic exit backup to Google Drive...');

        const dbPath = path.join(app.getPath('userData'), 'restobill.db');
        const db = getDb();
        if (db) db.pragma('wal_checkpoint(TRUNCATE)');

        await Promise.race([
          GDriveService.backupDatabase(dbPath).then(res => {
            if (res?.timestamp) SettingsService.update('last_backup', res.timestamp);
            console.log('[AutoBackup] Exit backup completed successfully.');
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Exit backup timeout')), 8000))
        ]).catch(err => {
          console.warn('[AutoBackup] Exit backup skipped or failed:', err.message);
        });

        mainWindow.destroy();
        app.quit();
      }
    } catch (err) {
      console.error('[AutoBackup] Exit error:', err.message);
      mainWindow.destroy();
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--devtools')) {
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
  setupAutoBackupScheduler();
}

let autoBackupInterval = null;

function setupAutoBackupScheduler() {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
  }

  // Check every 3 minutes
  autoBackupInterval = setInterval(async () => {
    try {
      const enabled = SettingsService.get('backup_enabled');
      if (enabled !== '1') return;
      if (!GDriveService.drive) return;

      const frequency = SettingsService.get('backup_frequency') || 'daily';
      const backupTime = SettingsService.get('backup_time') || '23:00';
      const lastBackupStr = SettingsService.get('last_backup');

      const now = new Date();
      let shouldBackup = false;

      if (frequency === 'every_4_hours') {
        if (!lastBackupStr) {
          shouldBackup = true;
        } else {
          const diffHours = (now - new Date(lastBackupStr)) / (1000 * 60 * 60);
          if (diffHours >= 4) shouldBackup = true;
        }
      } else if (frequency === 'every_12_hours') {
        if (!lastBackupStr) {
          shouldBackup = true;
        } else {
          const diffHours = (now - new Date(lastBackupStr)) / (1000 * 60 * 60);
          if (diffHours >= 12) shouldBackup = true;
        }
      } else {
        // Daily: check if backed up today
        const todayStr = now.toLocaleDateString('en-CA');
        const lastDateStr = lastBackupStr ? new Date(lastBackupStr).toLocaleDateString('en-CA') : '';

        if (todayStr !== lastDateStr) {
          const [targetHour, targetMinute] = backupTime.split(':').map(Number);
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
            shouldBackup = true;
          }
        }
      }

      if (shouldBackup) {
        console.log(`[AutoBackup] Running scheduled backup (${frequency})...`);
        const dbPath = path.join(app.getPath('userData'), 'restobill.db');
        const db = getDb();
        if (db) db.pragma('wal_checkpoint(TRUNCATE)');
        const res = await GDriveService.backupDatabase(dbPath);
        if (res && res.success) {
          SettingsService.update('last_backup', res.timestamp);
          console.log('[AutoBackup] Backup successful:', res.fileName);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('backup:completed', res);
          }
        }
      }
    } catch (err) {
      console.error('[AutoBackup] Error running backup:', err.message);
    }
  }, 3 * 60 * 1000);
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

  handleIpc('customers:delete', (id) => {
    return BillingService.deleteCustomer(id);
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

  // ── Draft Bills ──────────────────────────────────────────────
  handleIpc('drafts:getAll', () => {
    return BillingService.getAllDrafts();
  });

  handleIpc('drafts:save', (draft) => {
    return BillingService.saveDraft(draft);
  });

  handleIpc('drafts:delete', (id) => {
    return BillingService.deleteDraft(id);
  });

  handleIpc('drafts:clear', () => {
    return BillingService.clearAllDrafts();
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

  handleIpc('print:toPdf', async (orderData, settings, type) => {
    const html = type === 'invoice'
      ? PrintService.generateInvoiceHtml(orderData, settings)
      : PrintService.generateReceiptHtml(orderData, settings);
    const filename = `${orderData.order_no || 'Bill'}_${type || 'receipt'}`;
    return await savePdfFromHtml(html, filename);
  });

  // ── Google Drive ──────────────────────────────────────────────
  handleIpc('gdrive:getAuthUrl', () => {
    return GDriveService.getAuthUrl();
  });

  handleIpc('gdrive:authenticate', (code) => {
    return GDriveService.authenticate(code);
  });

  handleIpc('gdrive:backup', async () => {
    const dbPath = path.join(app.getPath('userData'), 'restobill.db');
    try {
      const db = getDb();
      if (db) db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('Could not checkpoint WAL before backup:', e.message);
    }
    const res = await GDriveService.backupDatabase(dbPath);
    if (res && res.success && res.timestamp) {
      SettingsService.update('last_backup', res.timestamp);
    }
    return res;
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

  handleIpc('gdrive:updateSchedule', () => {
    setupAutoBackupScheduler();
    return true;
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

  handleIpc('app:zoomIn', () => {
    if (mainWindow) {
      const current = mainWindow.webContents.getZoomFactor();
      const next = Math.min(Math.round((current + 0.1) * 10) / 10, 2.0);
      mainWindow.webContents.setZoomFactor(next);
      return Math.round(next * 100);
    }
    return 100;
  });

  handleIpc('app:zoomOut', () => {
    if (mainWindow) {
      const current = mainWindow.webContents.getZoomFactor();
      const next = Math.max(Math.round((current - 0.1) * 10) / 10, 0.5);
      mainWindow.webContents.setZoomFactor(next);
      return Math.round(next * 100);
    }
    return 100;
  });

  handleIpc('app:zoomReset', () => {
    if (mainWindow) {
      mainWindow.webContents.setZoomFactor(1.0);
      return 100;
    }
    return 100;
  });

  handleIpc('app:getZoom', () => {
    if (mainWindow) {
      return Math.round(mainWindow.webContents.getZoomFactor() * 100);
    }
    return 100;
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

async function savePdfFromHtml(html, defaultName) {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Invoice as PDF',
      defaultPath: `${defaultName || 'Invoice'}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const pdfWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        contextIsolation: true,
      },
    });

    pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    return new Promise((resolve, reject) => {
      pdfWin.webContents.on('did-finish-load', async () => {
        try {
          const pdfBuffer = await pdfWin.webContents.printToPDF({
            printBackground: true,
            margins: { marginType: 'default' },
            pageSize: 'A4',
          });
          fs.writeFileSync(result.filePath, pdfBuffer);
          pdfWin.close();
          resolve(result.filePath);
        } catch (err) {
          if (pdfWin) pdfWin.close();
          reject(err);
        }
      });
    });
  } catch (err) {
    console.error('Error saving PDF:', err);
    throw err;
  }
}

// ─── App Lifecycle ───────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  app.setName('RestoBill');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.restobill.app');
  }
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
