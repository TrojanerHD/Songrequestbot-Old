const search = require('youtube-search')
let response = undefined
module.exports = {
  searchForSong,
  refresh,
  setResponse
}

function searchForSong (allArgs, secrets, context, channel) {
  search(allArgs, {
    maxResults: 1,
    key: secrets['youtube']['key'],
    type: 'video'
  }, searchResults)

  function searchResults (err, results) {
    if (err) {
      console.error(err)
      return
    }

    if (results['length'] === 0) {
      response = {
        error: {
          reason: 'no-match',
          channel
        }
      }
      return
    }
    const url = `https://youtu.be/${results[0]['id']}`
    response = { results, url, context, channel }

  }
}

function refresh () {
  return response
}

function setResponse (newResponse) {
  response = newResponse
}