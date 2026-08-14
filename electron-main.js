const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '自律工作台',
    icon: path.join(__dirname, 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 加载本地 HTML 文件
  mainWindow.loadFile('index.html');

  // Electron 中不需要 Service Worker，移除以避免缓存问题
  mainWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    // 允许麦克风权限（心情录音功能需要）
    if (permission === 'media') return callback(true);
    callback(false);
  });

  // 开发时打开 DevTools（发布时注释掉）
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
