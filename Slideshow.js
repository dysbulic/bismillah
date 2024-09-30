import { addListener, createEvent } from './compatability.js'
import { uiInterface, debug } from './control.js'

/**
 * Class used to hold the info about images in a custom layout
 */
export class ImageInfo {
  constructor(image, style) {
    this.image = image
    if(style) {
      this.style ??= []
      const styleElements = style.trim().split(/\s+/)
      for(const styleElem of styleElements) {
        const [key, ...val] = styleElem.split(/\s*?:\s*/)
        this.style[key] = val
      }
    }
    this.startTime = this.endTime = null
  }

  toString() {
    return `ImageInfo: ${this.image}`
  }
}

export class DocumentInfo {
  constructor(root = 'div') {
    this.element = document.createElement(root)
    this.timings = []
  }
}

export class DisplayEvent {
  constructor({ element, start: startTime, end: endTime }) {
    Object.assign(this, { element, startTime, endTime })
    this.active = false
  }
}

export function EventsArray() {
  Array.apply(this, arguments)
}
EventsArray.prototype = new Array()

/**
 * Last event starting at of before 'time'
 */
//EventsArray.prototype.indexOfLastEventAt = function(time) {
export function indexOfLastEventAt(time) {
  if(this.length > 0) {
    /* My binary version of this search was buggy so this is simple linear */
    let index = 0
    while(index < this.length && this[index].startTime <= time) {
      index++
    }
    /* The loop will overshoot by 1, so if it is 0, it didn't find any */
    if(index === 0) {
      return undefined
    } else {
      return --index
    }
  }
}

export class Slideshow {
  constructor() {
    this.configured = false // if the slideshow is ready to start
    this.loaded = false     // if the data files have been loaded
    this.events = new EventsArray() // Needs prototype to work
    this.events = []
    this.events.indexOfLastEventAt = indexOfLastEventAt
    this.presentationTime = 0 /* running time for the presentation */
    this.startTime = null /* time the show was started */
    this.lastSeekTime = 0 // last time seeked to; initially the start
    this.playing = false
    this.activeEvents = [] /* currently visible events */
    this.stopIndex = null // Index in the events array of the latest active
  }

  get currentTime() {
    return new Date().getTime() - this.startTime
  }

  start() {
    this.playing = true
    this.startTime = new Date().getTime() - this.lastSeekTime
  }

  stop() {
    this.playing = false
  }

  reset() {
    this.lastSeekTime = 0
    this.playing = false
    while(this.activeEvents.length > 0) {
      this.activeEvents.pop().active = false
    }
    for(const { element: root } of this.events) {
      uiInterface.hideElement(root)
    }
  }

  seekToTime(time) {
    const index = this.stopIndex = (
      this.events.indexOfLastEventAt(time)
    )
    for(const i = this.activeEvents.length - 1; i >= 0; i--) {
      if(this.activeEvents[i].startTime > time
        || this.activeEvents[i].endTime <= time) {
        uiInterface.hideElement(this.activeEvents[i].element)
        this.activeEvents[i].active = false
        this.activeEvents.splice(i, 1)
      }
    }
    if(index != null) {
      for(; index >= 0; index--) {
        if(
          this.events[index].endTime > time
          && !this.events[index].active
        ) {
          this.events[index].active = true
          uiInterface.showElement(this.events[index].element)
          this.activeEvents.push(this.events[index])
        }
      }
    }
    this.lastSeekTime = time
  }

  async load(
    xmlDocument, // DOM configuration
    uiInterface, // object with UI interface functions
  ) {
    this.uiInterface = uiInterface
    this.backgroundMusic = (
      xmlDocument.documentElement.getAttribute('backgroundMusic')
    )

    const stopPoints = this.extractStopPoints(xmlDocument)
    const slides = await this.extractSlides(xmlDocument)
    this.loaded = true
    const finishLayout = () => {
      if(debug) {
        console.debug({ 'Finishing': { slides, stopPoints } })
      }

      this.layout(slides, stopPoints)
    }
    addListener(uiInterface, 'load', finishLayout, false)
  }

