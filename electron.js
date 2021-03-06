const { app, BrowserWindow, shell } = require('electron')
const { autoUpdater } = require('electron-updater')

// noinspection JSIgnoredPromiseFromCall
autoUpdater.checkForUpdatesAndNotify()

module.exports = createElectronInstance

function createElectronInstance () {
  let win

  function createWindow () {
    win = new BrowserWindow({
      height: 720,
      width: 1080,
      webPreferences: {
        nodeIntegration: true
      }
    })
    win.loadURL(`file://${__dirname}/html/index.html`)
    const openExternalLinksInOSBrowser = (event, url) => {
      if (url.match(/.*localhost.*/gi) === null && url.match(/http(s|):/)) {
        event.preventDefault()
        shell.openExternal(url)
      }
    }
    win.webContents.on('new-window', openExternalLinksInOSBrowser)
    win.webContents.on('will-navigate', openExternalLinksInOSBrowser)
  }

  app.on('ready', createWindow)
  app.on('window-all-closed', electronWindowsClosed)

  function electronWindowsClosed () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') app.quit()
  }

  app.on('activate', onElectronWindowInitialized)

  function onElectronWindowInitialized () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) createWindow()
  }
}