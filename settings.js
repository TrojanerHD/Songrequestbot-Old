const fs = require('fs')
const { app } = require('electron')
let paths = {}

module.exports = {
  initialize,
  getPath
}

function initialize () {
  const appRoot = `${app.getPath('home')}/Songrequestbot/`
  if (!fs.existsSync(appRoot)) fs.mkdirSync(appRoot, { recursive: true })
  paths['settingsPath'] = `${appRoot}settings`
  for (const path of Object.values(paths)) if (!fs.existsSync(`${path}.json`)) fs.writeFileSync(`${path}.json`, '{}')

  paths['secretsPath'] = `${appRoot}secrets`
}

function getPath (path) {
  const { settingsPath, secretsPath } = paths
  switch (path) {
    case 'settings':
      if (settingsPath === undefined) throw new Error('You have to initialize settings before you can access the settings path')
      return settingsPath
    case 'secrets':
      if (secretsPath === undefined) throw new Error('You have to initialize settings before you can access the secrets path')
      return secretsPath
  }
}