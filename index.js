const tmi = require('tmi.js')
const express = require('express') // Express web server framework
const request = require('request-promise') // "Request" libraries
const cors = require('cors')
const querystring = require('querystring')
const cookieParser = require('cookie-parser')
const { ipcMain } = require('electron')
const path = require('path')
const current = {}
let accessToken = undefined
let refreshToken = undefined
let viewersWhoWantToSkipTheTrack = []
const fs = require('fs')
const currentDir = __dirname.match(/app\.asar/) ? path.dirname(path.dirname(path.dirname(__filename)).replace('app.asar', '')) : __dirname
const secrets = require(`${__dirname}/secrets`)
let songRequestQueue = []
const settings = require(`${currentDir}/settings`)
const playing = { 'spotify': false, 'youtube': false }
const spotify = require(`${__dirname}/spotify`)
const electron = require(`${__dirname}/electron`)
const youtube = require(`${__dirname}/youtube`)
electron()
let nextSong = undefined
let youtubeSkip = false
let scheduledAlertMessage = []
let client = undefined
const client_id = secrets['spotify']['id'] // Your client id
const client_secret = secrets['spotify']['secret'] // Your secret
const enabledServices = []
let currentSong = {}
if ('disabled' in settings && 'services' in settings['disabled'] && !settings['disabled']['services'].includes('youtube'))
  enabledServices.push('youtube')
if ('disabled' in settings && 'services' in settings['disabled'] && !settings['disabled']['services'].includes('spotify'))
  enabledServices.push('spotify')

