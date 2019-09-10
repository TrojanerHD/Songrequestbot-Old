const { ipcRenderer } = require('electron')
let playing = false
// create youtube player
let player
let started = false
let currentlyPlaying

function refresh () {
  const song = ipcRenderer.sendSync('refresh')
  if (song === undefined || song === null) return
  playing = true
  const urlSplit = song.split('/')
  player.loadVideoById(urlSplit[urlSplit['length'] - 1], 0, 'default')
}

async function update () {
  // noinspection InfiniteLoopJS
  while (true) {
    console.log(playing)
    if (playing === false) await refresh()
    await sleep(1000)
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
  event.target.playVideo()
  started = true
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
      if (!playing || !started) return
      ipcRenderer.send('video-unavailable', videoArgs)
      alert('Dismiss this alert when you finished playing the video by hand')
      playing = false
      ipcRenderer.send('done')
      console.log(event['data'])
      break
    case 0:
      playing = false
      started = false
      ipcRenderer.send('done')
      break
    case 1:
      if (currentlyPlaying === videoData['video_id']) break
      currentlyPlaying = videoData['video_id']
      ipcRenderer.send('now-playing', videoArgs)
      break
  }
}