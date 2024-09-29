import { addListener, createEvent } from './compatability.js'
import { uiInterface } from './control.js'

/**
 * Class used to hold the info about images in a custom layout
 */
export class ImageInfo {
  constructor(image, styleParam) {
    this.image = image
    if(styleParam) {
      this.style = new Array()
      const styleElements = styleParam.trim().split(/\s+/)
      for(const styleElem of styleElements) {
        const [key, ...val] = styleElem.split(/\s*:\s*/)
        this.style[key] = val
      }
    }
    this.startTime = undefined
    this.endTime = undefined
  }

  toString() {
    return `ImageInfo: ${this.image}`
  }
}

export class DocumentInfo {
  constructor() {
    this.element = document.createElement('div')
    this.timings = new Array()
  }
}

export class DisplayEvent {
  constructor(element, startTime, endTime) {
    this.element = element
    this.startTime = startTime
    this.endTime = endTime
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
// Array Subclassing is not working in IE6
//EventsArray.prototype.indexOfLastEventAt = function(time) {
export function indexOfLastEventAt(time) {
  let index = undefined
  if(this.length > 0) {
    /* My binary version of this search was buggy so this is simple linear */
    index = 0
    while(index < this.length && this[index].startTime <= time) {
      index++
    }
    /* The loop will overshoot by 1, so if it is 0, it didn't find any */
    if(index === 0) {
      index = undefined
    } else {
      index--
    }
  }
  return index
}

export class Slideshow {
  constructor() {
    this.configured = false // if the slideshow is ready to start
    this.loaded = false     // if the data files have been loaded
    // this.defaultDisplayTime = 1300 /* number of milliseconds to leave an item displayed */
    this.events = new EventsArray()
    this.events = new Array()
    this.events.indexOfLastEventAt = indexOfLastEventAt
    this.presentationTime = 0 /* running time for the presentation */
    this.startTime = 0 /* time the show was started */
    this.lastSeekTime = undefined
    this.playing = false
    this.activeEvents = new Array() /* currently visible events */
    this.stopIndex = undefined // Index in the events array of the latest active event
  }

  // IE lacks getters and setters completely, so this can't be pretty
  getCurrentTime() {
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
    for(const i = 0; i < this.events.length; i++) {
      uiInterface.hideElement(this.events[i].element)
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

  load(
    xmlDocument, // DOM configuration
    uiInterface, // object with UI interface functions
  ) {
    this.uiInterface = uiInterface
    this.backgroundMusic =
      xmlDocument.documentElement.getAttribute('backgroundMusic')

    const finishLayout = function(event) {
      this.ui.layout(this.slides, this.stopPoints)
    }
    finishLayout.stopPoints = this.extractStopPoints(xmlDocument)
    finishLayout.slides = this.extractSlides(xmlDocument)
    finishLayout.ui = this
    this.loaded = true
    addListener(uiInterface, 'load', finishLayout, false)
    finishLayout.call(finishLayout) // the event could already have fired
  }

  /**
   * Does the final layout on the slides. This cannot be done
   * until all the html is loaded
   */
  layout(slides, stopPoints) {
    if(!this.configured && uiInterface.loaded && !this.finishingLayout) {
      this.finishingLayout = true
      this.timeSlides(slides, stopPoints)
      for(const i = 0; i < slides.length; i++) {
        const slideEvents = uiInterface.layoutSlide(slides[i])
        //this.events = this.events.concat(slideEvents) // Adding a mystery element
        while(slideEvents.length > 0) {
          this.events.push(slideEvents.pop())
        }
      }
      this.events.sort((a, b) => (a.startTime - b.startTime))
      for(const i = 0; i < this.events.length; i++) {
        this.presentationTime = Math.max(
          this.presentationTime, this.events[i].endTime,
        )
      }
      this.configured = true
      this.finishingLayout = undefined

      const event = createEvent('Events')
      event.initEvent('configure', true, true) //true for can bubble, true for cancelable
      this.dispatchEvent(event)
    }
  }

  /**
   * Sets the display times on the slides. There are several possibilites:
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
        } else if(startTime.contains('+')) { // relative offset
          const offset = (
            parseInt(startTime.substring(startTime.indexOf('+') + 1))
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

    for(const slideIndex = 0; slideIndex < slides.length; slideIndex++) {
      const slide = slides[slideIndex]
      setSlideStartTime(slide)
      for(const elementIndex = 0; elementIndex < slide.length; elementIndex++) {
        const element = slide[elementIndex]
        /* The first element should display as the slide opens
        *  unless it has an explicit offset specified
        */
        if(elementIndex == 0 && element.startTime == null) {
          setSlideStartTime(element, '+0')
        } else {
          setSlideStartTime(element, element.startTime)
        }
        if(slide.type == 'html') {
          const { timings } = element
          for(const i = 0; i < timings.length; i++) {
            setSlideStartTime(timings[i], timings[i].startTime)
          }
        }
      }
      const endTime = stopPoints[currentStopIndex + 1]
      if(slide.duration != null) {
        endTime = slide.startTime + Number(slide.duration)
      }
      slide.endTime = endTime
      for(const elementIndex = 0; elementIndex < slide.length; elementIndex++) {
        slide[elementIndex].endTime = endTime
      }
      if(slide.type == 'html') {
        const { timings } = element
        for(const i = 0; i < timings.length; i++) {
          if(!timings[i].element) {
            console.error(`No timing on: ${timings[i].element}`)
          }
          timings[i].endTime = endTime
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
    const stopPoints = new Array()
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
    const slideProps = ['startTime', 'duration']
    const slides = new Array()
    for(const slide of Array.from(slideElements)) {
      const objects = new Array()
      for(const prop of slideProps) {
        if(slide.getAttribute(prop) != null) {
          objects[prop] = slide.getAttribute(prop)
        }
      }
      for(const child of Array.from(slide.childNodes)) {
        if(child.nodeType == Node.ELEMENT_NODE) {
          switch(child.nodeName) {
            case 'document': {
              const info = new DocumentInfo()
              for(const elm of Array.from(child.childNodes)) {
                if(elm.nodeType === Node.ELEMENT_NODE) {
                  info.timings.push({
                    id: elm.getAttribute('targetId'),
                    startTime: elm.getAttribute('startTime'),
                    duration: elm.getAttribute('duration'),
                    animation: elm.getAttribute('introAnimation'),
                  })
                }
              }
              this.uiInterface.loadHTML(
                child.getAttribute('src'), info,
              )
              objects.push(info)
              objects.type = 'html'
              break
            }
            case 'image': {
              objects.push(new ImageInfo(
                this.uiInterface.loadImage(child.getAttribute('src')),
                child.getAttribute('style'),
              ))
              for(const prop of slideProps) {
                if(child.getAttribute(prop) != null) {
                  objects.at(-1)[prop] = child.getAttribute(prop)
                }
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
              console.debug(`Loading: "${script}".`)
              const { default: loader } = await import(script)
              objects.loader = loader
              break
            }
            default: {
              console.error(`Unknown slide element: ${child.nodeName}`)
            }
          }
        }
        slides.push(objects)
      }
    }
    return slides
  }

  addEventListener(type, listener, bubble) {
    if(type === 'configure') {
      this.configureListeners ??= new Array()
      this.configureListeners.push(listener)
    } else {
      console.error(`Unknown Event Type: "${type}".`)
    }
  }

  dispatchEvent(event) {
    if(
      event.type === 'configure'
      && this.configureListeners != null
    ) {
      for(const listener of this.configureListeners) {
        listener.call(listener, event)
      }
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