function onMessageHandler (target, context, msg, self) {
  if (self) return
  const channel = target.replace(/^#/g, '')
  if (!msg.startsWith('!')) return
  msg = msg.replace(/^!/g, '')
  const args = msg.split(' ')
  args.shift()

  const cmd = msg.split(' ')[0].toLowerCase()

  switch (cmd) {
    case 'skip':
      if (currentSong['requester'] === context['display-name']) {
        skipSong(channel, 'skipped')
        return
      }
      if (viewersWhoWantToSkipTheTrack.includes(context['username'])) {
        client.say(channel, `You already want to skip that track. To skip it, at least 25% of the viewers have to type in !skip. [${viewersWhoWantToSkipTheTrack['length']}]`)
        return
      }
      request.get({
        headers: {
          'Client-ID': secrets['twitch']['client-id']
        },
        url: `https://api.twitch.tv/helix/streams?user_login=${channel}`,
        json: true
      }).then(checkViewersForSkip).catch(console.error)

    function checkViewersForSkip (body) {
      if (body['data']['length'] === 0) {
        client.say(target, `Error: Streamer ${context['display-name']} is not live.`)
        return
      }
      const viewers = body['data'][0]['viewer_count']

      if (viewers * 25 / 100 > viewersWhoWantToSkipTheTrack['length']) {
        viewersWhoWantToSkipTheTrack.push(context['username'])
        client.say(channel, `If 25% of the viewers want to skip then the track will be skipped. [${viewersWhoWantToSkipTheTrack['length']}]`)
        return
      }
      skipSong(channel, 'skipped')
    }

      return
    case 'forceskip':
      request.get({
        url: `http://tmi.twitch.tv/group/user/${channel}/chatters`,
        json: true
      }).then(twitchChatters).catch(console.error)

    function twitchChatters (body) {
      let isMod = false
      for (const user of body['chatters']['moderators'])
        if (context['username'] === user) isMod = true
      for (const user of body['chatters']['broadcaster'])
        if (context['username'] === user) isMod = true
      if (isMod) {
        if (playing['youtube']) {
          client.say(channel, 'Alright, the song was skipped.')
          youtubeSkip = true
          return
        }
        if (!playing['spotify']) {
          client.say(channel, 'Nothing is playing right now!')
          return
        }
        request.post({
          url: 'https://api.spotify.com/v1/me/player/next',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }).then(skipSpotify).catch(skipSpotifyError)

        function skipSpotifyError (error) {
          client.say(channel, 'Something went wrong... :/')
          console.error(error)
        }

        function skipSpotify () {
          client.say(channel, 'Alright, the song was skipped.')
        }

        return
      }
      client.say(channel, 'You are neither a moderator nor the streamer itself. Thus, you are not allowed to forceskip the track!')
    }

      return
    case 'wrongsong':
      const requester = context['display-name']
      songRequestQueue.reverse()
      let count = 0
      for (const request of songRequestQueue) {
        if (request['requester'] === requester) {
          songRequestQueue.splice(count, 1)
          client.say(channel, `Your requested song ${request['title']} by ${request['artists']} was successfully removed from the queue`)
          songRequestQueue = songRequestQueue.reverse()
          return
        }
        count++
      }
      songRequestQueue.reverse()
      if (currentSong['requester'] === requester) skipSong(channel, 'removed')
      else client.say(channel, 'You cannot do that since there is no song request from you')
      return
  }
  if (settings['commands']['songrequest'].includes(cmd)) {
    if (args['length'] === 0) {
      client.say(channel, `You have to specify the name/url of the track (!${settings['commands']['songrequest'][0]} <query>)`)
      return
    }

    let allArgs = ''
    for (const arg of args) allArgs += `${arg} `
    allArgs = allArgs.replace(/ $/g, '')

    if (allArgs.match(/^http(s|):\/\/open\.spotify\.com\/track\/.*/g)) {
      spotify.getUrl(allArgs, channel, context)
      return
    }

    if (allArgs.match(/^(http(s|):\/\/|)(www.|)youtube.com\/watch\?v=.*/)) {
      if (enabledServices.includes('youtube'))
        addYouTubeVideo(allArgs.split(/[?&]v=/)[1].split('&')[0])
      else client.say(channel, `${channel} has not activated YouTube. Please use only Spotify for song requests`)
      return
    }

    if (allArgs.match(/^(http(s|):\/\/|)youtu.be\/.*/g)) {
      if (enabledServices.includes('youtube'))
        addYouTubeVideo(allArgs.split('/')[allArgs.split('/')['length'] - 1].split('?')[0])
      else client.say(channel, `${channel} has not activated YouTube. Please use only Spotify for song requests`)
      return
    }

    function addYouTubeVideo (id) {
      if (id.match(/[?&]/)) {
        client.say(target, 'This does not look like a correct youtube link')
        return
      }
      request.get({
        url: `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${secrets['youtube']['key']}`,
        headers: {
          Accept: 'application/json'
        },
        json: true
      }).then(youtubeTitle).catch(console.error)

      function youtubeTitle (body) {
        const snippet = body['items'][0]['snippet']
        const url = `https://youtu.be/${id}`
        songRequestQueue.push({
          platform: 'youtube',
          title: snippet['title'],
          artists: snippet['channelTitle'],
          url,
          id,
          requester: context['display-name']
        })
        addTrack(channel, {
          song: id,
          platform: 'youtube',
          url,
          name: snippet['title'],
          artists: snippet['channelTitle']
        })
      }
    }

    if (enabledServices.includes('spotify'))
      spotify.searchForSong(allArgs, channel, target, context, msg, self)
    else if (enabledServices.includes('youtube'))
      youtube.searchForSong(allArgs, secrets, context, channel)
  }
}

// Twitch Stuff
async function twitchLogin () {
  return await request.get({
    url: `https://api.twitch.tv/helix/users?login=${settings['twitch']['username']}`,
    headers: {
      Accept: 'application/vnd.twitchtv.v5+json',
      'Client-ID': secrets['twitch']['client-id']
    }
  })
}

async function twitchRoom (userId) {
  return await request.get({
    url: `https://api.twitch.tv/kraken/chat/${userId}/rooms`,
    headers: {
      Accept: 'application/vnd.twitchtv.v5+json',
      'Client-ID': secrets['twitch']['client-id'],
      Authorization: `OAuth ${secrets['twitch']['password'].split(':')[1]}`
    }
  })
}

async function main () {
  try {
    const twitchLoginResult = await twitchLogin()
    const userId = JSON.parse(twitchLoginResult)['data'][0]['id']

    const twitchRoomResult = await twitchRoom(userId)
    let roomId = undefined
    for (const room of JSON.parse(twitchRoomResult)['rooms']) if (room['name'] === 'songs') {
      roomId = room['_id']
      break
    }
    const songsRoom = roomId !== undefined ? `#chatrooms:${userId}:${roomId}` : undefined
    const channels = [
      settings['twitch']['username'].toLowerCase()
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
    client = new tmi.client(twtchOpts)

// Register our event handlers (defined below)
    client.on('connected', onConnectedHandler)
    client.on('message', onMessageHandler)
    ipcMain.on('video-unavailable', videoUnavailableHandler)

    function videoUnavailableHandler (event, args) {
      const channel = settings['twitch']['username']
      if ('reduced-debugging' in settings && settings['reduced-debugging'] === true)
        client.say(channel, `@${channel} Error code 1: ${args['url']}`)
      else
        client.say(channel, `${args['title']} by ${args['artist']} could not be played due to restrictions. Please open the following link in a browser in order to play the song and afterward dismiss the alert in the electron window @${channel}: ${args['url']}`)
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

    const refreshTokenFile = `${currentDir}/refresh_token.txt`
    const authMessage = 'Please head to http://localhost:8888/login and log in to activate the bot.'
    if (!fs.existsSync(refreshTokenFile)) {
      fs.writeFile(refreshTokenFile, '', createRefreshTokenFile)

      function createRefreshTokenFile (err) {
        if (err) console.error(err)
      }

      scheduledAlertMessage.push(authMessage)
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
          scheduledAlertMessage.push(authMessage)
          startServer()
          return
        }
        refreshToken = data
        updateAccessToken()
        update()
      }
    }

    // Spotify API

    function update () {
      request.get({
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        json: true
      }).then(currentlyPlaying).catch(currentlyPlayingError)

      function currentlyPlayingError (error) {
        const realError = 'error' in error && 'error' in error['error'] ? error['error']['error'] : undefined
        if (realError !== undefined && realError['status'] === 401 && (realError['message'] === 'Invalid access token' || realError['message'] === 'The access token expired')) updateAccessToken()
        else console.error(error)
        updateFunction()
      }

      function currentlyPlaying (body) {
        if (body === undefined || (body['progress_ms'] === 0 && !body['isplaying']))
          playing['spotify'] = false
        else if (!playing['spotify'])
          playing['spotify'] = true

        if (!playing['spotify'] && !playing['youtube'] && songRequestQueue['length'] !== 0) {
          switch (songRequestQueue[0]['platform']) {
            case 'youtube':
              nextSong = songRequestQueue[0]['id']
              currentSong = { requester: songRequestQueue[0]['requester'] }
              playing['youtube'] = true
              songRequestQueue.shift()
              break
            case 'spotify':
              const nextSongSpotify = songRequestQueue[0]['id']
              request.get({
                url: 'https://api.spotify.com/v1/me/player/devices',
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              }).then(spotifyDevices).catch(console.error)

            function spotifyDevices (body) {
              request.put({
                url: `https://api.spotify.com/v1/me/player/play?device_id=${JSON.parse(body)['devices'][0]['id']}`,
                headers: {
                  Authorization: `Bearer ${accessToken}`
                },
                body: {
                  uris: [
                    `spotify:track:${nextSongSpotify}`
                  ],
                  position_ms: 1
                },
                json: true
              }).catch(console.error)
            }

              currentSong = { requester: songRequestQueue[0]['requester'] }
              songRequestQueue.shift()
              playing['spotify'] = true
              updateFunction()
              return
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
      setTimeout(update, 4500)
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
          client_id,
          scope: scopes,
          redirect_uri,
          state
        })}`)
      }

      app.get('/callback', callbackResponse)

      function callbackResponse (req, res) {
        // your application requests refresh and access tokens
        // after checking the state parameter

        const code = req['query']['code'] || null
        const state = req['query']['state'] || null

        if (state === null) res.redirect(`/#${querystring.stringify({
          error: 'state_mismatch'
        })}`)
        else {
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
          }).then(authTokenResponse).catch(authTokenError)

          function authTokenError (error) {
            if (error['error'] === 'invalid_grant') {
              res.redirect(`/#${querystring.stringify({
                error: 'invalid_token'
              })}`)
              return
            }
            console.error(`${error} in index.js on line 598`)
          }

          function authTokenResponse (body) {
            refreshToken = body['refresh_token']
            fs.writeFile(refreshTokenFile, refreshToken, writeRefreshTokenToFileResponse)

            function writeRefreshTokenToFileResponse (err) {
              if (err) console.error(err)
            }

            res.send('Success! You may now close this tab and you are able to use the Songrequestbot now.')

            accessToken = body['access_token']
            spotify.setAccessToken(accessToken)
            update()
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
        }).then(refreshTokenGotResponse).catch(console.error)

        function refreshTokenGotResponse (body) {
          const access_token = body['access_token']
          res.send({ access_token })
        }
      }

      app.listen(8888)
    }
  } catch (e) {
    console.error(e)
  }
}

// noinspection JSIgnoredPromiseFromCall
main()

ipcMain.on('done', youtubeVideoDone)

function youtubeVideoDone () {
  if (nextSong !== undefined) return
  playing['youtube'] = false
}

ipcMain.on('refresh', onYoutubePlayerRefresh)

function onYoutubePlayerRefresh (event) {
  const alertScheduled = scheduledAlertMessage['length'] >= 1
  event['returnValue'] = {
    song: nextSong,
    alert: alertScheduled ? scheduledAlertMessage[0] : null
  }
  if (alertScheduled) scheduledAlertMessage.shift()
  nextSong = undefined
}

ipcMain.on('skip-and-queue', youtubeSkipRequest)

function youtubeSkipRequest (event) {
  event['returnValue'] = { skip: youtubeSkip, queue: songRequestQueue }
  youtubeSkip = false
}

ipcMain.on('delete', deleteSongRequest)

function deleteSongRequest (event, args) {
  let counter = 0
  for (const index of songRequestQueue) {
    if (index['url'] === args) songRequestQueue.splice(counter, 1)
    counter++
  }
}

function spotifyListener () {
  const song = spotify.refresh()
  if (song !== undefined) {
    if ('error' in song) {
      const error = song['error']
      switch (error['reason']) {
        case 'update-access-token':
          updateAccessToken()
          onMessageHandler(error['target'], error['context'], error['msg'], error['self'])
          break
        case 'no-results':
          const allArgs = error['allArgs']
          const channel = error['channel']
          if (enabledServices.includes('youtube'))
            youtube.searchForSong(allArgs, secrets, error['context'], channel)
          else client.say(channel, 'There were no matches. Try it again with other search parameters or create a request with the direct link of that song from Spotify.')
          spotify.setResponse(undefined)
          break
      }
      spotifyListenerLoop()
      return
    }

    const { spotifySong, channel, id, context, url } = song
    let artists = ''
    for (const artist of spotifySong['artists']) artists += artist['name'] + ', '
    artists = artists.replace(/, $/g, '')
    songRequestQueue.push({
      platform: 'spotify',
      title: spotifySong['name'],
      artists,
      url,
      id,
      requester: context['display-name']
    })
    addTrack(channel, {
      song: url.split('/')[url.split('/')['length'] - 1].split('?')[0],
      platform: 'spotify',
      url,
      name: spotifySong['name'],
      artists
    })
    spotify.setResponse(undefined)
  }
  spotifyListenerLoop()
}

if (enabledServices.includes('spotify')) spotifyListener()

function spotifyListenerLoop () {
  setTimeout(spotifyListener, 2000)
}

function youtubeListener () {
  const song = youtube.refresh()
  if (song !== undefined) {
    if ('error' in song) {
      const error = song['error']
      const channel = error['channel']
      if (error['reason'] === 'no-match') {
        client.say(channel, `There were no matches. Try it again with other search parameters or create a request with the direct link of that song from ${enabledServices.includes('spotify') ? 'Spotify/' : ''}YouTube.`)
        youtube.setResponse(undefined)
      }
      youtubeListenerLoop()
      return
    }
    const { url, context, channel, id, snippet } = song
    songRequestQueue.push({
      platform: 'youtube',
      title: snippet['title'],
      artists: snippet['channelTitle'],
      url,
      id: `https://yout.be/${id}`,
      requester: context['display-name']
    })
    addTrack(channel, {
      platform: 'youtube',
      artists: snippet['channelTitle'],
      url,
      name: snippet['title'],
      song: id
    })
    youtube.setResponse(undefined)
  }
  youtubeListenerLoop()
}