  /**
   * Does the final layout on the slides. This cannot be done
   * until all the html is loaded
   */
  layout(slides, stopPoints) {
    if(!uiInterface.loaded) {
      throw new Error('UI not loaded in `layout`.')
    }
    if(debug) {
      console.debug({ 'Laying Out': { slides, stopPoints } })
    }
    if(!this.configured && !this.finishingLayout) {
      this.finishingLayout = true
      this.timeSlides(slides, stopPoints)
      for(const slide of Array.from(slides)) {
        const slideEvents = uiInterface.layoutSlide(slide)
        //this.events = this.events.concat(slideEvents) // Adding a mystery element
        while(slideEvents.length > 0) {
          this.events.push(slideEvents.pop())
        }
      }
      this.events.sort((a, b) => (b.startTime - a.startTime))
      for(const event of this.events) {
        this.presentationTime = Math.max(
          this.presentationTime, event.endTime,
        )
      }

      if(debug) {
        console.debug({ 'Slideshow Events': this.events })
      }

      this.configured = true
      this.finishingLayout = undefined

      const event = createEvent('Events')
      event.initEvent('configure', true, true) //true for can bubble, true for cancelable
      this.dispatchEvent(event)
    }
  }

  /**
   * Sets the display times on the slides. There are several possibilities:
   * A slide with no timing specification:
   *  The slide and first element get the current stopPoint and each element
   *   after gets the next stopPoint the end time is the next unused stopPoint
   * The startTime can be overridden
   */
  timeSlides(slides, stopPoints) {
    let currentStopIndex = -1

    const setSlideStartTime = (element, startTime) => {
      if(startTime == null) {
        startTime = element.startTime
      }
      if(startTime != null) {
        if(startTime === 'none') {
          // start time will be handled by the loader
        } else if(
          typeof(startTime) === 'string'
          && startTime.includes('+')
        ) { // relative offset
          const offset = (
            Number(startTime.substring(startTime.indexOf('+') + 1))
          )
          // The first slide cannot have a relative offset
          if(currentStopIndex < 0) {
            currentStopIndex = 0
          }
          try {
            element.startTime = (
              stopPoints[currentStopIndex] + offset
            )
          } catch(e) {
            console.error(
              'Error Setting Start Time:'
              + ` ${e.message}:${element.nodeName}`
            )
          }
        } else {
          element.startTime = Number(element.startTime)
        }
      } else {
        if(currentStopIndex >= stopPoints.length) {
          console.error(
            `Too Few Stop Points: ${stopPoints.length}`
          )
        }
        element.startTime = stopPoints[++currentStopIndex]
      }
    }

    for(const slide of slides) {
      setSlideStartTime(slide)
      for(let elemIndex = 0; elemIndex < slide.length; elemIndex++) {
        const element = slide[elemIndex]
        /* The first element should display as the slide opens
        *  unless it has an explicit offset specified
        */
        if(elemIndex == 0 && element.startTime == null) {
          setSlideStartTime(element, '+0')
        } else {
          setSlideStartTime(element, element.startTime)
        }
        if(slide.type == 'html') {
          const { timings } = element
          for(const timing of timings) {
            setSlideStartTime(timing, timing.startTime)
          }
        }
      }
      let endTime = stopPoints[currentStopIndex + 1]
      if(slide.duration != null) {
        endTime = slide.startTime + slide.duration
      }
      slide.endTime = endTime

      for(const info of slide) {
        info.endTime = endTime

        if(slide.type == 'html') {
          const { timings } = info
          for(const timing of timings) {
            if(!timing.element) {
              console.error(`No timing on: ${timing.element}`)
            }
            timing.endTime = endTime
          }
        }
      }
    }
  }

