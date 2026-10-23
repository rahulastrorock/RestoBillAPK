/**
 * RestoBill - POS / Billing Controller
 * Handles menu item browsing, category filtering, cart management, GST & discount calculations, and bill saving/printing
 */

window.POS = {
  categories: [],
  items: [],
  activeCategory: 'all',
  searchQuery: '',
  cart: [],
  orderType: 'dine_in',
  paymentMode: 'cash',
  discount: { type: 'percent', value: 0 },
  customerGstin: '',
  customers: [],
  customerId: null,
  selectedCustomer: null,
  activeDropdownIndex: -1,
  filteredCustomers: [],
  editingOrderId: null,
  editingOrderNo: null,
  editingOrderOriginalTotal: null,
  editingOrderOriginal: null,
  listenersAttached: false,

  async init() {
    this.setupEventListeners();
    this.initGridColumns();
    await Promise.all([
      this.loadData(),
      this.loadCustomers()
    ]);
    this.renderCategories();
    this.renderItems();
  },

  initGridColumns() {
    const savedCols = localStorage.getItem('restobill_pos_grid_cols') || '2';
    this.setGridColumns(savedCols === '4' ? '4' : '2');

    const toggleBtn = document.getElementById('btn-toggle-grid-cols');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const grid = document.getElementById('pos-items-grid');
        const is4Cols = grid ? grid.classList.contains('cols-4') : false;
        const next = is4Cols ? '2' : '4';
        this.setGridColumns(next);
      };
    }
  },

  setGridColumns(cols) {
    const grid = document.getElementById('pos-items-grid');
    const toggleBtn = document.getElementById('btn-toggle-grid-cols');
    const label = document.getElementById('grid-toggle-label');

    if (cols === '4') {
      grid?.classList.remove('cols-2');
      grid?.classList.add('cols-4');
      toggleBtn?.classList.add('active');
      if (label) label.textContent = '2 Col';
      toggleBtn?.setAttribute('title', 'Switch to 2 columns view');
      localStorage.setItem('restobill_pos_grid_cols', '4');
    } else {
      grid?.classList.remove('cols-4');
      grid?.classList.add('cols-2');
      toggleBtn?.classList.remove('active');
      if (label) label.textContent = '4 Col';
      toggleBtn?.setAttribute('title', 'Switch to 4 columns compact view');
      localStorage.setItem('restobill_pos_grid_cols', '2');
    }
  },

  setupEventListeners() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Cancel POS Edit button
    const cancelEditBtn = document.getElementById('btn-cancel-pos-edit');
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => this.cancelEditingOrder(true));
    }

    // Search input
    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderItems();
      });

      // Enter key in search: if exactly 1 item matches, add to cart!
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const visibleCards = document.querySelectorAll('#pos-items-grid .pos-item-card');
          if (visibleCards.length === 1) {
            visibleCards[0].click();
            searchInput.value = '';
            this.searchQuery = '';
            this.renderItems();
          }
        }
      });
    }

    // Order type buttons
    document.querySelectorAll('.order-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.orderType = btn.getAttribute('data-type') || 'dine_in';

        // Auto focus table no if dine in
        const tableInput = document.getElementById('pos-table-no');
        if (this.orderType === 'dine_in' && tableInput) {
          tableInput.focus();
        }
      });
    });

    // Payment mode buttons
    document.querySelectorAll('#payment-selector .payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#payment-selector .payment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.paymentMode = btn.getAttribute('data-mode') || 'cash';
      });
    });

    // Customer phone lookup
    const phoneInput = document.getElementById('pos-customer-phone');
    if (phoneInput) {
      phoneInput.addEventListener('blur', async () => {
        const phone = phoneInput.value.trim();
        if (phone.length >= 10) {
          try {
            const res = await window.api.customers.search(phone);
            if (res.success && res.data && res.data.length > 0) {
              const cust = res.data[0];
              this.selectCustomer(cust);
            }
          } catch (e) {
            console.error('Customer lookup error:', e);
          }
        }
      });
    }

    // Customer name autocomplete & dynamic filtering
    this.setupCustomerAutocomplete();

    // Discount button
    const discountBtn = document.getElementById('btn-discount');
    if (discountBtn) {
      discountBtn.addEventListener('click', () => this.openDiscountModal());
    }

    // GSTIN button
    const gstinBtn = document.getElementById('btn-customer-gstin');
    if (gstinBtn) {
      gstinBtn.addEventListener('click', () => this.openGstinModal());
    }

    // Clear order button
    const clearBtn = document.getElementById('btn-clear-order');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.cart.length > 0) {
          this.clearOrder();
          window.App.showToast('Order cleared', 'info');
        }
      });
    }

    // POS Print Preview button
    const previewBtn = document.getElementById('btn-pos-preview');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => this.previewCurrentBill());
    }

    // Save order button
    const saveBtn = document.getElementById('btn-save-order');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveOrder());
    }

    // Save & Print button
    const savePrintBtn = document.getElementById('btn-save-print');
    if (savePrintBtn) {
      savePrintBtn.addEventListener('click', () => this.handleSaveAndPrint());
    }

    // Category horizontal slider navigation buttons
    const catContainer = document.getElementById('pos-categories');
    const scrollLeftBtn = document.getElementById('btn-cat-scroll-left');
    const scrollRightBtn = document.getElementById('btn-cat-scroll-right');

    if (scrollLeftBtn && catContainer) {
      scrollLeftBtn.addEventListener('click', () => {
        catContainer.scrollBy({ left: -220, behavior: 'smooth' });
      });
    }

    if (scrollRightBtn && catContainer) {
      scrollRightBtn.addEventListener('click', () => {
        catContainer.scrollBy({ left: 220, behavior: 'smooth' });
      });
    }

    // Allow mouse wheel to horizontally scroll category bar
    if (catContainer) {
      catContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0 && catContainer.scrollWidth > catContainer.clientWidth) {
          e.preventDefault();
          catContainer.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Mobile POS tab switching
    const tabPosMenu = document.getElementById('tab-pos-menu');
    const tabPosCart = document.getElementById('tab-pos-cart');
    const posLayout = document.getElementById('pos-layout');
    const floatingBar = document.getElementById('pos-mobile-floating-bar');

    if (tabPosMenu) {
      tabPosMenu.addEventListener('click', () => {
        posLayout?.classList.remove('show-cart');
        tabPosMenu.classList.add('active');
        tabPosCart?.classList.remove('active');
        if (this.cart.length > 0 && floatingBar) floatingBar.classList.remove('hidden');
      });
    }

    if (tabPosCart) {
      tabPosCart.addEventListener('click', () => {
        posLayout?.classList.add('show-cart');
        tabPosCart.classList.add('active');
        tabPosMenu?.classList.remove('active');
        if (floatingBar) floatingBar.classList.add('hidden');
      });
    }

    const floatingViewCartBtn = document.getElementById('btn-floating-view-cart');
    if (floatingViewCartBtn) {
      floatingViewCartBtn.addEventListener('click', () => {
        posLayout?.classList.add('show-cart');
        tabPosCart?.classList.add('active');
        tabPosMenu?.classList.remove('active');
        if (floatingBar) floatingBar.classList.add('hidden');
      });
    }

    const mobileBackBtn = document.getElementById('btn-mobile-back-menu');
    if (mobileBackBtn) {
      mobileBackBtn.addEventListener('click', () => {
        posLayout?.classList.remove('show-cart');
        tabPosMenu?.classList.add('active');
        tabPosCart?.classList.remove('active');
        if (this.cart.length > 0 && floatingBar) floatingBar.classList.remove('hidden');
      });
    }
  },

  async loadData() {
    try {
      const [catsRes, itemsRes] = await Promise.all([
        window.api.menu.getCategories(),
        window.api.menu.getAllItems()
      ]);

      if (catsRes.success && catsRes.data) {
        this.categories = catsRes.data;
      }
      if (itemsRes.success && itemsRes.data) {
        this.items = itemsRes.data;
        this.applyCustomItemOrder();
      }
    } catch (err) {
      console.error('Failed to load menu data:', err);
      window.App.showToast('Failed to load menu data', 'error');
    }
  },

  applyCustomItemOrder() {
    try {
      const savedOrder = JSON.parse(localStorage.getItem('restobill_custom_menu_order') || '[]');
      if (Array.isArray(savedOrder) && savedOrder.length > 0) {
        const orderMap = new Map();
        savedOrder.forEach((id, index) => orderMap.set(Number(id), index));

        this.items.sort((a, b) => {
          const indexA = orderMap.has(Number(a.id)) ? orderMap.get(Number(a.id)) : 999999;
          const indexB = orderMap.has(Number(b.id)) ? orderMap.get(Number(b.id)) : 999999;
          return indexA - indexB;
        });
      }
    } catch (e) {
      console.warn('Failed to apply custom item order:', e);
    }
  },

  saveCustomItemOrder() {
    try {
      const orderIds = this.items.map(item => item.id);
      localStorage.setItem('restobill_custom_menu_order', JSON.stringify(orderIds));
    } catch (e) {
      console.warn('Failed to save custom item order:', e);
    }
  },

  renderCategories() {
    const container = document.getElementById('pos-categories');
    if (!container) return;

    let html = `<button class="category-tab ${this.activeCategory === 'all' ? 'active' : ''}" data-category="all">All</button>`;

    for (const cat of this.categories) {
      html += `<button class="category-tab ${this.activeCategory === String(cat.id) ? 'active' : ''}" data-category="${cat.id}">${cat.name}</button>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.category-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-category') || 'all';
        this.renderItems();
      });
    });
  },

  renderItems() {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;

    if (!grid.classList.contains('cols-4') && !grid.classList.contains('cols-2')) {
      const savedCols = localStorage.getItem('restobill_pos_grid_cols') || '2';
      grid.classList.add(savedCols === '4' ? 'cols-4' : 'cols-2');
    }

    let filtered = this.items.filter(item => item.active === 1 || item.active === true);

    // Filter by Category
    if (this.activeCategory !== 'all') {
      filtered = filtered.filter(item => String(item.category_id) === String(this.activeCategory));
    }

    // Filter by Search Query
    if (this.searchQuery) {
      filtered = filtered.filter(item => {
        const name = (item.name || '').toLowerCase();
        const code = (item.short_code || '').toLowerCase();
        return name.includes(this.searchQuery) || code.includes(this.searchQuery);
      });
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1;" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <p>No menu items found</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(item => `
      <div class="pos-item-card" draggable="true" data-item-id="${item.id}" title="Tap to add to bill | Hold or drag to rearrange">
        <div class="item-card-top">
          <span class="item-veg-badge ${item.is_veg ? 'veg' : 'non-veg'}" title="${item.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}"></span>
          <span class="item-drag-handle" title="Hold or drag to rearrange order">⋮⋮</span>
          ${item.short_code ? `<span class="item-code">#${item.short_code}</span>` : ''}
        </div>
        <div class="item-name">${item.name}</div>
        <div class="item-card-bottom">
          <div class="item-price">${window.App.formatCurrency(item.price)}</div>
        </div>
      </div>
    `).join('');

    // Attach drag and drop and click handlers
    this.setupCardDragAndDrop(grid);
  },

  setupCardDragAndDrop(grid) {
    if (!grid) return;
    const cards = grid.querySelectorAll('.pos-item-card');
    let draggedId = null;
    let isDragging = false;
    let touchTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;

    cards.forEach(card => {
      const itemId = parseInt(card.getAttribute('data-item-id'), 10);

      // --- Desktop HTML5 Drag & Drop ---
      card.addEventListener('dragstart', (e) => {
        draggedId = itemId;
        isDragging = true;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', String(itemId));
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedId && draggedId !== itemId) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const srcId = parseInt(e.dataTransfer.getData('text/plain') || draggedId, 10);
        if (srcId && srcId !== itemId) {
          this.reorderItems(srcId, itemId);
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        grid.querySelectorAll('.pos-item-card').forEach(c => c.classList.remove('drag-over'));
        setTimeout(() => { isDragging = false; draggedId = null; }, 100);
      });

      // --- Mobile Touch Drag & Drop ---
      const handle = card.querySelector('.item-drag-handle');
      const startTouchDrag = (touch) => {
        isDragging = true;
        draggedId = itemId;
        card.classList.add('touch-dragging');
        if (navigator.vibrate) navigator.vibrate(40);
      };

      if (handle) {
        handle.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          const touch = e.touches[0];
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          startTouchDrag(touch);
        }, { passive: false });
      }

      card.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchTimer = setTimeout(() => {
          startTouchDrag(touch);
        }, 300);
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const moveDist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);
        if (!isDragging && moveDist > 10) {
          if (touchTimer) clearTimeout(touchTimer);
        }

        if (isDragging) {
          e.preventDefault();
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetCard = el ? el.closest('.pos-item-card') : null;
          cards.forEach(c => c.classList.remove('drag-over'));
          if (targetCard && targetCard !== card) {
            targetCard.classList.add('drag-over');
          }
        }
      }, { passive: false });

      card.addEventListener('touchend', (e) => {
        if (touchTimer) clearTimeout(touchTimer);
        if (isDragging && draggedId) {
          const touch = e.changedTouches[0];
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetCard = el ? el.closest('.pos-item-card') : null;
          if (targetCard) {
            const targetId = parseInt(targetCard.getAttribute('data-item-id'), 10);
            if (targetId && targetId !== draggedId) {
              this.reorderItems(draggedId, targetId);
            }
          }
          cards.forEach(c => {
            c.classList.remove('touch-dragging');
            c.classList.remove('drag-over');
          });
          setTimeout(() => { isDragging = false; draggedId = null; }, 150);
        }
      }, { passive: true });

      card.addEventListener('touchcancel', () => {
        if (touchTimer) clearTimeout(touchTimer);
        cards.forEach(c => {
          c.classList.remove('touch-dragging');
          c.classList.remove('drag-over');
        });
        setTimeout(() => { isDragging = false; draggedId = null; }, 150);
      }, { passive: true });

      // Click to add to bill (only if not dragged)
      card.addEventListener('click', () => {
        if (isDragging) return;
        const item = this.items.find(i => i.id === itemId);
        if (item) this.addToCart(item);
      });
    });
  },

  reorderItems(sourceId, targetId) {
    const srcIndex = this.items.findIndex(i => Number(i.id) === Number(sourceId));
    const targetIndex = this.items.findIndex(i => Number(i.id) === Number(targetId));
    if (srcIndex === -1 || targetIndex === -1 || srcIndex === targetIndex) return;

    // Move item
    const [movedItem] = this.items.splice(srcIndex, 1);
    this.items.splice(targetIndex, 0, movedItem);

    // Save custom order to localStorage
    this.saveCustomItemOrder();

    // Re-render items grid with new order
    this.renderItems();

    if (window.App?.showToast) {
      window.App.showToast(`Arranged "${movedItem.name}"`, 'info', 1500);
    }
  },

  addToCart(item) {
    const existingIndex = this.cart.findIndex(i => i.menu_item_id === item.id);

    if (existingIndex > -1) {
      this.cart[existingIndex].quantity += 1;
    } else {
      this.cart.push({
        menu_item_id: item.id,
        name: item.name,
        price: parseFloat(item.price),
        gst_rate: parseFloat(item.gst_rate || 5),
        is_veg: item.is_veg,
        quantity: 1,
        notes: ''
      });
    }

    this.renderCart();
  },

  updateCartQty(index, delta) {
    if (this.cart[index]) {
      this.cart[index].quantity += delta;
      if (this.cart[index].quantity <= 0) {
        this.cart.splice(index, 1);
      }
      this.renderCart();
    }
  },

  removeCartItem(index) {
    if (this.cart[index]) {
      this.cart.splice(index, 1);
      this.renderCart();
    }
  },

  renderCart() {
    const listEl = document.getElementById('order-items-list');
    const emptyEl = document.getElementById('order-empty');
    const subtotalEl = document.getElementById('order-subtotal');
    const discountRow = document.getElementById('discount-row');
    const discountLabel = document.getElementById('discount-label');
    const discountEl = document.getElementById('order-discount');
    const cgstEl = document.getElementById('order-cgst');
    const sgstEl = document.getElementById('order-sgst');
    const totalEl = document.getElementById('order-total');

    if (!listEl) return;

    if (this.cart.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) {
        listEl.appendChild(emptyEl);
        emptyEl.style.display = 'flex';
      }
      if (subtotalEl) subtotalEl.textContent = window.App.formatCurrency(0);
      if (discountRow) discountRow.style.display = 'none';
      if (cgstEl) cgstEl.textContent = window.App.formatCurrency(0);
      if (sgstEl) sgstEl.textContent = window.App.formatCurrency(0);
      if (totalEl) totalEl.textContent = window.App.formatCurrency(0);
      const mobileBadge = document.getElementById('mobile-cart-badge');
      const floatingBar = document.getElementById('pos-mobile-floating-bar');
      if (mobileBadge) mobileBadge.textContent = '0';
      if (floatingBar) floatingBar.classList.add('hidden');
      return;
    }

    // Hide empty placeholder
    if (emptyEl) emptyEl.style.display = 'none';

    // Render cart items
    listEl.innerHTML = this.cart.map((item, index) => {
      const lineTotal = item.price * item.quantity;
      return `
        <div class="order-item" data-index="${index}">
          <div class="order-item-info">
            <div class="order-item-name">${item.name}</div>
            <div class="order-item-price">${window.App.formatCurrency(item.price)} each</div>
            ${item.notes ? `<div style="font-size:11px;color:var(--accent-primary);">${item.notes}</div>` : ''}
          </div>
          <div class="order-item-qty">
            <button class="qty-btn btn-qty-minus" data-index="${index}">&minus;</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn btn-qty-plus" data-index="${index}">&#43;</button>
          </div>
          <div class="order-item-total">${window.App.formatCurrency(lineTotal)}</div>
          <button class="order-item-remove" data-index="${index}" title="Remove item">&times;</button>
        </div>
      `;
    }).join('');

    // Attach qty & remove listeners
    listEl.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.updateCartQty(idx, -1);
      });
    });

    listEl.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.updateCartQty(idx, 1);
      });
    });

    listEl.querySelectorAll('.order-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.removeCartItem(idx);
      });
    });

    // Optional click on item to edit notes
    listEl.querySelectorAll('.order-item-info').forEach(info => {
      info.addEventListener('click', () => {
        const itemRow = info.closest('.order-item');
        const idx = parseInt(itemRow.getAttribute('data-index'), 10);
        this.openItemNotesModal(idx);
      });
    });

    // ── Calculate Totals ──
    const isInclusive = window.App.settings.gst_inclusive === '1';
    let subtotal = 0;
    let totalTaxable = 0;
    let totalGst = 0;

    for (const item of this.cart) {
      const lineTotal = item.price * item.quantity;
      subtotal += lineTotal;

      const rate = item.gst_rate || 5;
      if (isInclusive) {
        const taxable = (lineTotal * 100) / (100 + rate);
        totalTaxable += taxable;
        totalGst += (lineTotal - taxable);
      } else {
        totalTaxable += lineTotal;
        totalGst += (lineTotal * rate) / 100;
      }
    }

    // Apply Discount
    let discountAmount = 0;
    if (this.discount.value > 0) {
      if (this.discount.type === 'percent') {
        discountAmount = (subtotal * this.discount.value) / 100;
      } else {
        discountAmount = Math.min(this.discount.value, subtotal);
      }

      if (window.App.settings.tax_on_discount === 'after' && subtotal > 0) {
        const discountRatio = discountAmount / subtotal;
        totalGst = totalGst * (1 - discountRatio);
      }
    }

    const cgst = totalGst / 2;
    const sgst = totalGst / 2;

    let grandTotal = 0;
    if (isInclusive) {
      grandTotal = Math.max(0, subtotal - discountAmount);
    } else {
      grandTotal = Math.max(0, subtotal - discountAmount + totalGst);
    }

    const finalTotal = Math.round(grandTotal);

    if (subtotalEl) subtotalEl.textContent = window.App.formatCurrency(subtotal);

    if (discountRow && discountEl && discountLabel) {
      if (discountAmount > 0) {
        discountRow.style.display = 'flex';
        discountLabel.textContent = this.discount.type === 'percent' ? `(${this.discount.value}%)` : '';
        discountEl.textContent = `-${window.App.formatCurrency(discountAmount)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    if (cgstEl) cgstEl.textContent = window.App.formatCurrency(cgst);
    if (sgstEl) sgstEl.textContent = window.App.formatCurrency(sgst);
    if (totalEl) totalEl.textContent = window.App.formatCurrency(finalTotal);

    // Update mobile cart badge & floating action bar
    const totalQty = this.cart.reduce((sum, item) => sum + (parseFloat(item.quantity) || 1), 0);
    const mobileBadge = document.getElementById('mobile-cart-badge');
    const floatingBar = document.getElementById('pos-mobile-floating-bar');
    const floatingCount = document.getElementById('floating-cart-count');
    const floatingTotal = document.getElementById('floating-cart-total');

    if (mobileBadge) mobileBadge.textContent = totalQty;
    if (floatingCount) floatingCount.textContent = `${totalQty} Item${totalQty === 1 ? '' : 's'}`;
    if (floatingTotal) floatingTotal.textContent = window.App.formatCurrency(finalTotal);

    const posLayout = document.getElementById('pos-layout');
    if (posLayout) {
      posLayout.classList.toggle('has-cart', totalQty > 0);
    }

    if (floatingBar) {
      const isViewingCart = posLayout && posLayout.classList.contains('show-cart');
      if (totalQty > 0 && !isViewingCart) {
        floatingBar.classList.remove('hidden');
      } else {
        floatingBar.classList.add('hidden');
      }
    }
  },

  openItemNotesModal(index) {
    const item = this.cart[index];
    if (!item) return;

    window.App.showModal({
      title: `Item Instructions: ${item.name}`,
      bodyHtml: `
        <div class="form-group">
          <label>Kitchen Instruction / Notes</label>
          <input type="text" id="modal-item-notes" value="${item.notes || ''}" placeholder="e.g. Less spicy, no onions, extra crispy" autofocus>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save',
          className: 'btn btn-primary btn-sm',
          onClick: () => {
            const notesInput = document.getElementById('modal-item-notes');
            if (notesInput) {
              item.notes = notesInput.value.trim();
              this.renderCart();
            }
            window.App.closeModal();
          }
        }
      ]
    });
  },

  openDiscountModal() {
    const currentType = this.discount.type;
    const currentValue = this.discount.value;

    window.App.showModal({
      title: 'Apply Discount',
      bodyHtml: `
        <div class="form-group">
          <label>Discount Type</label>
          <div style="display:flex;gap:10px;margin-bottom:12px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="disc_type" value="percent" ${currentType === 'percent' ? 'checked' : ''}> Percentage (%)
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="disc_type" value="amount" ${currentType === 'amount' ? 'checked' : ''}> Flat Amount (₹)
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Discount Value</label>
          <input type="number" id="modal-disc-value" value="${currentValue || ''}" placeholder="Enter value" min="0" step="any" autofocus>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="percent" data-val="5">5%</button>
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="percent" data-val="10">10%</button>
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="percent" data-val="15">15%</button>
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="percent" data-val="20">20%</button>
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="amount" data-val="50">₹50</button>
          <button type="button" class="btn btn-outline btn-sm quick-disc" data-type="amount" data-val="100">₹100</button>
        </div>
      `,
      footerButtons: [
        {
          text: 'Remove Discount',
          className: 'btn btn-outline btn-sm btn-danger',
          onClick: () => {
            this.discount = { type: 'percent', value: 0 };
            this.renderCart();
            window.App.closeModal();
            window.App.showToast('Discount removed', 'info');
          }
        },
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Apply Discount',
          className: 'btn btn-primary btn-sm',
          onClick: () => {
            const typeRadios = document.querySelectorAll('input[name="disc_type"]');
            let selectedType = 'percent';
            typeRadios.forEach(r => { if (r.checked) selectedType = r.value; });

            const valInput = document.getElementById('modal-disc-value');
            const val = parseFloat(valInput?.value || 0);

            if (val < 0) {
              window.App.showToast('Invalid discount value', 'warning');
              return;
            }

            this.discount = { type: selectedType, value: val };
            this.renderCart();
            window.App.closeModal();
            window.App.showToast('Discount applied', 'success');
          }
        }
      ]
    });

    // Quick discount buttons listener
    setTimeout(() => {
      document.querySelectorAll('.quick-disc').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-type');
          const val = btn.getAttribute('data-val');
          const radio = document.querySelector(`input[name="disc_type"][value="${type}"]`);
          if (radio) radio.checked = true;
          const valInput = document.getElementById('modal-disc-value');
          if (valInput) valInput.value = val;
        });
      });
    }, 50);
  },

  openGstinModal() {
    window.App.showModal({
      title: 'Customer GSTIN',
      bodyHtml: `
        <div class="form-group">
          <label>Customer GSTIN (15 Digits)</label>
          <input type="text" id="modal-customer-gstin" value="${this.customerGstin || ''}" placeholder="e.g. 07AAAAA0000A1Z5" maxlength="15" uppercase autofocus>
          <small style="color:var(--text-muted);font-size:11px;margin-top:4px;display:block;">
            For B2B Tax Invoices, customer GSTIN will be printed on the bill.
          </small>
        </div>
      `,
      footerButtons: [
        {
          text: 'Clear',
          className: 'btn btn-outline btn-sm btn-danger',
          onClick: () => {
            this.customerGstin = '';
            this.updateGstinButtonState();
            window.App.closeModal();
            window.App.showToast('GSTIN cleared', 'info');
          }
        },
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save GSTIN',
          className: 'btn btn-primary btn-sm',
          onClick: () => {
            const input = document.getElementById('modal-customer-gstin');
            this.customerGstin = (input?.value || '').trim().toUpperCase();
            this.updateGstinButtonState();
            window.App.closeModal();
            window.App.showToast('Customer GSTIN saved', 'success');
          }
        }
      ]
    });
  },

  clearOrder() {
    this.cart = [];
    this.discount = { type: 'percent', value: 0 };
    this.customerGstin = '';
    this.customerId = null;
    this.selectedCustomer = null;
    this.hideCustomerDropdown();
    this.updateGstinButtonState();
    this.clearEditMode();

    const tableInput = document.getElementById('pos-table-no');
    const nameInput = document.getElementById('pos-customer-name');
    const phoneInput = document.getElementById('pos-customer-phone');

    if (tableInput) tableInput.value = '';
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';

    this.renderCart();
  },

  startEditingOrder(order) {
    if (!order) return false;

    if (this.cart.length > 0 && this.editingOrderId !== order.id) {
      const confirmSwitch = confirm(`Your current POS cart has items. Discard them to edit Order #${order.order_no}?`);
      if (!confirmSwitch) return false;
    }

    this.editingOrderId = order.id;
    this.editingOrderNo = order.order_no;
    this.editingOrderOriginalTotal = order.total;
    this.editingOrderOriginal = order;

    // Populate cart
    this.cart = (order.items || []).map(i => ({
      menu_item_id: i.menu_item_id || i.id,
      name: i.name,
      price: parseFloat(i.price),
      gst_rate: parseFloat(i.gst_rate !== undefined ? i.gst_rate : 5),
      is_veg: i.is_veg !== undefined ? i.is_veg : 1,
      quantity: parseFloat(i.quantity) || 1,
      notes: i.notes || ''
    }));

    // Populate order type
    this.orderType = order.order_type || 'dine_in';
    document.querySelectorAll('.order-type-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-type') === this.orderType);
    });

    // Populate payment mode
    this.paymentMode = order.payment_mode || 'cash';
    document.querySelectorAll('#payment-selector .payment-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === this.paymentMode);
    });

    // Populate table and customer inputs
    const tableInput = document.getElementById('pos-table-no');
    const nameInput = document.getElementById('pos-customer-name');
    const phoneInput = document.getElementById('pos-customer-phone');
    if (tableInput) tableInput.value = order.table_no || '';
    if (nameInput) nameInput.value = order.customer_name || '';
    if (phoneInput) phoneInput.value = order.customer_phone || '';

    this.customerId = order.customer_id || null;
    this.customerGstin = order.customer_gstin || '';
    this.updateGstinButtonState();

    // Populate discount
    this.discount = {
      type: order.discount_type || 'percent',
      value: parseFloat(order.discount_value) || 0
    };

    this.updateEditBanner();
    this.renderCart();

    // Close open modals / slide-in panels
    if (window.App?.closeModal) window.App.closeModal();
    if (window.App?.closeDetailPanel) window.App.closeDetailPanel();

    // Navigate to POS
    window.App.navigate('pos');
    window.App.showToast(`Loaded Order #${order.order_no} for editing`, 'info');
    return true;
  },

  updateEditBanner() {
    const banner = document.getElementById('pos-edit-order-banner');
    const orderNoEl = document.getElementById('pos-edit-order-no');
    const origTotalEl = document.getElementById('pos-edit-orig-total');
    const saveBtn = document.getElementById('btn-save-order');
    const savePrintBtn = document.getElementById('btn-save-print');
    const cancelBtn = document.getElementById('btn-cancel-pos-edit');

    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.cancelEditingOrder(true);
      };
    }

    if (this.editingOrderId) {
      if (banner) banner.classList.remove('hidden');
      if (orderNoEl) orderNoEl.textContent = `#${this.editingOrderNo}`;
      if (origTotalEl) origTotalEl.textContent = `(Original: ${window.App.formatCurrency(this.editingOrderOriginalTotal)})`;
      if (saveBtn) {
        saveBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          Update Bill
        `;
      }
      if (savePrintBtn) {
        savePrintBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
          Update & Print
        `;
      }
    } else {
      if (banner) banner.classList.add('hidden');
      if (saveBtn) {
        saveBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          Save Bill
        `;
      }
      if (savePrintBtn) {
        savePrintBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
          Save & Print
        `;
      }
    }
  },

  cancelEditingOrder(confirmPrompt = true) {
    const doCancel = (destination = 'orders') => {
      this.clearEditMode();
      this.clearOrder();

      // Reset mobile view if in mobile layout
      const posLayout = document.getElementById('pos-layout');
      const tabPosMenu = document.getElementById('tab-pos-menu');
      const tabPosCart = document.getElementById('tab-pos-cart');
      const floatingBar = document.getElementById('pos-mobile-floating-bar');
      posLayout?.classList.remove('show-cart');
      tabPosMenu?.classList.add('active');
      tabPosCart?.classList.remove('active');
      floatingBar?.classList.add('hidden');

      window.App.showToast('Order editing cancelled', 'info');
      if (destination === 'orders' && window.App?.navigate) {
        window.App.navigate('orders');
      }
    };

    if (confirmPrompt && this.editingOrderNo) {
      if (window.App?.showModal) {
        window.App.showModal({
          title: 'Cancel Editing Order',
          bodyHtml: `
            <div style="padding:8px 0;font-size:14px;color:var(--text-secondary);line-height:1.5;">
              Are you sure you want to discard your edits for this order?
              <div style="margin-top:10px;padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border:1px solid var(--border-color);font-weight:700;color:var(--text-primary);font-family:monospace;font-size:13px;">
                Order #${this.editingOrderNo}
              </div>
            </div>
          `,
          footerButtons: [
            { text: 'Keep Editing', className: 'btn btn-outline btn-sm' },
            {
              text: 'Start New Bill (Stay in POS)',
              className: 'btn btn-outline btn-sm',
              onClick: () => {
                window.App.closeModal();
                doCancel('pos');
              }
            },
            {
              text: 'Discard & Exit to Orders',
              className: 'btn btn-primary btn-sm btn-danger',
              onClick: () => {
                window.App.closeModal();
                doCancel('orders');
              }
            }
          ]
        });
        return;
      }
    }

    doCancel();
  },

  clearEditMode() {
    this.editingOrderId = null;
    this.editingOrderNo = null;
    this.editingOrderOriginalTotal = null;
    this.editingOrderOriginal = null;
    this.updateEditBanner();
  },

  async handleSaveOrder() {
    const autoPrint = window.App.settings?.auto_print_on_save === '1';
    return this.submitOrder(autoPrint);
  },

  async handleSaveAndPrint() {
    return this.submitOrder(true);
  },

  async submitOrder(shouldPrint = false) {
    if (this.cart.length === 0) {
      window.App.showToast('Cart is empty. Please add items to order.', 'warning');
      return;
    }

    if (!window.App.currentUser) {
      window.App.showToast('Please login to place orders', 'error');
      return;
    }

    const tableNo = (document.getElementById('pos-table-no')?.value || '').trim();
    const customerName = (document.getElementById('pos-customer-name')?.value || '').trim();
    const customerPhone = (document.getElementById('pos-customer-phone')?.value || '').trim();

    const orderData = {
      items: this.cart,
      table_no: tableNo,
      order_type: this.orderType,
      customer_id: this.customerId || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_gstin: this.customerGstin || '',
      user_id: window.App.currentUser?.id || 1,
      user_name: window.App.currentUser?.name || window.App.currentUser?.username || 'Admin',
      discount_type: this.discount.type,
      discount_value: this.discount.value,
      payment_mode: this.paymentMode,
      payment_details: '',
      notes: ''
    };

    const saveBtn = document.getElementById('btn-save-order');
    const savePrintBtn = document.getElementById('btn-save-print');
    if (saveBtn) saveBtn.disabled = true;
    if (savePrintBtn) savePrintBtn.disabled = true;

    try {
      let res;
      const isEditing = Boolean(this.editingOrderId);

      if (isEditing) {
        res = await window.api.orders.update(this.editingOrderId, orderData);
      } else {
        res = await window.api.orders.create(orderData);
      }

      if (res.success && res.data) {
        const processedOrder = res.data;
        const actionLabel = isEditing ? 'updated' : 'saved';
        window.App.showToast(`Order #${processedOrder.order_no} ${actionLabel} successfully! (₹${processedOrder.total})`, 'success');

        if (shouldPrint) {
          try {
            await window.api.print.receipt(processedOrder, window.App.settings);
            window.App.showToast('Receipt sent to printer', 'info');
          } catch (printErr) {
            console.error('Print error:', printErr);
            window.App.showToast('Could not print receipt automatically', 'warning');
          }
        }

        this.clearEditMode();
        this.clearOrder();

        // Refresh Orders and Dashboard background data
        if (window.OrdersUI?.fetchOrders) {
          window.OrdersUI.fetchOrders().catch(() => {});
        }
        if (window.Dashboard?.load) {
          window.Dashboard.load().catch(() => {});
        }

        if (isEditing) {
          window.App.navigate('orders');
        }
      } else {
        window.App.showToast(res.error || (isEditing ? 'Failed to update order' : 'Failed to create order'), 'error');
      }
    } catch (err) {
      console.error('Order submission error:', err);
      window.App.showToast(err.message || 'Error processing order', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (savePrintBtn) savePrintBtn.disabled = false;
    }
  },

  async previewCurrentBill() {
    if (this.cart.length === 0) {
      window.App.showToast('Please add items to cart to preview bill', 'warning');
      return;
    }

    const tableNo = (document.getElementById('pos-table-no')?.value || '').trim();
    const customerName = (document.getElementById('pos-customer-name')?.value || '').trim();
    const customerPhone = (document.getElementById('pos-customer-phone')?.value || '').trim();

    const isInclusive = window.App.settings.gst_inclusive === '1';
    let subtotal = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    const items = this.cart.map(i => {
      const lineTotal = i.price * i.quantity;
      subtotal += lineTotal;
      const rate = i.gst_rate || 5;
      let taxable, cgst, sgst;
      if (isInclusive) {
        taxable = Math.round(((lineTotal * 100) / (100 + rate)) * 100) / 100;
        const gst = lineTotal - taxable;
        cgst = Math.round((gst / 2) * 100) / 100;
        sgst = Math.round((gst / 2) * 100) / 100;
      } else {
        taxable = lineTotal;
        const gst = Math.round(((lineTotal * rate) / 100) * 100) / 100;
        cgst = Math.round((gst / 2) * 100) / 100;
        sgst = Math.round((gst / 2) * 100) / 100;
      }
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;

      return {
        ...i,
        quantity: i.quantity,
        price: i.price,
        total: lineTotal,
        taxable_amount: taxable,
        cgst: cgst,
        sgst: sgst
      };
    });

    let discountAmount = 0;
    if (this.discount.value > 0) {
      if (this.discount.type === 'percent') {
        discountAmount = (subtotal * this.discount.value) / 100;
      } else {
        discountAmount = Math.min(this.discount.value, subtotal);
      }
      if (window.App.settings.tax_on_discount === 'after' && subtotal > 0) {
        const discountRatio = discountAmount / subtotal;
        totalCgst = totalCgst * (1 - discountRatio);
        totalSgst = totalSgst * (1 - discountRatio);
      }
    }

    const grandTotal = Math.round(isInclusive ? Math.max(0, subtotal - discountAmount) : Math.max(0, subtotal - discountAmount + totalCgst + totalSgst));

    // Build temporary order object for preview
    const tempOrder = {
      order_no: `PREVIEW`,
      table_no: tableNo,
      order_type: this.orderType,
      customer_name: customerName || 'Guest',
      customer_phone: customerPhone,
      customer_gstin: this.customerGstin,
      user_name: window.App?.currentUser?.name || window.App?.currentUser?.username || 'Cashier',
      payment_mode: this.paymentMode,
      created_at: new Date().toISOString(),
      items: items,
      subtotal: subtotal,
      discount_amount: discountAmount,
      discount_type: this.discount.type,
      discount_value: this.discount.value,
      taxable_amount: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      cgst_total: totalCgst,
      sgst_total: totalSgst,
      round_off: 0,
      total: grandTotal,
      notes: ''
    };

    await window.App.showPrintPreview(tempOrder, window.App.settings);
  },

  // ─── Customer Autocomplete & Directory Methods ─────────────────

  async loadCustomers() {
    try {
      const res = await window.api.customers.getAll();
      if (res.success && res.data) {
        this.customers = res.data;
      }
    } catch (err) {
      console.error('Failed to load customers for POS:', err);
    }
  },

  setupCustomerAutocomplete() {
    const nameInput = document.getElementById('pos-customer-name');
    const dropdown = document.getElementById('pos-customer-dropdown');
    const quickAddBtn = document.getElementById('btn-quick-add-customer');

    if (quickAddBtn) {
      quickAddBtn.onclick = (e) => {
        e.stopPropagation();
        const currentName = nameInput ? nameInput.value.trim() : '';
        const currentPhone = document.getElementById('pos-customer-phone')?.value.trim() || '';
        this.openAddCustomerModal(currentName, currentPhone);
      };
    }

    if (!nameInput) return;

    // Keystroke dynamic filtering
    nameInput.addEventListener('input', (e) => {
      const val = e.target.value;
      // If user manually edited name away from selected customer, reset customerId
      if (this.selectedCustomer && this.selectedCustomer.name !== val) {
        this.customerId = null;
        this.selectedCustomer = null;
      }
      this.filterCustomers(val);
    });

    // Focus opens dropdown with matching / recent suggestions
    nameInput.addEventListener('focus', () => {
      this.filterCustomers(nameInput.value);
    });

    // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
    nameInput.addEventListener('keydown', (e) => {
      if (!dropdown || dropdown.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          this.filterCustomers(nameInput.value);
          e.preventDefault();
        }
        return;
      }

      const items = dropdown.querySelectorAll('.customer-dropdown-item');
      const actionBtn = dropdown.querySelector('.customer-dropdown-action');
      const totalCount = items.length + (actionBtn ? 1 : 0);

      if (totalCount === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeDropdownIndex = (this.activeDropdownIndex + 1) % totalCount;
        this.highlightDropdownItem(dropdown);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeDropdownIndex = (this.activeDropdownIndex - 1 + totalCount) % totalCount;
        this.highlightDropdownItem(dropdown);
      } else if (e.key === 'Enter') {
        if (this.activeDropdownIndex >= 0) {
          e.preventDefault();
          e.stopPropagation();
          if (this.activeDropdownIndex < items.length) {
            items[this.activeDropdownIndex].click();
          } else if (actionBtn) {
            actionBtn.click();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideCustomerDropdown();
      }
    });

    // Document click to hide dropdown when clicking outside
    document.addEventListener('pointerdown', (e) => {
      const metaContainer = document.getElementById('order-meta-container');
      if (metaContainer && !metaContainer.contains(e.target)) {
        this.hideCustomerDropdown();
      }
    });
  },

  filterCustomers(query) {
    const dropdown = document.getElementById('pos-customer-dropdown');
    if (!dropdown) return;

    const term = (query || '').trim().toLowerCase();
    this.activeDropdownIndex = -1;

    let matches = [];
    if (!term) {
      matches = this.customers.slice(0, 8);
    } else {
      matches = this.customers.filter(c => {
        const nameMatch = c.name && c.name.toLowerCase().includes(term);
        const phoneMatch = c.phone && c.phone.includes(term);
        const gstinMatch = c.gstin && c.gstin.toLowerCase().includes(term);
        return nameMatch || phoneMatch || gstinMatch;
      }).slice(0, 8);
    }
    this.filteredCustomers = matches;

    let html = `
      <div class="customer-dropdown-header">
        <span>${term ? 'Matching Customers' : 'Customer Directory'}</span>
        <span class="customer-dropdown-count">${matches.length} found</span>
      </div>
    `;

    if (matches.length > 0) {
      html += '<div class="customer-dropdown-list">';
      matches.forEach((cust, idx) => {
        const initial = (cust.name || 'C')[0].toUpperCase();
        const highlightedName = this.highlightMatch(cust.name, term);
        const phoneDisplay = cust.phone ? `📞 ${this.highlightMatch(cust.phone, term)}` : '';
        const gstinBadge = cust.gstin ? `<span class="cust-badge-gstin">${cust.gstin}</span>` : '';

        html += `
          <div class="customer-dropdown-item" data-index="${idx}" data-id="${cust.id}">
            <div class="cust-item-avatar">${initial}</div>
            <div class="cust-item-info">
              <div class="cust-item-name">${highlightedName}</div>
              <div class="cust-item-meta">
                ${phoneDisplay ? `<span class="cust-item-phone">${phoneDisplay}</span>` : ''}
                ${gstinBadge}
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else if (term) {
      html += `<div class="customer-dropdown-empty">No customer found matching "<strong>${this.escapeHtml(query.trim())}</strong>"</div>`;
    }

    // Bottom action button: Add customer to list
    const addLabel = term ? `Add "${this.escapeHtml(query.trim())}" to customer list` : 'Add New Customer to Directory';
    html += `
      <div class="customer-dropdown-footer">
        <button type="button" class="customer-dropdown-action" id="dropdown-add-customer">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          <span>➕ ${addLabel}</span>
        </button>
      </div>
    `;

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');

    // Attach click events
    dropdown.querySelectorAll('.customer-dropdown-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(item.getAttribute('data-id'), 10);
        const cust = this.customers.find(c => c.id === id);
        if (cust) {
          this.selectCustomer(cust);
        }
      };
    });

    const addBtn = dropdown.querySelector('#dropdown-add-customer');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        this.hideCustomerDropdown();
        const currentName = document.getElementById('pos-customer-name')?.value.trim() || '';
        const currentPhone = document.getElementById('pos-customer-phone')?.value.trim() || '';
        this.openAddCustomerModal(currentName, currentPhone);
      };
    }
  },

  highlightMatch(text, term) {
    if (!text) return '';
    if (!term) return this.escapeHtml(text);
    const escapedText = this.escapeHtml(text);
    const escapedTerm = this.escapeHtml(term);
    const regex = new RegExp(`(${escapedTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
  },

  highlightDropdownItem(dropdown) {
    const items = dropdown.querySelectorAll('.customer-dropdown-item');
    const actionBtn = dropdown.querySelector('.customer-dropdown-action');
    items.forEach(el => el.classList.remove('active'));
    if (actionBtn) actionBtn.classList.remove('active');

    if (this.activeDropdownIndex >= 0 && this.activeDropdownIndex < items.length) {
      const activeEl = items[this.activeDropdownIndex];
      activeEl.classList.add('active');
      activeEl.scrollIntoView({ block: 'nearest' });
    } else if (this.activeDropdownIndex === items.length && actionBtn) {
      actionBtn.classList.add('active');
      actionBtn.scrollIntoView({ block: 'nearest' });
    }
  },

  hideCustomerDropdown() {
    const dropdown = document.getElementById('pos-customer-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
      this.activeDropdownIndex = -1;
    }
  },

  selectCustomer(cust) {
    if (!cust) return;
    this.customerId = cust.id;
    this.selectedCustomer = cust;
    this.customerGstin = cust.gstin || '';

    const nameInput = document.getElementById('pos-customer-name');
    const phoneInput = document.getElementById('pos-customer-phone');
    if (nameInput) nameInput.value = cust.name || '';
    if (phoneInput && cust.phone) phoneInput.value = cust.phone;

    this.updateGstinButtonState();
    this.hideCustomerDropdown();
  },

  updateGstinButtonState() {
    const gstinBtn = document.getElementById('btn-customer-gstin');
    if (!gstinBtn) return;
    if (this.customerGstin) {
      gstinBtn.classList.add('active');
      gstinBtn.title = `Customer GSTIN: ${this.customerGstin}`;
    } else {
      gstinBtn.classList.remove('active');
      gstinBtn.title = 'Customer GSTIN';
    }
  },

  openAddCustomerModal(initialName = '', initialPhone = '') {
    if (window.CustomersUI?.openAddCustomerModal) {
      window.CustomersUI.openAddCustomerModal(initialName, initialPhone);
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
