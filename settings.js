const fs = require('fs')
const { app } = require('electron')
let settingsPath = undefined

module.exports = {
  initialize,
  getSettingsPath
}

function initialize () {
  const appRoot = `${app.getPath('home')}/Songrequestbot/`
  if (!fs.existsSync(appRoot)) fs.mkdirSync(appRoot, { recursive: true })
  settingsPath = `${appRoot}settings`
  if (!fs.existsSync(`${settingsPath}.json`)) fs.writeFileSync(`${settingsPath}.json`, '{}')
}

function getSettingsPath () {
  if (settingsPath === undefined) throw new Error('You have to initialize settings before you can access the settings path')
  return settingsPath
}