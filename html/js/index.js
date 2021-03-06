const { ipcRenderer } = require('electron')
const $ = require('jquery')

let playing = false
// create youtube player
let player
let currentlyPlaying

function refresh () {
  const data = ipcRenderer.sendSync('refresh')
  const song = data['song']
  const alertMessage = data['alert']
  if (alertMessage != null) alert(alertMessage)
  if (song === undefined || song === null) return
  playing = true
  const urlSplit = song.split('/')
  player.loadVideoById(urlSplit[urlSplit['length'] - 1], 0, 'default')
}

async function update () {
  // noinspection InfiniteLoopJS
  while (true) {
    const skipAndQueue = ipcRenderer.sendSync('skip-and-queue')
    if (skipAndQueue['skip']) player.seekTo(player.getDuration())
    updateQueue(skipAndQueue['queue'])
    if (!playing) await refresh()
    await sleep(1000)
  }
}

function updateQueue (queue) {
  $('div.queue').html('<table>\n' +
    '        <tbody>\n' +
    '        <tr>\n' +
    '            <th>Song Name</th>\n' +
    '            <th>Artist(s)</th>\n' +
    '            <th>URL</th>\n' +
    '            <th>Requested by</th>\n' +
    '            <th>Action</th>\n' +
    '        </tr>\n' +
    '        </tbody>\n' +
    '    </table>')
  queue.reverse()
  for (const index of queue) $(`<tr><td class="title">${index['title']}</td><td class="artists">${index['artists']}</td><td class="url"><a href="${index['url']}">${index['url']}</a></td><td>${index['requester']}</td><td class="trash"><i class="fas fa-trash-alt"></i></td></tr>`).insertAfter('div.queue > table > tbody')
  $('td.trash').on('click', deleteSongRequest)

  function deleteSongRequest () {
    const url = $(this).parent().find('td.url > a').html()
    ipcRenderer.send('delete', url)
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function onYouTubePlayerAPIReady () {
  player = new YT.Player('player', {
    width: '640',
    height: '390',
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  })
}

// autoplay video
function onPlayerReady (event) {
  update()
  event['target'].playVideo()
}

// when video ends
function onPlayerStateChange (event) {
  const videoData = player.getVideoData()
  const videoArgs = {
    title: videoData['title'],
    artist: videoData['author'],
    url: `https://youtu.be/${videoData['video_id']}`
  }

  switch (event['data']) {
    case -1:
      if (!playing) return
      ipcRenderer.send('video-unavailable', videoArgs)
      alert('Dismiss this alert when you finished playing the video by hand')
      playing = false
      ipcRenderer.send('done')
      break
    case 0:
      playing = false
      ipcRenderer.send('done')
      break
    case 1:
      if (currentlyPlaying === videoData['video_id']) break
      currentlyPlaying = videoData['video_id']
      ipcRenderer.send('now-playing', videoArgs)
      playing = true
      break
  }
}