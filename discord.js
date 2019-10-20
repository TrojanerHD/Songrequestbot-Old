const Discord = require('discord.js')
const client = new Discord.Client()
const ytdl = require('ytdl-core')
let connection = null
let finished = false
let currentVoiceChannel = null
let joinUser = null
const rootPath = require(`${__dirname}/settings.js`)
rootPath.initialize()
const settings = require(rootPath.getPath('settings'))
let dispatcher = null
let songrequest = null

if (!('discord' in settings)) settings['discord'] = {}
if (!('mod-roles' in settings['discord'])) settings['discord']['mod-roles'] = []

module.exports = {
  initialize,
  play,
  skip,
  refresh
}

function initialize (token) {
  client.login(token)
  client.on('message', onMessageHandler)
}

async function onMessageHandler (message) {
  const args = message.cleanContent.split(' ')
  args.shift()

  if (message['author']['bot']) return
  if (!message['content'].startsWith('!')) return
  const cmd = message.cleanContent.replace(/^!/, '').split(' ')[0]
  const voiceChannel = message['member']['voiceChannel']
  switch (cmd) {
    case 'join':
      if (currentVoiceChannel !== null) {
        message['channel'].send('The bot is already in a voice channel')
        return
      }
      if (!voiceChannel) {
        message['channel'].send('You need to be in a voice channel to play music!')
        return
      }
      connection = await voiceChannel.join()
      currentVoiceChannel = voiceChannel
      message['channel'].send('Joined voice channel')
      joinUser = message['author']['id']
      break
    case 'leave':
      if (currentVoiceChannel === null) {
        message['channel'].send('The bot is not in a voice channel')
        return
      }
      if (message['author']['id'] !== joinUser && !checkPermission(message['member'])) {
        message['channel'].send('Only the user who requested the bot to join can make it leave again')
        return
      }
      connection = null
      currentVoiceChannel.leave()
      currentVoiceChannel = null
      message['channel'].send('Left voice channel')
      break
    case 'pause':
      if (!checkPlaying(message)) return
      if (!checkPermission(message['member'])) {
        message['channel'].send('You do not have the permission to do that')
        return
      }
      dispatcher.pause()
      message['channel'].send('Playback paused')
      break
    case 'play':
    case 'resume':
      if (!checkPlaying(message)) return
      if (!checkPermission(message['member'])) {
        message['channel'].send('You do not have the permission to do that')
        return
      }
      dispatcher.resume()
      message['channel'].send('Playback resumed')
      break
  }
  if (settings['commands']['songrequest'].includes(cmd)) {
    songrequest = {
      channel: message['channel'],
      args,
      context: {
        'display-name': message['author']['id']
      }
    }
  }
}

function play (url) {
  if (dispatcher !== null) dispatcher.end()
  dispatcher = connection.playStream(ytdl(url))
  dispatcher.on('end', onEndHandler)
  dispatcher.on('error', onErrorHandler)
}

function onErrorHandler (e) {
  // Catch any errors that may arise
  console.log(e)
}

function onEndHandler () {
  finished = true
}

function skip () {
  if (dispatcher === null) return
  dispatcher.end()
  finished = true
}

function refresh () {
  const tempFinished = finished
  const tempSongrequest = songrequest
  finished = false
  songrequest = null
  return {
    finished: tempFinished,
    discordSongrequest: tempSongrequest
  }
}

function checkPlaying (message) {
  if (dispatcher !== null) return true
  message['channel'].send('Nothing is playing right now')
  return false

}

function checkPermission (member) {
  return member['_roles'].some(role => settings['discord']['mod-roles'].includes(role))
}