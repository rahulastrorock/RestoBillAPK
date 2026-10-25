/**
 * RestoBill - Supabase Cloud Metrics & Live Telemetry Service
 *
 * Real-time, offline-tolerant synchronization of sales, metrics, and device telemetry
 * to Supabase PostgreSQL cloud database for remote visualization on phone/web.
 */

window.SupabaseSync = {
  queueKey: 'restobill_supabase_queue',
  heartbeatTimer: null,
  isFlushing: false,

  cleanSupabaseUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    // If user pasted dashboard URL like https://supabase.com/dashboard/project/ujjkbqimycboljtbcxno/...
    const dashboardMatch = clean.match(/project\/([a-z0-9_-]+)/i);
    if (dashboardMatch) {
      return `https://${dashboardMatch[1]}.supabase.co`;
    }
    // If user pasted just the 20-character project ref (e.g. ujjkbqimycboljtbcxno)
    if (/^[a-z0-9]{20}$/i.test(clean)) {
      return `https://${clean}.supabase.co`;
    }
    // Correct .com to .co if user made a typo
    if (clean.includes('.supabase.com')) {
      clean = clean.replace('.supabase.com', '.supabase.co');
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    // Strip trailing slashes, /rest/v1, /rest
    clean = clean.replace(/\/+$/, '');
    clean = clean.replace(/\/rest\/v1\/?$/i, '');
    clean = clean.replace(/\/rest\/?$/i, '');
    return clean;
  },

  getConfig() {
    const s = window.App?.settings || {};
    return {
      url: this.cleanSupabaseUrl(s.supabase_url || ''),
      anonKey: (s.supabase_anon_key || '').trim(),
      enabled: s.supabase_enabled === '1' || s.supabase_enabled === true,
      outletName: (s.restaurant_name || 'RestoBill Outlet').trim()
    };
  },

  async init() {
    this.setupListeners();
    this.startHeartbeat();
    // Flush any pending orders left in queue
    setTimeout(() => this.flushQueue(), 3000);
  },

  setupListeners() {
    // Auto-flush queue whenever device comes back online
    window.addEventListener('online', () => {
      console.log('[SupabaseSync] Network online detected, flushing queue...');
      this.flushQueue();
      this.sendHeartbeat();
    });

    // Send heartbeat when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.sendHeartbeat();
      }
    });
  },

  /**
   * Test connection to user's Supabase project with given URL and Anon Key
   */
  async testConnection(targetUrl, targetKey) {
    const cleanUrl = this.cleanSupabaseUrl(targetUrl);
    const cleanKey = (targetKey || '').trim();

    if (!cleanUrl) {
      return { success: false, message: 'Please enter your Supabase Project URL' };
    }
    if (!cleanKey) {
      return { success: false, message: 'Please enter your Supabase Public Anon Key' };
    }

    try {
      // Step 1: Check base REST endpoint to verify Project URL and Anon Key validity
      const rootRes = await fetch(`${cleanUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': cleanKey,
          'Authorization': `Bearer ${cleanKey}`,
          'Accept': 'application/json'
        }
      });

      if (!rootRes.ok) {
        let rootErr = '';
        try {
          const rootJson = await rootRes.json();
          rootErr = rootJson.message || rootJson.hint || JSON.stringify(rootJson);
        } catch (e) {
          rootErr = await rootRes.text().catch(() => '');
        }

        if (rootRes.status === 401 || rootRes.status === 403) {
          return {
            success: false,
            message: `Authentication failed (Status ${rootRes.status}): Invalid anon key.\nMake sure you copied the public "anon" key from Supabase Project Settings > API > Project API keys (anon public).\n${rootErr}`
          };
        }
        if (rootRes.status === 404) {
          return {
            success: false,
            message: `Project URL not reachable (Status 404): ${cleanUrl}\nPlease check that the URL matches Project Settings > API > Project URL (e.g. https://xyz.supabase.co)`
          };
        }
      }

      // Step 2: Check restobill_orders table endpoint
      const endpoint = `${cleanUrl}/rest/v1/restobill_orders?select=id&limit=1`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': cleanKey,
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        return { success: true, message: 'Connected successfully to Supabase! Tables and REST API are fully accessible.' };
      }

      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson.message || errJson.hint || JSON.stringify(errJson);
      } catch (e) {
        errDetail = await res.text().catch(() => '');
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: `Authentication failed (Status ${res.status}). Please verify that you copied the public "anon" key from Supabase Project Settings > API.\n${errDetail}`
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          message: `Table exists in PostgreSQL, but PostgREST API has not reloaded its schema cache yet (Status 404).\n${errDetail ? `Server message: ${errDetail}\n\n` : ''}Instant Fix:\nIn your Supabase Dashboard, go to Project Settings (bottom gear ⚙️) > General > scroll down and click "Restart project" (takes ~15 seconds to reboot PostgREST and register all tables).`
        };
      }

      return { success: false, message: `Supabase returned error (${res.status}): ${errDetail}` };
    } catch (err) {
      console.error('[SupabaseSync] Test connection error:', err);
      return {
        success: false,
        message: err.message.includes('Failed to fetch')
          ? 'Network request failed. Please check your internet connection and verify that the Project URL is correct.'
          : `Connection failed: ${err.message}`
      };
    }
  },

  /**
   * Format a local order into Supabase cloud metrics payload
   */
  formatOrderPayload(order, config) {
    const items = order.items || [];
    const itemsCount = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 1), 0);
    const itemsSummary = items.map(i => `${i.quantity}x ${i.name}`).slice(0, 15).join(', ');

    // Order date in YYYY-MM-DD
    let orderDate = '';
    if (order.created_at) {
      orderDate = order.created_at.slice(0, 10);
    } else {
      const d = new Date();
      orderDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const platform = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
      ? 'Android APK'
      : (navigator.userAgent.includes('Electron') ? 'Desktop Electron' : 'Web Browser');

    return {
      order_no: String(order.order_no || `ORD-${Date.now()}`),
      outlet_name: config.outletName,
      order_type: order.order_type || 'dine_in',
      table_no: String(order.table_no || ''),
      payment_mode: order.payment_mode || 'cash',
      subtotal: parseFloat(order.subtotal) || 0,
      discount: parseFloat(order.discount_amount || order.discount_value) || 0,
      tax_amount: (parseFloat(order.cgst) || 0) + (parseFloat(order.sgst) || 0),
      total: parseFloat(order.total) || 0,
      items_count: itemsCount,
      items_summary: itemsSummary,
      customer_name: String(order.customer_name || ''),
      customer_phone: String(order.customer_phone || ''),
      cashier_name: String(window.App?.currentUser?.name || 'Staff'),
      order_date: orderDate,
      app_version: '1.0.0',
      device_info: platform
    };
  },

  /**
   * Sync a newly placed or updated order
   */
  async syncOrder(order) {
    if (!order) return;
    const config = this.getConfig();
    if (!config.enabled || !config.url || !config.anonKey) {
      return;
    }

    const payload = this.formatOrderPayload(order, config);

    // If offline, queue immediately
    if (!navigator.onLine) {
      this.enqueue(payload);
      return;
    }

    try {
      const endpoint = `${config.url}/rest/v1/restobill_orders`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.warn('[SupabaseSync] Order upload failed with status:', res.status);
        this.enqueue(payload);
      } else {
        console.log(`[SupabaseSync] Order #${payload.order_no} synced live to Supabase!`);
      }
    } catch (err) {
      console.warn('[SupabaseSync] Network error while syncing order, queued locally:', err);
      this.enqueue(payload);
    }
  },

  /**
   * Queue order payload in localStorage for offline retry
   */
  enqueue(payload) {
    try {
      const raw = localStorage.getItem(this.queueKey) || '[]';
      const queue = JSON.parse(raw);
      // Avoid duplicate payloads in queue
      const existingIdx = queue.findIndex(q => q.order_no === payload.order_no && q.outlet_name === payload.outlet_name);
      if (existingIdx >= 0) {
        queue[existingIdx] = payload;
      } else {
        queue.push(payload);
      }
      localStorage.setItem(this.queueKey, JSON.stringify(queue.slice(-200))); // keep max 200 in queue
    } catch (e) {
      console.warn('[SupabaseSync] Enqueue error:', e);
    }
  },

  /**
   * Flush offline queue
   */
  async flushQueue() {
    if (this.isFlushing || !navigator.onLine) return;
    const config = this.getConfig();
    if (!config.enabled || !config.url || !config.anonKey) return;

    try {
      const raw = localStorage.getItem(this.queueKey);
      if (!raw) return;
      const queue = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) return;

      this.isFlushing = true;
      console.log(`[SupabaseSync] Flushing ${queue.length} queued metrics items...`);

      const endpoint = `${config.url}/rest/v1/restobill_orders`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(queue)
      });

      if (res.ok) {
        localStorage.removeItem(this.queueKey);
        console.log(`[SupabaseSync] Successfully flushed ${queue.length} queued items to Supabase!`);
      }
    } catch (err) {
      console.warn('[SupabaseSync] Flush queue failed:', err);
    } finally {
      this.isFlushing = false;
    }
  },

  /**
   * Send device status heartbeat (shows online status & live shift totals)
   */
  async sendHeartbeat() {
    const config = this.getConfig();
    if (!config.enabled || !config.url || !config.anonKey || !navigator.onLine) return;

    try {
      let deviceId = localStorage.getItem('restobill_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('restobill_device_id', deviceId);
      }

      const platform = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
        ? 'Android APK'
        : (navigator.userAgent.includes('Electron') ? 'Desktop Electron' : 'Web');

      // Fetch today's sales summary for heartbeat
      let todayOrders = 0;
      let todayRev = 0;
      try {
        if (window.api?.reports?.dailySummary) {
          const sumRes = await window.api.reports.dailySummary();
          if (sumRes.success && sumRes.data?.sales) {
            todayOrders = sumRes.data.sales.total_orders || 0;
            todayRev = sumRes.data.sales.total_revenue || 0;
          }
        }
      } catch (e) {}

      const payload = {
        device_id: deviceId,
        outlet_name: config.outletName,
        device_name: `${platform} (${window.App?.currentUser?.name || 'Staff'})`,
        platform: platform,
        app_version: '1.0.0',
        today_orders: todayOrders,
        today_revenue: todayRev,
        last_seen_at: new Date().toISOString()
      };

      const endpoint = `${config.url}/rest/v1/restobill_heartbeats`;
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Non-critical, ignore heartbeat network error
    }
  },

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Ping every 3 minutes
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 180000);
  },

  /**
   * One-click backfill of all past local SQLite orders to Supabase
   */
  async syncAllPastOrders(progressCallback) {
    const config = this.getConfig();
    if (!config.enabled || !config.url || !config.anonKey) {
      throw new Error('Supabase is not configured or disabled. Please save your Project URL and Key first.');
    }

    if (!navigator.onLine) {
      throw new Error('Device is offline. Please connect to internet to sync past orders.');
    }

    // 1. Fetch all local orders
    const res = await window.api.orders.getAll({ limit: 10000 });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to fetch local orders from database');
    }

    const allOrders = res.data;
    if (allOrders.length === 0) {
      return { total: 0, synced: 0 };
    }

    const formatted = allOrders.map(o => this.formatOrderPayload(o, config));
    const batchSize = 30;
    let synced = 0;

    for (let i = 0; i < formatted.length; i += batchSize) {
      const batch = formatted.slice(i, i + batchSize);
      const endpoint = `${config.url}/rest/v1/restobill_orders`;
      const postRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(batch)
      });

      if (!postRes.ok) {
        const text = await postRes.text();
        throw new Error(`Upload failed at batch ${i + 1}: ${text}`);
      }

      synced += batch.length;
      if (progressCallback) {
        progressCallback(synced, formatted.length);
      }
    }

    return { total: formatted.length, synced };
  }
};
