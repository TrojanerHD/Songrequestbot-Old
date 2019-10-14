const request = require('request-promise')
let response = undefined
module.exports = {
  searchForSong,
  refresh,
  setResponse
}

function searchForSong (allArgs, secrets, context, channel) {
  request.get({
    url: `https://www.googleapis.com/youtube/v3/search?q=${allArgs}&part=snippet&key=${secrets['youtube']['key']}&type=video&videoEmbeddable=true`,
    headers: {
      Accept: 'application/json'
    },
    json: true
  }).then(searchResults).catch(console.error)

  function searchResults (body) {
    if (!('items' in body) || body['items']['length'] === 0)
      response = {
        error: {
          reason: 'no-match',
          channel
        }
      }
    const id = body['items'][0]['id']['videoId']
    request.get({
      url: `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${secrets['youtube']['key']}`,
      headers: {
        Accept: 'application/json'
      },
      json: true
    }).then(youtubeTitle).catch(console.error)

    function youtubeTitle (body) {
      if (body['items']['length'] === 0) {
        response = {
          error: {
            reason: 'no-match',
            channel
          }
        }
        return
      }
      const url = `https://youtu.be/${id}`
      const snippet = body['items'][0]['snippet']
      let duration = body['items'][0]['contentDetails']['duration'].replace(/^PT/, '')
      let hours = 0
      if (duration.match('H')) {
        hours = duration.split('H')[0]
        duration = duration.split('H')[1]
      }
      response = {
        url,
        context,
        channel,
        snippet,
        id,
        minutes: duration.match('M') ? parseInt(duration.split('M')[0]) + hours * 60 : hours * 60
      }

    }

  }
}

function refresh () {
  return response
}

function setResponse (newResponse) {
  response = newResponse
}
