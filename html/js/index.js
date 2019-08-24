const { ipcRenderer } = require('electron')
const $ = require('jquery')
refresh()
async function refresh () {
  await sleep(5000)
  const song = ipcRenderer.sendSync('refresh')
  $('iframe').attr('src', `https://www.youtube.com/embed/${Object.keys(song)[0].split('/')[Object.keys(song)[0].split('/')['length'] - 1]}?autoplay=1`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}