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
  }

  init(userDataPath) {
    this.configPath = userDataPath;
    this.tokenPath = path.join(userDataPath, 'gdrive_token.json');
    this.credentialsPath = path.join(userDataPath, 'gdrive_credentials.json');

    // Try to load existing token
    if (fs.existsSync(this.tokenPath) && fs.existsSync(this.credentialsPath)) {
      try {
        this._initClient();
        const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        this.auth.setCredentials(token);
        this.drive = google.drive({ version: 'v3', auth: this.auth });
        console.log('Google Drive: Authenticated from saved token');
      } catch (err) {
        console.log('Google Drive: Could not load saved credentials', err.message);
        this.auth = null;
        this.drive = null;
      }
    }
  }

  _initClient() {
    if (!fs.existsSync(this.credentialsPath)) {
      throw new Error(
        'Google Drive credentials not found. Please place your OAuth2 credentials JSON file at: ' +
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
      redirect_uris ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
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

    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);

    // Save token
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));

    this.drive = google.drive({ version: 'v3', auth: this.auth });

    return { authenticated: true };
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

    const file = await this.drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, size, createdTime',
    });

    // Update last backup time in a local file
    const backupInfo = {
      lastBackup: new Date().toISOString(),
      fileId: file.data.id,
      fileName: file.data.name,
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
      timestamp: new Date().toISOString(),
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
      throw new Error('Not authenticated with Google Drive');
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

    const hasCredentials = fs.existsSync(this.credentialsPath);

    return {
      authenticated: isAuthenticated,
      hasCredentials,
      lastBackup,
      credentialsPath: this.credentialsPath,
    };
  }

  /**
   * Disconnect from Google Drive
   */
  disconnect() {
    this.auth = null;
    this.drive = null;
    this.folderId = null;

    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }

    return { disconnected: true };
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
