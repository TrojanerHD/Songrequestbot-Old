const request = require('request-promise')
let accessToken = false
let spotifySong = undefined
module.exports = {
  getUrl,
  setAccessToken,
  refresh,
  setSpotifySong
}

function getUrl (allArgs, channel, context) {
  if (!accessToken) return
  const id = allArgs.split('/')[allArgs.split('/')['length'] - 1].split('?')[0]
  request.get({
    url: `https://api.spotify.com/v1/tracks/${id}`,
    json: true,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).then(spotifyTitle).catch(console.error)

  function spotifyTitle (body) {
    spotifySong = {
      spotifySong: body,
      allArgs,
      channel,
      id,
      context
    }
  }
}

function setAccessToken (newAccessToken) {
  accessToken = newAccessToken
}

function refresh () {
  return {
    spotifySong
  }
}

function setSpotifySong (newSong) {
  spotifySong = newSong
}