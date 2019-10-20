const request = require('request-promise')
let accessToken = false
let response = undefined
module.exports = {
  getUrl,
  setAccessToken,
  refresh,
  setResponse,
  searchForSong
}

function getUrl (allArgs, channel, context, origin) {
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
    body['minutes'] = Math.floor(body['duration_ms'] / 60000)
    response = {
      spotifySong: body,
      channel,
      id,
      context,
      url: allArgs.split('?')[0],
      origin
    }
  }
}

function setAccessToken (newAccessToken) {
  accessToken = newAccessToken
}

function refresh () {
  return response
}

function setResponse (newResponse) {
  response = newResponse
}

function searchForSong (allArgs, channel, args, origin, context) {
  if (!accessToken) return
  request.get({
    url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(allArgs)}&type=track&limit=1`,
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    json: true
  }).then(playInitializer).catch(console.error)

  function playInitializer (body) {
    if ('error' in body && body['error']['status'] === 401 && typeof message !== 'undefined' && message === 'The access token expired') {
      response = {
        error: {
          reason: 'update-access-token',
          args,
          origin,
          channel,
          context
        }
      }
      return
    }

    if (!body['tracks'] || !body['tracks']['items'][0]) {
      response = {
        error: {
          reason: 'no-results',
          allArgs,
          context,
          channel,
          origin
        }
      }
      return
    }

    const song = body['tracks']['items'][0]

    response = {
      spotifySong: {
        artists: song['artists'],
        name: song['name'],
        minutes: Math.floor(song['duration_ms'] / 60000)
      },
      channel,
      id: song['id'],
      context,
      url: song['external_urls']['spotify'],
      origin
    }
  }
}