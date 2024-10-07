import { addListener, removeListener, loadXMLDocument, nodeIsInDocument } from './compatability.js'
import { UIInterface } from './UIInterface.js'
import { Slideshow } from './Slideshow.js'

const hasParam = (name) => (
  !!window.location.search.substring(1).split(/&/)
  .find((q) => (q === name))
)

export const slideshow = new Slideshow()
export let ui
export let audioPlayer
export let slider
export let timeout = 50 // timeout between updates in milliseconds
export const debug = hasParam('debug')
export const verbose = hasParam('verbose')

export async function setup(
  slideshowConfig, containerName, sliderName, playerName,
) {
  slider = setupSlider(sliderName)
  ui = new UIInterface(setupContainer(containerName))
  audioPlayer = setupPlayer(playerName)
  addListener(slideshow, 'configure', showConfigured, true)

  const config = await loadXMLDocument(slideshowConfig)
  await slideshow.load(config, ui)

  const audioSrc = document.createElement('source')
  audioSrc.src = slideshow.backgroundMusic
  audioPlayer.appendChild(audioSrc)
}

function showConfigured() {
  if(debug) {
    console.debug({
      'Slideshow Configured': audioPlayer
    })
  }
  if(audioPlayer == null || audioPlayer.loaded) {
    resetShow()
  }
}

function songLoadedCallback(filename) {
  if(slideshow.configured) {
    resetShow()
  }
}

function resetShow() {
  ui.container.appendChild(ui.container.startLink)
  audioPlayer?.pause()
  slideshow.reset()
}

function startShow() {
  const { startLink } = ui.container
  if(nodeIsInDocument(startLink)) {
    startLink.parentNode.removeChild(startLink)
  }
  slideshow.start()
  audioPlayer?.play()
  if(audioPlayer) {
    if(
      typeof(slideshow.currentTime) !== 'number'
      || isNaN(slideshow.currentTime)
    ) {
      console.warn({
        'Slideshow Time': slideshow.currentTime,
      })
    } else {
      audioPlayer.currentTime = slideshow.currentTime
    }
  }
  step()
}

function stopShow() {
  audioPlayer?.pause()
  slideshow.stop()
}

function seekToTime(time) {
  const barStart = 0
  const barLength = slider.parentElement.clientHeight
  slideshow.currentTime = time
  const { presentationTime: total } = slideshow
  const barSize = barLength - slider.clientHeight / 2
  const scaledBarSize = barSize * time / total
  slider.style.top = (
    `${barStart + Math.round(scaledBarSize)}px`
  )
}

function step() {
  if(slideshow.playing) {
    const { currentTime } = slideshow
    seekToTime(currentTime)
    if(currentTime + timeout < slideshow.presentationTime) {
      let interval = timeout
      if(
        slideshow.stopIndex != null
        && slideshow.stopIndex < slideshow.events.length - 1
      ) {
        const { startTime: nextStart } = (
          slideshow.events[slideshow.stopIndex + 1]
        )
        interval = Math.min(
          nextStart - currentTime, interval
        )
      }
      setTimeout(step, interval)
    }
  }
}

function setupContainer(containerName) {
  const container = document.getElementById(containerName)
  if(!container) throw new Error('Container not found.')
  container.startLink = document.createElement('aside')
  container.startLink.id = 'start'
  const link = document.createElement('button')
  link.setAttribute('onclick', 'startShow()')
  link.appendChild(document.createTextNode('Start Slideshow'))
  container.startLink.appendChild(link)
  return container
}

function setupSlider(sliderName) {
  const slider = document.getElementById(sliderName)
  if(!slider) {
    throw new Error(`Slider "${sliderName}" not found.`)
  }
  addListener(slider, 'mousedown', sliderSelected, true)
  addListener(slider, 'click', sliderClicked, true)
  return slider
}

function sliderClicked(event) {
  if(!slideshow.playing) {
    startShow()
  } else {
    stopShow()
  }
}

function sliderSelected(event) {
  slider.classList.add('active')
  addListener(document, 'mousemove', sliderDrag, true)
  addListener(document, 'mouseup', sliderRelease, true)

  startSelectedTime = slideshow.currentTime
  const link = ui.container.startLink
  if(nodeIsInDocument(link.parentNode)) {
    ui.container.removeChild(link)
  }
  stopShow()
}

function sliderDrag(event) {
  const barStart = 0
  const barLength = slider.parentElement.clientHeight
  const { presentationTime: total } = slideshow
  if(isNaN(total) || total < 0) {
    throw new Error(`Invalid \`presentationTime\`: ${total}`)
  }
  const sliderSize = slider.offsetHeight
  const center = Math.round(sliderSize / 2)
  const position = event.clientY - center
  if(
    position >= barStart // after the start
    && position <= barLength - sliderSize // before the end
  ) {
    slider.style.top = `${position}px`

    const time = Math.round(total * position / barLength)
    if(debug && verbose) {
      console.debug({
        'Seeking': {
          time, total,
          slider: {
            click: event.clientY, size: sliderSize,
            center, position,
          },
          bar: {
            start: barStart, length: barLength,
          },
        },
      })
    }
    slideshow.currentTime = time
    if(audioPlayer) {
      audioPlayer.currentTime = time
    }
  }
}

function sliderRelease() {
  slider.classList.remove('active')
  removeListener(document, 'mousemove', sliderDrag, true)
  removeListener(document, 'mouseup', sliderRelease, true)
}

function setupPlayer(playerName) {
  const player = document.getElementById(playerName)
  player.addEventListener('timeupdate', () => {
    slideshow.currentTime = player.currentTime * 1000
  })
  return player
}
