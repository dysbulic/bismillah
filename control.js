import { addListener, removeListener, loadXMLDocument, nodeIsInDocument } from './compatability.js'
import { UIInterface } from './UIInterface.js'
import { Slideshow } from './Slideshow.js'

export const slideshow = new Slideshow()
export let uiInterface
export let mp3Player
export let slider
export let timeout = 50 // timeout between updates in milliseconds

export function setup(slideshowConfig, containerName, sliderName, playerName) {
  slider = setupSlider(sliderName)
  uiInterface = new UIInterface(setupContainer(containerName))
  mp3Player = setupPlayer(playerName)
  addListener(slideshow, "configure", showConfigured, true)
  loadXMLDocument(slideshowConfig, loadSlideshow)
  /*
  debugDisplay = document.createElement("div")
  document.getElementsByTagName("body").item(0)
    .appendChild(debugDisplay)
  */
}

function loadSlideshow(config) {
  slideshow.load(config, uiInterface)
}

function showConfigured(event) {
  if(typeof(mp3Player) === 'undefined' || mp3Player.loaded) {
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
  mp3Player?.pause()
  slideshow.reset()
}

function startShow() {
  if(nodeIsInDocument(uiInterface.container.startLink)) {
    uiInterface.container.removeChild(uiInterface.container.startLink)
  }
  slideshow.start()
  mp3Player?.play()
  if(typeof(mp3Player) !== 'undefined') {
    mp3Player.currentTime = slideshow.getCurrentTime()
  }
  step()
}

function stopShow() {
  mp3Player?.pause()
  slideshow.stop()
}

var barStart = 4
var barLength = 580

function seekToTime(time) {
  slideshow.seekToTime(time)
  slider.style.top =
    barStart + Math.round((barLength - 20) * time / slideshow.presentationTime) + "px"
}

function step() {
  if(slideshow.playing) {
    var currentTime = slideshow.getCurrentTime()
    seekToTime(currentTime)
    //var index = slideshow.events.indexOfLastEventAt(currentTime)
    if(currentTime + timeout < slideshow.presentationTime) {
      var interval = timeout
      if(typeof(slideshow.stopIndex) != "undefined" &&
         slideshow.stopIndex < slideshow.events.length - 1) {
        interval = Math.min(slideshow.events[slideshow.stopIndex + 1].startTime - currentTime,
                            interval)
      }
      setTimeout(step, interval)
    } else {
      //resetShow()
    }
  }
}

function setupContainer(containerName) {
  var container = document.getElementById(containerName)
  if(!container) throw new Error("Container not found.")
  container.startLink = document.createElement("div")
  container.startLink.className = "tablecell"
  var link = document.createElement("a")
  link.setAttribute("href", "javascript:startShow()")
  link.appendChild(document.createTextNode("Start Slideshow"))
  container.startLink.appendChild(link)
  return container
}

function setupSlider(sliderName) {
  var slider = document.getElementById(sliderName)
  if(!slider) throw new Error("Slider not found.")
  slider.style.position = "absolute"
  addListener(slider, "mousedown", sliderSelected, true)
  addListener(slider, "click", sliderClicked, true)
  return slider
}

var startSelectedTime
function sliderClicked(event) {
  var currentTime = slideshow.lastSeekTime - slideshow.startTime
  //  if(Math.abs(startSelectedTime - currentTime)
  //   < 50 * slideshow.timeout) {
    startShow()
    //}
}

function sliderSelected(event) {
  slider.style.backgroundColor = "green"
  addListener(document, "mousemove", sliderDrag, true)
  addListener(document, "mouseup", sliderRelease, true)
  
  startSelectedTime = slideshow.getCurrentTime()
  var link = uiInterface.container.startLink
  if(nodeIsInDocument(link.parentNode)) {
    uiInterface.container.removeChild(link)
  }
  stopShow()
}

function sliderDrag(event) {
  var position = event.clientY - Math.round(slider.clientHeight / 2)
  if(position > barStart && position < barLength - slider.clientHeight) {
    slider.style.top = event.clientY - Math.round(slider.clientHeight / 2) + "px"
    var time = Math.round(slideshow.presentationTime * position / barLength)
    slideshow.seekToTime(time)
    if(typeof(mp3Player) !== "undefined") {
      mp3Player.currentTime = time
    }
  }
}

function sliderRelease(event) {
  slider.style.backgroundColor = null
  removeListener(document, "mousemove", sliderDrag, true)
  removeListener(document, "mouseup", sliderRelease, true)
}

function setupPlayer(playerName) {
  var player = document.getElementById(playerName)
  return player
}
