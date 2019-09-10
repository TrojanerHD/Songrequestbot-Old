const tmi = require('tmi.js')
const express = require('express') // Express web server framework
const request = require('request') // "Request" library
const cors = require('cors')
const querystring = require('querystring')
const cookieParser = require('cookie-parser')
const search = require('youtube-search')
const { ipcMain } = require('electron')
const current = {}
let accessToken = undefined
let refreshToken = undefined
let viewersWhoWantToSkipTheTrack = []
const fs = require('fs')
const secrets = require(`${__dirname}/secrets`)
const songRequestQueue = []
const info = require(`${__dirname}/info`)
const playing = { 'spotify': false, 'youtube': false }
const electron = require(`${__dirname}/electron`)
electron.createElectronInstance()
let nextSong = undefined

// Twitch Stuff
request.get({
  url: `https://api.twitch.tv/helix/users?login=${info['twitch']['username']}`,
  headers: {
    Accept: 'application/vnd.twitchtv.v5+json',
    'Client-ID': secrets['twitch']['client-id']
  }
}, twitchUsername)

function twitchUsername (error, response, body) {
  if (error) {
    console.error(error)
    return
  }
  const userId = JSON.parse(body)['data'][0]['id']
  request.get({
    url: `https://api.twitch.tv/kraken/chat/${userId}/rooms`,
    headers: {
      Accept: 'application/vnd.twitchtv.v5+json',
      'Client-ID': secrets['twitch']['client-id'],
      Authorization: `OAuth ${secrets['twitch']['password'].split(':')[1]}`
    }
  }, twitchRoom)

  function twitchRoom (error, response, body) {
    if (error) {
      console.error(error)
      return
    }
    let roomId = undefined
    for (const room of JSON.parse(body)['rooms']) {
      if (room['name'] === 'songs') {
        roomId = room['_id']
        break
      }
    }
    const songsRoom = roomId !== undefined ? `#chatrooms:${userId}:${roomId}` : undefined
    const channels = [
      info['twitch']['username'].toLowerCase()
    ]
    if (songsRoom !== undefined) channels.push(songsRoom)

    const twtchOpts = {
      identity: {
        username: 'LiterallyAnything',
        password: secrets['twitch']['password']
      },
      channels
    }

// Create a client with our options
    const client = new tmi.client(twtchOpts)

// Register our event handlers (defined below)
    client.on('connected', onConnectedHandler)
    client.on('message', onMessageHandler)
    ipcMain.on('video-unavailable', videoUnavailableHandler)

    function videoUnavailableHandler (event, args) {
      client.say(info['twitch']['username'], `${args['title']} by ${args['artist']} could not be played due to restrictions. Please open the following link in a browser in order to play the song and after that dismiss the alert in the electron window @${info['twitch']['username']}: ${args['url']}`)
    }

    ipcMain.on('now-playing', youtubeNowPlaying)

    function youtubeNowPlaying (event, args) {
      client.say(songsRoom, `Now playing: ${args['title']} - ${args['artist']} | ${args['url']}`)
    }

    // Connect to Twitch:
    client.connect()

    function onConnectedHandler (addr, port) {
      console.log(`* Connected to ${addr}:${port}`)
    }

    function onMessageHandler (target, context, msg, self) {
      if (self) return
      const channel = target.replace(/^#/g, '')
      if (!msg.startsWith('!')) return
      msg = msg.replace(/^!/g, '')
      const args = msg.split(' ')
      args.shift()

      const cmd = msg.split(' ')[0].toLowerCase()

      if (cmd === 'skip') {
        request.get({
          headers: {
            'Client-ID': secrets['twitch']['client-id']
          },
          url: `https://api.twitch.tv/helix/streams?user_login=${channel}`,
          json: true
        }, checkViewersForSkip)

        function checkViewersForSkip (error, response, body) {
          if (error) {
            console.error(error)
            return
          }

          if (body['data']['length'] === 0) {
            client.say(target, `Error: Streamer ${context['display-name']} is not live.`)
            return
          }
          const viewers = body['data'][0]['viewer_count']

          viewersWhoWantToSkipTheTrack.push(context['username'])
          if (viewers * 25 / 100 > viewersWhoWantToSkipTheTrack['length']) {
            if (context['username'] in viewersWhoWantToSkipTheTrack) {
              client.say(channel, `You already want to skip that track. To skip it, 25% of the viewers are needed to skip it. [${viewersWhoWantToSkipTheTrack['length']}]`)
              return
            }
            client.say(channel, `If 25% of the viewers want to skip then the track will be skipped. [${viewersWhoWantToSkipTheTrack['length']}]`)
            return
          }

          if (accessToken === undefined) {
            client.say(channel, `Something went wrong... maybe the Spotify-API is not running? @${channel}`)
            return
          }
          // if 25% of viewers said skip
          request.post({
            url: 'https://api.spotify.com/v1/me/player/next',
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }, skipSpotify)

          function skipSpotify (error) {
            if (error) {
              client.say(channel, 'Something went wrong... :/')
              console.log(error)
              return
            }

            client.say(channel, `Alright, the song was skipped. [${viewersWhoWantToSkipTheTrack['length']}]`)
          }
        }
      }
      for (const command of info['commands']['songrequest']) {
        if (cmd !== command) continue
        if (args['length'] === 0) {
          client.say(channel, 'You have to specify the name/url of the track (!sr <query>)')
          return
        }

        let allArgs = ''
        for (const arg of args) allArgs += `${arg} `
        allArgs = allArgs.replace(/ $/g, '')

        if (allArgs.match(/^http(s|):\/\/open\.spotify\.com\/track\/.*/g)) {
          songRequestQueue.push({ [allArgs.split('/')[allArgs.split('/')['length'] - 1].split('?')[0]]: 'spotify' })
          addTrack(channel, {
            song: allArgs.split('/')[allArgs.split('/')['length'] - 1].split('?')[0],
            platform: 'spotify',
            url: allArgs
          })
          return
        }

        if (allArgs.match(/^http(s|):\/\/(www.|)youtube.com\/watch\?v=.*/)) {
          const id = allArgs.split(/[?&]v=/)[1].split('&')[0]
          if (id.match(/[?&]/)) {
            client.say(target, 'This does not look like a correct youtube link')
            return
          }
          songRequestQueue.push({ [id]: 'youtube' })
          addTrack(channel, {
            song: id,
            platform: 'youtube',
            url: `https://youtu.be/${id}`
          })
          return
        }

        if (allArgs.match(/^http(s|):\/\/youtu.be\/.*/g)) {
          const id = allArgs.split('/')[allArgs.split('/')['length'] - 1].split('?')[0]
          if (id.match(/[?&]/)) {
            client.say(target, 'This does not look like a correct youtube link')
            return
          }
          songRequestQueue.push({ [id]: 'youtube' })
          addTrack(channel, {
            song: id,
            platform: 'youtube',
            url: allArgs
          })
          return
        }

        request.get({
          url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(allArgs)}&type=track&limit=1`,
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          json: true
        }, playInitializer)

        function playInitializer (error, request, body) {
          if (error) {
            console.log(error)
            return
          }
          if (!accessToken) {
            client.say(channel, `Something went wrong... maybe the Spotify-API is not running? @${channel}`)
            return
          }
          if ('error' in body && body['error']['status'] === 401 && typeof message !== 'undefined' && message === 'The access token expired') {
            getAccessToken()
            onMessageHandler(target, context, msg, self)
            return
          }

          if (!body['tracks'] || !body['tracks']['items'][0]) {
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
                client.say(channel, 'There were no matches. Try it again with other search parameters or create a request with the direct link of that song from Spotify/YouTube.')
                return
              }
              songRequestQueue.push({ [`https://yout.be/${results[0]['id']}`]: 'youtube' })
              addTrack(channel, {
                platform: 'youtube',
                artists: results[0]['channelTitle'],
                url: `https://youtu.be/${results[0]['id']}`,
                name: results[0]['title'],
                song: results[0]['id']
              })
            }

            return
          }

          const song = body['tracks']['items'][0]
          let artists = ''
          for (const artist in song.artists) if (song.artists.hasOwnProperty(artist)) artists += song.artists[artist].name + ', '
          artists = artists.replace(/, $/g, '')

          songRequestQueue.push({ [song['id']]: 'spotify' })
          addTrack(channel, {
            song: song['id'],
            platform: 'spotify',
            artists,
            url: song['external_urls']['spotify'],
            name: song['name']
          })
        }
      }
    }

    const refreshTokenFile = 'refresh_token.txt'
    const authMessage = 'Please head to http://localhost:8888/login and log in to activate the bot.'
    if (!fs.existsSync(refreshTokenFile)) {
      fs.writeFile(refreshTokenFile, '', createRefreshTokenFile)

      function createRefreshTokenFile (err) {
        if (err) console.error(err)
      }

      console.log(authMessage)
      startServer()
    } else {
      fs.readFile(refreshTokenFile, 'utf8', readRefreshTokenFile)

      function readRefreshTokenFile (err, data) {
        if (err) {
          console.error(err)
          startServer()
          return
        }
        if (data.match(/^$/g)) {
          console.log(authMessage)
          startServer()
          return
        }
        refreshToken = data
        getAccessToken()
        update()
      }
    }

    // Spotify API
    const client_id = secrets['spotify']['id'] // Your client id
    const client_secret = secrets['spotify']['secret'] // Your secret

    function getAccessToken () {
      request.post({
        url: 'https://accounts.spotify.com/api/token',
        form: {
          client_id: client_id,
          client_secret: client_secret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        },
        json: true
      }, tokenResponse)

      function tokenResponse (error, response, body) {
        if (error) {
          console.error(error)
          return
        }
        accessToken = body['access_token']
      }
    }

    function update () {
      request.get({
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        json: true
      }, currentlyPlaying)

      function currentlyPlaying (error, response, body) {
        if (error) {
          console.log(error)
          updateFunction()
          return
        }

        if (body === undefined || body['progress_ms'] === 0 && !body['isplaying'])
          playing['spotify'] = false
        else if (!playing['spotify'])
          playing['spotify'] = true

        if (!playing['spotify'] && !playing['youtube'] && songRequestQueue['length'] !== 0) {
          switch (Object.values(songRequestQueue[0])[0]) {
            case 'youtube':
              nextSong = Object.keys(songRequestQueue[0])[0]
              playing['youtube'] = true
              songRequestQueue.shift()
              break
            case 'spotify':
              const nextSongSpotify = Object.keys(songRequestQueue[0])[0]
              request.get({
                url: 'https://api.spotify.com/v1/me/player/devices',
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              }, spotifyDevices)

            function spotifyDevices (error, response, body) {
              if (error) {
                console.error(error)
                return
              }

              request.put({
                url: `https://api.spotify.com/v1/me/player/play?device_id=${JSON.parse(body)['devices'][0]['id']}`,
                headers: {
                  Authorization: `Bearer ${accessToken}`
                },
                body: {
                  uris: [
                    `spotify:track:${nextSongSpotify}`
                  ],
                  position_ms: 0
                },
                json: true
              }, spotifyPlayResponse)

              function spotifyPlayResponse (error1) {
                if (error1) console.error(error1)
              }
            }

              songRequestQueue.shift()
              playing['spotify'] = true
              break
          }
        }

        if (body === undefined || body['item'] === undefined || body['item'] === null) {
          updateFunction()
          return
        }
        const trackName = body['item']['name'],
          trackLink = body['item']['external_urls']['spotify']
        let artists = ''
        for (const artist in body['item']['artists']) if (body['item']['artists'].hasOwnProperty(artist)) artists += `${body['item']['artists'][artist]['name']}, `
        artists = artists.replace(/, $/g, '')

        if (current['name'] === trackName && current['artists'] === artists && current['link'] === trackLink || body['progress_ms'] === 0 && !body['isplaying']) {
          updateFunction()
          return
        }
        current['name'] = trackName
        current['artists'] = artists
        current['link'] = trackLink
        client.say(songsRoom, `Now playing: ${trackName} - ${artists} | ${trackLink}`)
        viewersWhoWantToSkipTheTrack = []

        updateFunction()
      }
    }

    function updateFunction () {
      setTimeout(update, 2000)
    }

    function addTrack (channel, songRequest) {
      // song,
      // platform: 'spotify' | 'youtube',
      // artists,
      // url,
      // name
      switch (songRequest['platform']) {
        case 'youtube':
          request.get({
            url: `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${songRequest['song']}&key=${secrets['youtube']['key']}`
          }, youtubeVideoMetadata)

        function youtubeVideoMetadata (error, response, body) {
          if (error) {
            console.error(error)
            return
          }

          const snippet = JSON.parse(body)['items'][0]['snippet']
          songRequest['name'] = snippet['title']
          songRequest['artists'] = snippet['channelTitle']
          client.say(channel, `${songRequest['name'].replace(/^([!\/.])/, '')} by ${songRequest['artists']} is in the queue on place ${songRequestQueue['length']} | ${songRequest['url']}`)
        }

          break
        case 'spotify':
          client.say(channel, `${songRequest['name'] !== undefined && songRequest['artists'] !== undefined ? `${songRequest['name']} by ${songRequest['artists']}` : 'Your song'} is in the queue on place ${songRequestQueue['length']} | ${songRequest['url']}`)
          break
      }
    }

    function startServer () {
      console.log('Listening on 8888')

      const redirect_uri = 'http://localhost:8888/callback' // Your redirect uri
      const scopes = 'user-read-currently-playing user-modify-playback-state playlist-read-private playlist-modify-private user-read-playback-state'
      /**
       * Generates a random string containing numbers and letters
       * @param  {number} length The length of the string
       * @return {string} The generated string
       */
      const generateRandomString = length => {
        let text = ''
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

        for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible['length']))
        return text
      }

      const stateKey = 'spotify_auth_state'

      const app = express()

      app.use(express.static(`${__dirname}/public`))
        .use(cors())
        .use(cookieParser())

      app.get('/login', loginResponse)

      function loginResponse (req, res) {

        const state = generateRandomString(16)
        res.cookie(stateKey, state)

        // your application requests authorization
        res.redirect(`https://accounts.spotify.com/authorize?${querystring.stringify({
          response_type: 'code',
          client_id: client_id,
          scope: scopes,
          redirect_uri: redirect_uri,
          state: state
        })}`)
      }

      app.get('/callback', callbackResponse)

      function callbackResponse (req, res) {
        // your application requests refresh and access tokens
        // after checking the state parameter

        const code = req.query.code || null
        const state = req.query.state || null

        if (state === null) {
          res.redirect(`/#${querystring.stringify({
            error: 'state_mismatch'
          })}`)
        } else {
          request.post({
            url: 'https://accounts.spotify.com/api/token',
            form: {
              code: code,
              redirect_uri: redirect_uri,
              grant_type: 'authorization_code'
            },
            headers: {
              Authorization: `Basic ${new Buffer(`${client_id}:${client_secret}`).toString('base64')}`
            },
            json: true
          }, authTokenResponse)

          function authTokenResponse (error, response, body) {
            if (error) {
              console.error(error)
              return
            }
            if (response['statusCode'] === 200) {
              refreshToken = body['refresh_token']
              fs.writeFile(refreshTokenFile, refreshToken, writeRefreshTokenToFileResponse)

              function writeRefreshTokenToFileResponse (err) {
                if (err) console.error(err)
              }

              getAccessToken()
              update()
            } else {
              res.redirect(`/#${querystring.stringify({
                error: 'invalid_token'
              })}`)
            }
          }
        }
      }

      app.get('/refresh_token', refreshTokenResponse)

      function refreshTokenResponse (req, res) {

        // requesting access token from refresh token
        const refresh_token = req['query']['refresh_token']

        request.post({
          url: 'https://accounts.spotify.com/api/token',
          headers: {
            Authorization: `Basic ${new Buffer(`${client_id}:${client_secret}`).toString('base64')}`
          },
          form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
          },
          json: true
        }, refreshTokenGotResponse)

        function refreshTokenGotResponse (error, response, body) {
          if (!(!error && response.statusCode === 200)) return
          const access_token = body['access_token']
          res.send({ access_token })
        }
      }

      app.listen(8888)
    }
  }
}

ipcMain.on('done', youtubeVideoDone)

function youtubeVideoDone () {
  if (nextSong !== undefined) return
  playing['youtube'] = false
}

ipcMain.on('refresh', onYoutubePlayerRefresh)

function onYoutubePlayerRefresh (event) {
  event['returnValue'] = nextSong
  nextSong = undefined
}