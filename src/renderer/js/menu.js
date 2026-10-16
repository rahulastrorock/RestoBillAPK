/**
 * RestoBill - Menu Management Controller
 * Handles menu items & categories CRUD, tabs, modals, and tables
 */

window.MenuUI = {
  activeTab: 'items',
  items: [],
  categories: [],

  async load() {
    this.setupEventListeners();
    await this.refreshData();
    this.render();
  },

  setupEventListeners() {
    const tabItems = document.getElementById('tab-menu-items');
    const tabCats = document.getElementById('tab-categories');
    const btnAddItem = document.getElementById('btn-add-menu-item');
    const btnAddCat = document.getElementById('btn-add-category');

    if (tabItems) {
      tabItems.onclick = () => this.switchTab('items');
    }
    if (tabCats) {
      tabCats.onclick = () => this.switchTab('categories');
    }

    if (btnAddItem) {
      btnAddItem.onclick = () => this.openAddItemModal();
    }
    if (btnAddCat) {
      btnAddCat.onclick = () => this.openAddCategoryModal();
    }
  },

  async refreshData() {
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
      }
    } catch (err) {
      console.error('Failed to load menu data:', err);
      window.App.showToast('Failed to load menu data', 'error');
    }
  },

  switchTab(tab) {
    this.activeTab = tab;

    const tabItems = document.getElementById('tab-menu-items');
    const tabCats = document.getElementById('tab-categories');
    const itemsPanel = document.getElementById('menu-items-tab');
    const catsPanel = document.getElementById('categories-tab');
    const btnAddItem = document.getElementById('btn-add-menu-item');
    const btnAddCat = document.getElementById('btn-add-category');

    if (tab === 'items') {
      tabItems?.classList.add('active');
      tabCats?.classList.remove('active');
      itemsPanel?.classList.remove('hidden');
      itemsPanel?.classList.add('active');
      catsPanel?.classList.add('hidden');
      catsPanel?.classList.remove('active');
      btnAddItem?.classList.remove('hidden');
      btnAddCat?.classList.add('hidden');
      this.renderItemsTable();
    } else {
      tabCats?.classList.add('active');
      tabItems?.classList.remove('active');
      catsPanel?.classList.remove('hidden');
      catsPanel?.classList.add('active');
      itemsPanel?.classList.add('hidden');
      itemsPanel?.classList.remove('active');
      btnAddCat?.classList.remove('hidden');
      btnAddItem?.classList.add('hidden');
      this.renderCategoriesTable();
    }
  },

  render() {
    this.switchTab(this.activeTab);
  },

  renderItemsTable() {
    const tbody = document.getElementById('menu-items-tbody');
    if (!tbody) return;

    if (this.items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center" style="padding: 40px; color: var(--text-muted);">
            No menu items found. Click "+ Add Item" to create one.
          </td>
        </tr>
      `;
      return;
    }

    const categoryMap = {};
    for (const cat of this.categories) {
      categoryMap[cat.id] = cat.name;
    }

    tbody.innerHTML = this.items.map(item => `
      <tr>
        <td style="font-weight:600; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          <span class="item-veg-badge ${item.is_veg ? 'veg' : 'non-veg'}" style="margin:0;"></span>
          ${item.name}
        </td>
        <td><code>${item.short_code || '-'}</code></td>
        <td>${categoryMap[item.category_id] || item.category_name || '-'}</td>
        <td style="font-weight:600; color:var(--accent-primary);">${window.App.formatCurrency(item.price)}</td>
        <td>${item.gst_rate}%</td>
        <td>${item.hsn_sac || '996331'}</td>
        <td>
          <span class="badge ${item.is_veg ? 'badge-cashier' : 'badge-voided'}">
            ${item.is_veg ? 'Veg' : 'Non-Veg'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="action-btn action-view btn-edit-item" data-id="${item.id}" title="Edit Item">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            </button>
            <button class="action-btn action-delete btn-delete-item" data-id="${item.id}" data-name="${item.name}" title="Delete Item">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach listeners
    tbody.querySelectorAll('.btn-edit-item').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const item = this.items.find(i => i.id === id);
        if (item) this.openEditItemModal(item);
      };
    });

    tbody.querySelectorAll('.btn-delete-item').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const name = btn.getAttribute('data-name');
        this.confirmDeleteItem(id, name);
      };
    });
  },

  renderCategoriesTable() {
    const tbody = document.getElementById('categories-tbody');
    if (!tbody) return;

    if (this.categories.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center" style="padding: 40px; color: var(--text-muted);">
            No categories found. Click "+ Add Category" to create one.
          </td>
        </tr>
      `;
      return;
    }

    // Count items per category
    const countMap = {};
    for (const item of this.items) {
      countMap[item.category_id] = (countMap[item.category_id] || 0) + 1;
    }

    tbody.innerHTML = this.categories.map(cat => `
      <tr>
        <td style="font-weight:600; color:var(--text-primary);">${cat.name}</td>
        <td>${cat.description || '-'}</td>
        <td>${cat.sort_order || 0}</td>
        <td><span class="badge badge-manager">${countMap[cat.id] || 0} items</span></td>
        <td>
          <div class="action-btns">
            <button class="action-btn action-view btn-edit-cat" data-id="${cat.id}" title="Edit Category">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            </button>
            <button class="action-btn action-delete btn-delete-cat" data-id="${cat.id}" data-name="${cat.name}" title="Delete Category">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-cat').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const cat = this.categories.find(c => c.id === id);
        if (cat) this.openEditCategoryModal(cat);
      };
    });

    tbody.querySelectorAll('.btn-delete-cat').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const name = btn.getAttribute('data-name');
        this.confirmDeleteCategory(id, name);
      };
    });
  },

  openAddItemModal() {
    const categoryOptions = this.categories.map(c => `
      <option value="${c.id}">${c.name}</option>
    `).join('');

    window.App.showModal({
      title: 'Add New Menu Item',
      bodyHtml: `
        <div class="form-group">
          <label>Item Name *</label>
          <input type="text" id="modal-item-name" placeholder="e.g. Paneer Butter Masala" required autofocus>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Short Code</label>
            <input type="text" id="modal-item-code" placeholder="e.g. PBM01">
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select id="modal-item-category">
              ${categoryOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Price (₹) *</label>
            <input type="number" id="modal-item-price" placeholder="0.00" min="0" step="any" required>
          </div>
          <div class="form-group">
            <label>GST Rate (%)</label>
            <select id="modal-item-gst">
              <option value="5" selected>5% (Restaurant)</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="0">0% (Nil)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>HSN / SAC Code</label>
            <input type="text" id="modal-item-hsn" value="996331">
          </div>
          <div class="form-group">
            <label>Dietary Type</label>
            <div style="display:flex; gap:16px; margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="modal_is_veg" value="1" checked> 🟢 Veg
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="modal_is_veg" value="0"> 🔴 Non-Veg
              </label>
            </div>
          </div>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save Item',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-item-name')?.value.trim();
            const code = document.getElementById('modal-item-code')?.value.trim();
            const categoryId = document.getElementById('modal-item-category')?.value;
            const price = parseFloat(document.getElementById('modal-item-price')?.value || 0);
            const gstRate = parseFloat(document.getElementById('modal-item-gst')?.value || 5);
            const hsn = document.getElementById('modal-item-hsn')?.value.trim() || '996331';
            const isVeg = document.querySelector('input[name="modal_is_veg"]:checked')?.value === '1';

            if (!name) {
              window.App.showToast('Item name is required', 'warning');
              return;
            }
            if (price <= 0) {
              window.App.showToast('Please enter a valid price', 'warning');
              return;
            }

            try {
              const res = await window.api.menu.addItem({
                name,
                short_code: code,
                category_id: parseInt(categoryId, 10),
                price,
                gst_rate: gstRate,
                hsn_sac: hsn,
                is_veg: isVeg ? 1 : 0
              });

              if (res.success) {
                window.App.showToast(`Item "${name}" created successfully!`, 'success');
                window.App.closeModal();
                await this.refreshData();
                this.renderItemsTable();
                if (window.POS?.loadData) window.POS.loadData();
              } else {
                window.App.showToast(res.error || 'Failed to add item', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openEditItemModal(item) {
    const categoryOptions = this.categories.map(c => `
      <option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${c.name}</option>
    `).join('');

    window.App.showModal({
      title: `Edit Item: ${item.name}`,
      bodyHtml: `
        <div class="form-group">
          <label>Item Name *</label>
          <input type="text" id="modal-item-name" value="${item.name}" required autofocus>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Short Code</label>
            <input type="text" id="modal-item-code" value="${item.short_code || ''}">
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select id="modal-item-category">
              ${categoryOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Price (₹) *</label>
            <input type="number" id="modal-item-price" value="${item.price}" min="0" step="any" required>
          </div>
          <div class="form-group">
            <label>GST Rate (%)</label>
            <select id="modal-item-gst">
              <option value="5" ${item.gst_rate == 5 ? 'selected' : ''}>5% (Restaurant)</option>
              <option value="12" ${item.gst_rate == 12 ? 'selected' : ''}>12%</option>
              <option value="18" ${item.gst_rate == 18 ? 'selected' : ''}>18%</option>
              <option value="0" ${item.gst_rate == 0 ? 'selected' : ''}>0% (Nil)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>HSN / SAC Code</label>
            <input type="text" id="modal-item-hsn" value="${item.hsn_sac || '996331'}">
          </div>
          <div class="form-group">
            <label>Dietary Type</label>
            <div style="display:flex; gap:16px; margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="modal_is_veg" value="1" ${item.is_veg ? 'checked' : ''}> 🟢 Veg
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="modal_is_veg" value="0" ${!item.is_veg ? 'checked' : ''}> 🔴 Non-Veg
              </label>
            </div>
          </div>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Update Item',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-item-name')?.value.trim();
            const code = document.getElementById('modal-item-code')?.value.trim();
            const categoryId = document.getElementById('modal-item-category')?.value;
            const price = parseFloat(document.getElementById('modal-item-price')?.value || 0);
            const gstRate = parseFloat(document.getElementById('modal-item-gst')?.value || 5);
            const hsn = document.getElementById('modal-item-hsn')?.value.trim() || '996331';
            const isVeg = document.querySelector('input[name="modal_is_veg"]:checked')?.value === '1';

            if (!name) {
              window.App.showToast('Item name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.menu.updateItem(item.id, {
                name,
                short_code: code,
                category_id: parseInt(categoryId, 10),
                price,
                gst_rate: gstRate,
                hsn_sac: hsn,
                is_veg: isVeg ? 1 : 0
              });

              if (res.success) {
                window.App.showToast(`Item "${name}" updated!`, 'success');
                window.App.closeModal();
                await this.refreshData();
                this.renderItemsTable();
                if (window.POS?.loadData) window.POS.loadData();
              } else {
                window.App.showToast(res.error || 'Failed to update item', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  confirmDeleteItem(id, name) {
    window.App.showModal({
      title: 'Delete Menu Item',
      bodyHtml: `
        <p>Are you sure you want to delete <strong>${name}</strong>?</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:6px;">This item will no longer appear on the POS screen.</p>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Delete',
          className: 'btn btn-primary btn-sm btn-danger',
          onClick: async () => {
            try {
              const res = await window.api.menu.deleteItem(id);
              if (res.success) {
                window.App.showToast(`Item "${name}" deleted`, 'info');
                window.App.closeModal();
                await this.refreshData();
                this.renderItemsTable();
                if (window.POS?.loadData) window.POS.loadData();
              } else {
                window.App.showToast(res.error || 'Failed to delete item', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openAddCategoryModal() {
    window.App.showModal({
      title: 'Add New Category',
      bodyHtml: `
        <div class="form-group">
          <label>Category Name *</label>
          <input type="text" id="modal-cat-name" placeholder="e.g. Desserts" required autofocus>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="modal-cat-desc" placeholder="Brief description">
        </div>
        <div class="form-group">
          <label>Sort Order</label>
          <input type="number" id="modal-cat-sort" value="${this.categories.length + 1}">
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save Category',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-cat-name')?.value.trim();
            const desc = document.getElementById('modal-cat-desc')?.value.trim();
            const sort = parseInt(document.getElementById('modal-cat-sort')?.value || 0, 10);

            if (!name) {
              window.App.showToast('Category name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.menu.addCategory({ name, description: desc, sort_order: sort });
              if (res.success) {
                window.App.showToast(`Category "${name}" created!`, 'success');
                window.App.closeModal();
                await this.refreshData();
                this.renderCategoriesTable();
                if (window.POS?.loadData) {
                  await window.POS.loadData();
                  window.POS.renderCategories();
                }
              } else {
                window.App.showToast(res.error || 'Failed to add category', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openEditCategoryModal(cat) {
    window.App.showModal({
      title: `Edit Category: ${cat.name}`,
      bodyHtml: `
        <div class="form-group">
          <label>Category Name *</label>
          <input type="text" id="modal-cat-name" value="${cat.name}" required autofocus>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="modal-cat-desc" value="${cat.description || ''}">
        </div>
        <div class="form-group">
          <label>Sort Order</label>
          <input type="number" id="modal-cat-sort" value="${cat.sort_order || 0}">
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Update Category',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-cat-name')?.value.trim();
            const desc = document.getElementById('modal-cat-desc')?.value.trim();
            const sort = parseInt(document.getElementById('modal-cat-sort')?.value || 0, 10);

            if (!name) {
              window.App.showToast('Category name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.menu.updateCategory(cat.id, { name, description: desc, sort_order: sort });
              if (res.success) {
                window.App.showToast(`Category "${name}" updated!`, 'success');
                window.App.closeModal();
                await this.refreshData();
                this.renderCategoriesTable();
                if (window.POS?.loadData) {
                  await window.POS.loadData();
                  window.POS.renderCategories();
                }
              } else {
                window.App.showToast(res.error || 'Failed to update category', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  confirmDeleteCategory(id, name) {
    window.App.showModal({
      title: 'Delete Category',
      bodyHtml: `
        <p>Are you sure you want to delete category <strong>${name}</strong>?</p>
        <p style="color:var(--color-danger);font-size:12px;margin-top:6px;">Warning: Make sure no active menu items belong to this category.</p>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Delete',
          className: 'btn btn-primary btn-sm btn-danger',
          onClick: async () => {
            try {
              const res = await window.api.menu.deleteCategory(id);
              if (res.success) {
                window.App.showToast(`Category "${name}" deleted`, 'info');
                window.App.closeModal();
                await this.refreshData();
                this.renderCategoriesTable();
                if (window.POS?.loadData) {
                  await window.POS.loadData();
                  window.POS.renderCategories();
                }
              } else {
                window.App.showToast(res.error || 'Failed to delete category', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  }
};