if (enabledServices.includes('youtube')) youtubeListener()

function youtubeListenerLoop () {
  setTimeout(youtubeListener, 2000)
}

function addTrack (channel, songRequest) {
  // song,
  // platform: 'spotify' | 'youtube',
  // artists,
  // url,
  // name
  client.say(channel, `${songRequest['name'].replace(/^([!\/.])/, '') !== undefined && songRequest['artists'] !== undefined ? `${songRequest['name'].replace(/^([!\/.])/, '')} by ${songRequest['artists']}` : 'Your song'} is in the queue on place ${songRequestQueue['length']}`/* | ${songRequest['url']}`*/)
}

function updateAccessToken () {
  request.post({
    url: 'https://accounts.spotify.com/api/token',
    form: {
      client_id: client_id,
      client_secret: client_secret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    },
    json: true
  }).then(tokenResponse).catch(console.error)

  function tokenResponse (body) {
    accessToken = body['access_token']
    spotify.setAccessToken(accessToken)
  }
}

function skipSong (channel, context) {
  if (playing['youtube']) {
    client.say(channel, `Alright, the song was ${context}.`)
    youtubeSkip = true
    viewersWhoWantToSkipTheTrack = []
    return
  }

  if (!playing['spotify']) {
    client.say(channel, 'Nothing is playing right now!')
    return
  }
  // if 25% of viewers said skip
  request.post({
    url: 'https://api.spotify.com/v1/me/player/next',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).then(skipSpotify).catch(skipSpotifyError)

  function skipSpotifyError (error) {
    client.say(channel, 'Something went wrong... :/')
    console.error(error)
  }

  function skipSpotify () {
    viewersWhoWantToSkipTheTrack = []
    client.say(channel, `Alright, the song was ${context}.`)
  }
}