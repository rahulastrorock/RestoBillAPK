/**
 * RestoBill - User Management Controller (Admin)
 * Handles staff creation, roles, passwords, status toggles, and deletion
 */

window.UsersUI = {
  users: [],

  async load() {
    this.setupEventListeners();
    await this.fetchUsers();
  },

  setupEventListeners() {
    const addBtn = document.getElementById('btn-add-user');
    if (addBtn) {
      addBtn.onclick = () => this.openAddUserModal();
    }
  },

  async fetchUsers() {
    const grid = document.getElementById('users-grid');
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px;" class="text-center">
          <div class="loading-overlay"><div class="spinner"></div> Loading staff users...</div>
        </div>
      `;
    }

    try {
      const res = await window.api.users.getAll();
      if (res.success && res.data) {
        this.users = res.data;
        this.renderGrid();
      } else {
        window.App.showToast(res.error || 'Failed to load users', 'error');
      }
    } catch (err) {
      console.error('Failed to load users:', err);
      window.App.showToast(err.message, 'error');
    }
  },

  renderGrid() {
    const grid = document.getElementById('users-grid');
    if (!grid) return;

    if (this.users.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1;" class="empty-state">
          <p>No users found</p>
        </div>
      `;
      return;
    }

    const currentUserId = window.App.currentUser?.id;

    grid.innerHTML = this.users.map(user => {
      const isSelf = user.id === currentUserId;
      const role = (user.role || 'cashier').toLowerCase();
      const isActive = user.active === 1 || user.active === true;
      const initial = (user.name || user.username || 'U')[0].toUpperCase();

      return `
        <div class="user-card ${isActive ? '' : 'inactive'}" data-id="${user.id}">
          <div class="user-card-header">
            <div class="user-card-avatar ${role}">
              ${initial}
            </div>
            <div style="flex:1;min-width:0;">
              <div class="user-card-name">${user.name} ${isSelf ? '<small style="color:var(--accent-primary);">(You)</small>' : ''}</div>
              <div class="user-card-username">@${user.username}</div>
            </div>
          </div>
          <div class="user-card-body">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge badge-${role}">${user.role.toUpperCase()}</span>
              <span class="badge ${isActive ? 'badge-completed' : 'badge-voided'}">${isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div class="user-card-actions">
              <button class="action-btn action-view btn-edit-user" data-id="${user.id}" title="Edit User">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              </button>
              <button class="action-btn action-print btn-password-user" data-id="${user.id}" title="Change Password">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/></svg>
              </button>
              ${!isSelf ? `
                <button class="action-btn btn-toggle-active" data-id="${user.id}" data-active="${isActive ? '1' : '0'}" title="${isActive ? 'Deactivate User' : 'Activate User'}">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
                </button>
                <button class="action-btn action-delete btn-delete-user" data-id="${user.id}" data-name="${user.name}" title="Delete User">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card event listeners
    grid.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const user = this.users.find(u => u.id === id);
        if (user) this.openEditUserModal(user);
      };
    });

    grid.querySelectorAll('.btn-password-user').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const user = this.users.find(u => u.id === id);
        if (user) this.openChangePasswordModal(user);
      };
    });

    grid.querySelectorAll('.btn-toggle-active').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        await this.toggleUserActive(id);
      };
    });

    grid.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const name = btn.getAttribute('data-name');
        this.confirmDeleteUser(id, name);
      };
    });
  },

  openAddUserModal() {
    window.App.showModal({
      title: 'Add New Staff User',
      bodyHtml: `
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="modal-user-name" placeholder="e.g. Rahul Sharma" required autofocus>
        </div>
        <div class="form-group">
          <label>Username *</label>
          <input type="text" id="modal-user-username" placeholder="e.g. rahul" required>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="modal-user-role">
            <option value="cashier" selected>Cashier (POS & Orders Only)</option>
            <option value="manager">Manager (POS, Orders, Menu, Reports)</option>
            <option value="admin">Administrator (Full Access)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Password *</label>
          <input type="password" id="modal-user-password" placeholder="Temporary password" required>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Create User',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-user-name')?.value.trim();
            const username = document.getElementById('modal-user-username')?.value.trim();
            const role = document.getElementById('modal-user-role')?.value;
            const password = document.getElementById('modal-user-password')?.value;

            if (!name || !username || !password) {
              window.App.showToast('Please fill all required fields', 'warning');
              return;
            }

            try {
              const res = await window.api.users.add({ name, username, role, password });
              if (res.success) {
                window.App.showToast(`User @${username} created!`, 'success');
                window.App.closeModal();
                await this.fetchUsers();
              } else {
                window.App.showToast(res.error || 'Failed to create user', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openEditUserModal(user) {
    window.App.showModal({
      title: `Edit User: ${user.name}`,
      bodyHtml: `
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="modal-user-name" value="${user.name}" required autofocus>
        </div>
        <div class="form-group">
          <label>Username</label>
          <input type="text" value="@${user.username}" disabled style="opacity:0.6;">
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="modal-user-role">
            <option value="cashier" ${user.role === 'cashier' ? 'selected' : ''}>Cashier</option>
            <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Update User',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = document.getElementById('modal-user-name')?.value.trim();
            const role = document.getElementById('modal-user-role')?.value;

            if (!name) {
              window.App.showToast('Name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.users.update(user.id, { name, role });
              if (res.success) {
                window.App.showToast(`User updated!`, 'success');
                window.App.closeModal();
                await this.fetchUsers();
              } else {
                window.App.showToast(res.error || 'Failed to update user', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openChangePasswordModal(user) {
    window.App.showModal({
      title: `Change Password: @${user.username}`,
      bodyHtml: `
        <div class="form-group">
          <label>New Password *</label>
          <input type="password" id="modal-new-password" placeholder="Enter new password" required autofocus>
        </div>
        <div class="form-group">
          <label>Confirm New Password *</label>
          <input type="password" id="modal-confirm-password" placeholder="Confirm new password" required>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save Password',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const newPassword = document.getElementById('modal-new-password')?.value;
            const confirmPassword = document.getElementById('modal-confirm-password')?.value;

            if (!newPassword || newPassword.length < 4) {
              window.App.showToast('Password must be at least 4 characters', 'warning');
              return;
            }
            if (newPassword !== confirmPassword) {
              window.App.showToast('Passwords do not match', 'warning');
              return;
            }

            try {
              const res = await window.api.auth.changePassword(user.id, null, newPassword);
              if (res.success) {
                window.App.showToast('Password updated successfully!', 'success');
                window.App.closeModal();
              } else {
                window.App.showToast(res.error || 'Failed to change password', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async toggleUserActive(userId) {
    try {
      const res = await window.api.users.toggleActive(userId);
      if (res.success) {
        window.App.showToast('User status updated', 'info');
        await this.fetchUsers();
      }
    } catch (err) {
      window.App.showToast(err.message, 'error');
    }
  },

  confirmDeleteUser(id, name) {
    window.App.showModal({
      title: 'Delete Staff User',
      bodyHtml: `
        <p>Are you sure you want to delete user <strong>${name}</strong>?</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:6px;">This action cannot be undone.</p>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Delete',
          className: 'btn btn-primary btn-sm btn-danger',
          onClick: async () => {
            try {
              const res = await window.api.users.delete(id);
              if (res.success) {
                window.App.showToast(`User ${name} deleted`, 'info');
                window.App.closeModal();
                await this.fetchUsers();
              } else {
                window.App.showToast(res.error || 'Failed to delete user', 'error');
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
