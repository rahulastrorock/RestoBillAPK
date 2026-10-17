const { contextBridge, ipcRenderer } = require('electron');

// ─── Secure API Bridge ──────────────────────────────────────────
// Exposes a clean, type-safe API to the renderer process
// All methods return promises with { success, data } or { success, error }

contextBridge.exposeInMainWorld('api', {

  // ── Authentication ────────────────────────────────────────────
  auth: {
    login: (username, password) =>
      ipcRenderer.invoke('auth:login', username, password),
    changePassword: (userId, oldPassword, newPassword) =>
      ipcRenderer.invoke('auth:changePassword', userId, oldPassword, newPassword),
  },

  // ── Menu Categories ───────────────────────────────────────────
  menu: {
    getCategories: () =>
      ipcRenderer.invoke('menu:getCategories'),
    addCategory: (data) =>
      ipcRenderer.invoke('menu:addCategory', data),
    updateCategory: (id, data) =>
      ipcRenderer.invoke('menu:updateCategory', id, data),
    deleteCategory: (id) =>
      ipcRenderer.invoke('menu:deleteCategory', id),

    getItems: (categoryId) =>
      ipcRenderer.invoke('menu:getItems', categoryId),
    getAllItems: () =>
      ipcRenderer.invoke('menu:getAllItems'),
    addItem: (data) =>
      ipcRenderer.invoke('menu:addItem', data),
    updateItem: (id, data) =>
      ipcRenderer.invoke('menu:updateItem', id, data),
    deleteItem: (id) =>
      ipcRenderer.invoke('menu:deleteItem', id),
    searchItems: (query) =>
      ipcRenderer.invoke('menu:searchItems', query),
  },

  // ── Orders / Billing ─────────────────────────────────────────
  orders: {
    create: (orderData) =>
      ipcRenderer.invoke('orders:create', orderData),
    getAll: (filters) =>
      ipcRenderer.invoke('orders:getAll', filters),
    getById: (id) =>
      ipcRenderer.invoke('orders:getById', id),
    void: (id, userId, reason) =>
      ipcRenderer.invoke('orders:void', id, userId, reason),
    getNextOrderNo: () =>
      ipcRenderer.invoke('orders:getNextOrderNo'),
    getDailyOrders: (date) =>
      ipcRenderer.invoke('orders:getDailyOrders', date),
  },

  // ── Customers ─────────────────────────────────────────────────
  customers: {
    getAll: () =>
      ipcRenderer.invoke('customers:getAll'),
    search: (query) =>
      ipcRenderer.invoke('customers:search', query),
    add: (data) =>
      ipcRenderer.invoke('customers:add', data),
    update: (id, data) =>
      ipcRenderer.invoke('customers:update', id, data),
    delete: (id) =>
      ipcRenderer.invoke('customers:delete', id),
  },

  // ── Users ─────────────────────────────────────────────────────
  users: {
    getAll: () =>
      ipcRenderer.invoke('users:getAll'),
    add: (data) =>
      ipcRenderer.invoke('users:add', data),
    update: (id, data) =>
      ipcRenderer.invoke('users:update', id, data),
    delete: (id) =>
      ipcRenderer.invoke('users:delete', id),
    toggleActive: (id) =>
      ipcRenderer.invoke('users:toggleActive', id),
  },

  // ── Reports ───────────────────────────────────────────────────
  reports: {
    dailySummary: (date) =>
      ipcRenderer.invoke('reports:dailySummary', date),
    salesReport: (startDate, endDate) =>
      ipcRenderer.invoke('reports:salesReport', startDate, endDate),
    gstReport: (startDate, endDate) =>
      ipcRenderer.invoke('reports:gstReport', startDate, endDate),
    topItems: (startDate, endDate, limit) =>
      ipcRenderer.invoke('reports:topItems', startDate, endDate, limit),
    categoryWiseSales: (startDate, endDate) =>
      ipcRenderer.invoke('reports:categoryWiseSales', startDate, endDate),
    hourlyDistribution: (date) =>
      ipcRenderer.invoke('reports:hourlyDistribution', date),
    paymentModeBreakdown: (startDate, endDate) =>
      ipcRenderer.invoke('reports:paymentModeBreakdown', startDate, endDate),
  },

  // ── Expenses ──────────────────────────────────────────────────
  expenses: {
    getAll: (startDate, endDate) =>
      ipcRenderer.invoke('expenses:getAll', startDate, endDate),
    add: (data) =>
      ipcRenderer.invoke('expenses:add', data),
    delete: (id) =>
      ipcRenderer.invoke('expenses:delete', id),
  },

  // ── Settings ──────────────────────────────────────────────────
  settings: {
    getAll: () =>
      ipcRenderer.invoke('settings:getAll'),
    get: (key) =>
      ipcRenderer.invoke('settings:get', key),
    update: (key, value) =>
      ipcRenderer.invoke('settings:update', key, value),
    updateBulk: (settings) =>
      ipcRenderer.invoke('settings:updateBulk', settings),
  },

  // ── Draft Bills (Multi-table intermediate billing) ───────────
  drafts: {
    getAll: () =>
      ipcRenderer.invoke('drafts:getAll'),
    save: (draft) =>
      ipcRenderer.invoke('drafts:save', draft),
    delete: (id) =>
      ipcRenderer.invoke('drafts:delete', id),
    clear: () =>
      ipcRenderer.invoke('drafts:clear'),
  },

  // ── Printing ──────────────────────────────────────────────────
  print: {
    receipt: (orderData, settings) =>
      ipcRenderer.invoke('print:receipt', orderData, settings),
    invoice: (orderData, settings) =>
      ipcRenderer.invoke('print:invoice', orderData, settings),
    getPreview: (orderData, settings, type) =>
      ipcRenderer.invoke('print:getPreview', orderData, settings, type),
    toPdf: (orderData, settings, type) =>
      ipcRenderer.invoke('print:toPdf', orderData, settings, type),
  },

  // ── Google Drive ──────────────────────────────────────────────
  gdrive: {
    getAuthUrl: () =>
      ipcRenderer.invoke('gdrive:getAuthUrl'),
    authenticate: (code) =>
      ipcRenderer.invoke('gdrive:authenticate', code),
    backup: () =>
      ipcRenderer.invoke('gdrive:backup'),
    restore: (fileId) =>
      ipcRenderer.invoke('gdrive:restore', fileId),
    getBackups: () =>
      ipcRenderer.invoke('gdrive:getBackups'),
    getStatus: () =>
      ipcRenderer.invoke('gdrive:getStatus'),
    disconnect: () =>
      ipcRenderer.invoke('gdrive:disconnect'),
    updateSchedule: () =>
      ipcRenderer.invoke('gdrive:updateSchedule'),
    onBackupCompleted: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('backup:completed', handler);
      return () => ipcRenderer.removeListener('backup:completed', handler);
    },
  },

  // ── Audit Log ─────────────────────────────────────────────────
  audit: {
    getLog: (limit, offset) =>
      ipcRenderer.invoke('audit:getLog', limit, offset),
    add: (entry) =>
      ipcRenderer.invoke('audit:add', entry),
  },

  // ── App Utilities ─────────────────────────────────────────────
  app: {
    getVersion: () =>
      ipcRenderer.invoke('app:getVersion'),
    getDbPath: () =>
      ipcRenderer.invoke('app:getDbPath'),
    openExternal: (url) =>
      ipcRenderer.invoke('app:openExternal', url),
    exportData: (type, data) =>
      ipcRenderer.invoke('app:exportData', type, data),
    zoomIn: () =>
      ipcRenderer.invoke('app:zoomIn'),
    zoomOut: () =>
      ipcRenderer.invoke('app:zoomOut'),
    zoomReset: () =>
      ipcRenderer.invoke('app:zoomReset'),
    getZoom: () =>
      ipcRenderer.invoke('app:getZoom'),
    onZoomChanged: (callback) => {
      const handler = (event, percent) => callback(percent);
      ipcRenderer.on('app:zoomChanged', handler);
      return () => ipcRenderer.removeListener('app:zoomChanged', handler);
    },
  },
});