  /**
   * Takes a document and returns is list of an stop points that are present
   */
  extractStopPoints(xmlDocument) {
    const stopPointLists = (
      xmlDocument.getElementsByTagName('stopPointList')
    )
    const stopPoints = []
    for(const list of Array.from(stopPointLists)) {
      for(const child of Array.from(list.childNodes)) {
        if(child.nodeType === Node.TEXT_NODE) {
          const points = child.data.split(/\s+/)
          for(const point of points) {
            if(point !== '') {
              stopPoints.push(Number(point))
            }
          }
        } else if(child.nodeType == Node.COMMENT_NODE) {
        } else {
          console.error(
            `Unexpected child of stopPointsList: ${child.nodeType}.`
          )
        }
      }
    }
    return stopPoints
  }

  /**
   * Extracts basic information about the slides
   */
  async extractSlides(xmlDocument) {
    const slideElements = (
      xmlDocument.getElementsByTagName('slide')
    )

    if(debug) {
      console.debug({
        slides: Array.from(slideElements),
      })
    }

    const slideProps = ['startTime', 'duration']
    const slides = []
    for(const slide of Array.from(slideElements)) {
      const objects = []
      for(const prop of slideProps) {
        let attr = slide.getAttribute(prop)
        if(/^\d+$/.test(attr)) attr = Number(attr)
        if(attr != null) objects[prop] = attr
      }
      for(const child of Array.from(slide.childNodes)) {
        if(child.nodeType !== Node.ELEMENT_NODE) {
          continue
        }
        objects.type = child.nodeName
        switch(child.nodeName) {
          case 'document': {
            const info = new DocumentInfo()
            for(const elm of Array.from(child.childNodes)) {
              if(elm.nodeType === Node.ELEMENT_NODE) {
                const timing = {
                  id: elm.getAttribute('targetId'),
                  startTime: elm.getAttribute('startTime'),
                  duration: elm.getAttribute('duration'),
                  animation: elm.getAttribute('introAnimation'),
                }
                timing.duration = (
                  timing.duration != null
                  ? Number(timing.duration)
                  : null
                )
                info.timings.push(timing)
              }
            }
            this.uiInterface.loadHTML(
              child.getAttribute('src'), info,
            )
            objects.push(info)
            break
          }
          case 'image': {
            objects.push(new ImageInfo(
              this.uiInterface.loadImage(child.getAttribute('src')),
              child.getAttribute('style'),
            ))
            for(const prop of slideProps) {
              let attr = child.getAttribute(prop)
              if(/^\d+$/.test(attr)) attr = Number(attr)
              if(attr != null) objects.at(-1)[prop] = attr
            }
            break
          }
          case 'loader': {
            let script = child.getAttribute('src')
            if(!script) {
              script = ''
              for(const sub of Array.from(child.childNodes)) {
                if(
                  [Node.TEXT_NODE, Node.CDATA_SECTION_NODE]
                  .includes(sub.nodeType)
                ) {
                  script += sub.data
                }
              }
              if(script != '') {
                script = (
                  'data:text/javascript;charset=utf-8,'
                  + encodeURIComponent(script)
                )
              }
            }
            
            if(debug) {
              console.debug({ 'Loading Loader': script })
            }

            const { default: loader } = await import(script)
            objects.loader = loader
            break
          }
          default: {
            console.error(
              `Unknown Slide Element: "${child.nodeName}".`
            )
          }
        }
      }
      slides.push(objects)
    }
    return slides
  }

  addEventListener(type, listener, bubble) {
    if(type !== 'configure') {
      throw new Error(`Unknown Event Type: "${type}".`)
    }
    this.configureListeners ??= []
    this.configureListeners.push(listener)
  }

  dispatchEvent(event) {
    if(event.type !== 'configure') {
      throw new Error(`Unknown Event Type: "${event.type}".`)
    }
    for(const listener of this.configureListeners ?? []) {
      listener.call(listener, event)
    }
  }

  addEvent(element, startTime, endTime) {
    if(startTime >= endTime) {
      console.error(
        `Event ends at ${endTime} <= when it starts ${startTime}.`
      )
    }
    this.events.push(new DisplayEvent(element, startTime, endTime))
    this.presentationTime = Math.max(presentationTime, endTime)
    this.uiInterface = hideElement(element)
  }
}
