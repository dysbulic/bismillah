import { addListener, removeListener, loadXMLDocument, nodeIsInDocument } from './compatability.js'
import { UIInterface } from './UIInterface.js'
import { Slideshow } from './Slideshow.js'

export const slideshow = new Slideshow()
export let uiInterface
export let audioPlayer
export let slider
export let timeout = 50 // timeout between updates in milliseconds
export const debug = (
  !!window.location.search.substring(1).split(/&/)
  .find((q) => (q === 'debug'))
)

export function setup(slideshowConfig, containerName, sliderName, playerName) {
  slider = setupSlider(sliderName)
  uiInterface = new UIInterface(setupContainer(containerName))
  audioPlayer = setupPlayer(playerName)
  addListener(slideshow, 'configure', showConfigured, true)
  loadXMLDocument(slideshowConfig, loadSlideshow)
}

function loadSlideshow(config) {
  slideshow.load(config, uiInterface)
}

function showConfigured(event) {
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
  uiInterface.container.appendChild(uiInterface.container.startLink)
  audioPlayer?.pause()
  slideshow.reset()
}

function startShow() {
  if(nodeIsInDocument(uiInterface.container.startLink)) {
    uiInterface.container.removeChild(uiInterface.container.startLink)
  }
  slideshow.start()
  audioPlayer?.play()
  if(audioPlayer) {
    audioPlayer.currentTime = slideshow.currentTime
  }
  step()
}

function stopShow() {
  audioPlayer?.pause()
  slideshow.stop()
}

const barStart = 4
const barLength = 580

function seekToTime(time) {
  slideshow.seekToTime(time)
  slider.style.top = (
    `${
      barStart + Math.round(
        (barLength - 20) * time / slideshow.presentationTime
      )
    }px`
  )
}

function step() {
  if(slideshow.playing) {
    const { currentTime } = slideshow
    seekToTime(currentTime)
    if(currentTime + timeout < slideshow.presentationTime) {
      const interval = timeout
      if(
        slideshow.stopIndex != null
        && slideshow.stopIndex < slideshow.events.length - 1
      ) {
        interval = Math.min(
          slideshow.events[slideshow.stopIndex + 1].startTime - currentTime,
          interval,
        )
      }
      setTimeout(step, interval)
    } else {
      //resetShow()
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
  if(!slider) throw new Error('Slider not found.')
  slider.style.position = 'absolute'
  addListener(slider, 'mousedown', sliderSelected, true)
  addListener(slider, 'click', sliderClicked, true)
  return slider
}

let startSelectedTime
function sliderClicked(event) {
  // const currentTime = slideshow.lastSeekTime - slideshow.startTime
  //  if(Math.abs(startSelectedTime - currentTime)
  //   < 50 * slideshow.timeout) {
    startShow()
    //}
}

function sliderSelected(event) {
  slider.style.backgroundColor = 'green'
  addListener(document, 'mousemove', sliderDrag, true)
  addListener(document, 'mouseup', sliderRelease, true)

  startSelectedTime = slideshow.currentTime
  const link = uiInterface.container.startLink
  if(nodeIsInDocument(link.parentNode)) {
    uiInterface.container.removeChild(link)
  }
  stopShow()
}

function sliderDrag(event) {
  const position = (
    event.clientY - Math.round(slider.clientHeight / 2)
  )
  if(
    position > barStart
    && position < barLength - slider.clientHeight
  ) {
    slider.style.top = (
      `${event.clientY - Math.round(slider.clientHeight / 2)}px`
    )
    const time = Math.round(
      slideshow.presentationTime * position / barLength
    )
    slideshow.seekToTime(time)
    if(audioPlayer) {
      audioPlayer.currentTime = time
    }
  }
}

function sliderRelease() {
  slider.style.backgroundColor = null
  removeListener(document, 'mousemove', sliderDrag, true)
  removeListener(document, 'mouseup', sliderRelease, true)
}

function setupPlayer(playerName) {
  return document.getElementById(playerName)
}
