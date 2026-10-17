const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Google Drive Backup/Restore Service
 * Uses OAuth2 for authentication with Google Drive API
 * 
 * Setup: User needs to create a Google Cloud project with Drive API enabled
 * and download the OAuth2 credentials JSON file.
 */
class GDriveService {
  constructor() {
    this.auth = null;
    this.drive = null;
    this.configPath = '';
    this.tokenPath = '';
    this.credentialsPath = '';
    this.folderName = 'RestoBill_Backups';
    this.folderId = null;
    this.userEmail = null;
  }

  init(userDataPath) {
    this.configPath = userDataPath;
    this.tokenPath = path.join(userDataPath, 'gdrive_token.json');
    this.credentialsPath = this._resolveCredentialsPath();

    // Try to load existing token
    if (fs.existsSync(this.tokenPath) && fs.existsSync(this.credentialsPath)) {
      try {
        this._initClient();
        const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        this.auth.setCredentials(token);
        this.drive = google.drive({ version: 'v3', auth: this.auth });
        console.log('Google Drive: Authenticated from saved token');
        this._fetchUserInfo().catch(() => {});
      } catch (err) {
        console.log('Google Drive: Could not load saved credentials', err.message);
        this.auth = null;
        this.drive = null;
      }
    }
  }

  _resolveCredentialsPath() {
    const candidates = [
      path.join(this.configPath, 'gdrive_credentials.json'),
      path.join(this.configPath, 'credentials.json'),
      path.join(process.cwd(), 'credentials.json'),
      path.join(process.cwd(), 'gdrive_credentials.json'),
      path.join(__dirname, '..', '..', 'credentials.json'),
      path.join(__dirname, '..', '..', 'gdrive_credentials.json'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          if (data.installed || data.web) {
            const target = path.join(this.configPath, 'gdrive_credentials.json');
            if (p !== target && !fs.existsSync(target)) {
              try { fs.writeFileSync(target, raw, 'utf-8'); } catch (e) {}
            }
            return p;
          }
        } catch (e) {}
      }
    }
    return path.join(this.configPath, 'gdrive_credentials.json');
  }

  async _fetchUserInfo() {
    if (!this.drive) return null;
    try {
      const res = await this.drive.about.get({ fields: 'user(displayName, emailAddress)' });
      if (res.data?.user?.emailAddress) {
        this.userEmail = res.data.user.emailAddress;
      }
      return this.userEmail;
    } catch (e) {
      return null;
    }
  }

  _initClient() {
    this.credentialsPath = this._resolveCredentialsPath();

    if (!fs.existsSync(this.credentialsPath)) {
      throw new Error(
        'Google Drive credentials file not found. Place credentials.json in your application folder or gdrive_credentials.json in ' +
        this.credentialsPath
      );
    }

    const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || {};

    if (!client_id || !client_secret) {
      throw new Error('Invalid credentials file. Make sure it contains client_id and client_secret.');
    }

    this.auth = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris ? redirect_uris[0] : 'http://localhost'
    );
  }

  /**
   * Get the authentication URL for the user to authorize
   */
  getAuthUrl() {
    if (!this.auth) {
      this._initClient();
    }

    const authUrl = this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async authenticate(code) {
    if (!this.auth) {
      this._initClient();
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Authorization code cannot be empty.');
    }

    code = code.trim();
    // Auto-extract code if the user pasted the entire redirect URL
    if (code.includes('code=')) {
      const match = code.match(/[?&]code=([^&]+)/);
      if (match) {
        code = decodeURIComponent(match[1]);
      }
    }

    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);

    // Save token
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    await this._fetchUserInfo();

    return {
      authenticated: true,
      connected: true,
      email: this.userEmail,
    };
  }

  /**
   * Get or create the RestoBill backup folder
   */
  async _getOrCreateFolder() {
    if (this.folderId) return this.folderId;

    // Search for existing folder
    const response = await this.drive.files.list({
      q: `name='${this.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files.length > 0) {
      this.folderId = response.data.files[0].id;
    } else {
      // Create folder
      const folder = await this.drive.files.create({
        requestBody: {
          name: this.folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      this.folderId = folder.data.id;
    }

    return this.folderId;
  }

  /**
   * Backup database to Google Drive
   */
  async backupDatabase(dbPath) {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive. Please connect first.');
    }

    if (!fs.existsSync(dbPath)) {
      throw new Error('Database file not found');
    }

    const folderId = await this._getOrCreateFolder();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `restobill_backup_${timestamp}.db`;

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
      description: `RestoBill database backup - ${new Date().toLocaleString('en-IN')}`,
    };

    const media = {
      mimeType: 'application/x-sqlite3',
      body: fs.createReadStream(dbPath),
    };

    // 1. FIRST: Upload new backup file to Google Drive
    const file = await this.drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, size, createdTime',
    });

    console.log(`[GDrive] New backup uploaded: ${file.data.name} (${file.data.id})`);

    // 2. THEN: Only after successful upload, delete previous backup file(s)
    try {
      const existingFiles = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (existingFiles.data.files && existingFiles.data.files.length > 0) {
        const olderFiles = existingFiles.data.files.filter(f => f.id !== file.data.id);
        for (const oldFile of olderFiles) {
          try {
            console.log(`[GDrive] Removing previous backup: ${oldFile.name} (${oldFile.id})`);
            await this.drive.files.delete({ fileId: oldFile.id });
          } catch (delErr) {
            console.warn(`[GDrive] Could not delete old file ${oldFile.id}:`, delErr.message);
          }
        }
      }
    } catch (cleanupErr) {
      console.warn('[GDrive] Cleanup of previous backups failed:', cleanupErr.message);
    }

    // Update last backup time in a local file
    const backupInfo = {
      lastBackup: new Date().toISOString(),
      fileId: file.data.id,
      fileName: file.data.name,
      fileSize: file.data.size,
    };
    fs.writeFileSync(
      path.join(this.configPath, 'last_backup.json'),
      JSON.stringify(backupInfo, null, 2)
    );

    return {
      success: true,
      fileId: file.data.id,
      fileName: file.data.name,
      size: file.data.size,
      timestamp: backupInfo.lastBackup,
    };
  }

  /**
   * Restore database from Google Drive backup
   */
  async restoreDatabase(dbPath, fileId) {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Download the file
    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Create backup of current database first
    const backupPath = dbPath + '.bak.' + Date.now();
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }

    // Write downloaded file
    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(dbPath);
      response.data
        .on('end', () => {
          resolve({
            success: true,
            message: 'Database restored successfully. Please restart the application.',
            backupPath: backupPath,
          });
        })
        .on('error', (err) => {
          // Restore original on failure
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, dbPath);
          }
          reject(new Error('Restore failed: ' + err.message));
        })
        .pipe(dest);
    });
  }

  /**
   * List available backups on Google Drive
   */
  async listBackups() {
    if (!this.drive) {
      return [];
    }

    const folderId = await this._getOrCreateFolder();

    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, createdTime, modifiedTime)',
      orderBy: 'createdTime desc',
      pageSize: 20,
    });

    return response.data.files.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      createdAt: file.createdTime,
      sizeFormatted: this._formatBytes(parseInt(file.size || 0)),
    }));
  }

  /**
   * Get current sync status
   */
  getStatus() {
    const isAuthenticated = !!this.drive;
    let lastBackup = null;

    const lastBackupPath = path.join(this.configPath, 'last_backup.json');
    if (fs.existsSync(lastBackupPath)) {
      try {
        lastBackup = JSON.parse(fs.readFileSync(lastBackupPath, 'utf-8'));
      } catch (e) {
        // Ignore parse errors
      }
    }

    const credPath = this._resolveCredentialsPath();
    const hasCredentials = fs.existsSync(credPath);

    return {
      connected: isAuthenticated,
      authenticated: isAuthenticated,
      email: this.userEmail,
      hasCredentials,
      lastBackup,
      credentialsPath: credPath,
    };
  }

  /**
   * Disconnect from Google Drive
   */
  disconnect() {
    this.auth = null;
    this.drive = null;
    this.folderId = null;
    this.userEmail = null;

    if (fs.existsSync(this.tokenPath)) {
      try {
        fs.unlinkSync(this.tokenPath);
      } catch (e) {}
    }

    return { disconnected: true, connected: false };
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new GDriveService();
