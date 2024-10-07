import { addListener, createEvent } from './compatability.js'
import { ui, debug, verbose } from './control.js'

/**
 * Class used to hold the info about images in a custom layout
 */
export class ImageInfo {
  constructor(image, style) {
    this.image = image
    if(style) {
      this.style ??= []
      const styleElements = style.trim().split(/\s*;\s*/)
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
  constructor(info = {}, opts = { newTag: 'div' }) {
    if(!info.element) {
      info.element = (
        document.createElement(opts.newTag)
      )
    }
    Object.assign(this, info)
    this.timings = []
  }
}

export class TimingInfo {
  constructor(params) {
    Object.assign(this, params)
  }

  static from(source) {
    if(source instanceof Node) {
      const timing = {
        id: source.getAttribute('targetId'),
        startTime: source.getAttribute('startTime'),
        duration: source.getAttribute('duration'),
        animation: source.getAttribute('introAnimation'),
      }
      timing.duration = (
        timing.duration != null
        ? Number(timing.duration)
        : null
      )
      return new TimingInfo(timing)
    } else {
      throw new Error('Invalid source for `TimingInfo.from`.')
    }
  }
}

export class ProxiedDisplayEvent {
  active = true

  get(source, prop) {
    switch(prop) {
      case 'active': {
        return this.active
      }
      case 'element': {
        if(!source.element) {
          throw new Error('Missing `element`.')
        }
      }
      default: {
        return source[prop]
      }
    }
  }

  set(source, prop, value) {
    switch(prop) {
      case 'active': {
        if(value && this.active === false) {
          ui.showElement(source)
        } else if(!value && this.active === true) {
          ui.hideElement(source)
        }
        this.active = value
        break
      }
      default: {
        source[prop] = value
      }
    }
    return true
  }
}

export class EventsArray extends Array {
  constructor(...args) {
    super(...args)
  }

  /**
   * Last event starting at or before 'time'.
   * Could be simplified since events are sorted by start time.
   */
  indexOfLastStartAt(time) {
    return this.findLastIndex((event) => (
      event.startTime <= time
    ))
  }

  indexOfFirstStartAt(time) {
    return this.findIndex((event) => (
      event.startTime <= time
      && (
        event.endTime >= time
        || event.duration >= time - event.startTime
      )
    ))
  }

  /**
   * Events are sorted by start time, so iterate from
   * the first element which starts to with a startTime
   * <= time and an endTime >= time to the last event
   * with a startTime at or before 'time'
   */
  covering(time) {
    const index = {
      start: this.indexOfFirstStartAt(time),
      end: this.indexOfLastStartAt(time),
    }
    if(debug && verbose) {
      console.debug({ time, 'Covering Range': index, Of: this })
    }
    return this.slice(index.start, index.end + 1)
  }
}

export class Slideshow {
  constructor() {
    this.listeners = {} // event listeners
    this.configured = false // if the slideshow is ready to start
    this.loaded = false     // if the data files have been loaded
    this.events = new EventsArray() // Needs prototype to work
    this.presentationTime = 0 /* running time for the presentation */
    this.lastSeekTime = 0 // last time seeked to; initially the start
    this.playing = false
    this.stopIndex = null // Index in the events array of the latest active
  }

  get activeEvents() {
    return this.events.filter(({ active }) => (active))
  }

  get currentTime() {
    return this.lastSeekTime
  }

  set currentTime(time) {
    for(const event of this.activeEvents) {
      event.active = (
        event.startTime <= time
        && event.endTime >= time
      )
    }

    const range = this.events.covering(time)
    for(const event of range) {
      event.active = event.endTime > time
    }

    this.dispatchEvent(new Event('timeupdate'))

    this.lastSeekTime = time
  }

  start() {
    this.playing = true
    this.currentTime = 0
  }

  togglePlaying() {
    this.playing = !this.playing
  }

  stop() {
    this.playing = false
  }

  reset() {
    this.lastSeekTime = 0
    this.playing = false
    this.activeEvents.forEach((evt) => (
      evt.active = false
    ))
    this.dispatchEvent(new Event('reset'))
  }

  async load(
    xmlDocument, // DOM configuration
    ui, // object with UI interface functions
  ) {
    this.ui = ui
    this.backgroundMusic = (
      xmlDocument.documentElement
      .getAttribute('backgroundMusic')
    )

    const stopPoints = this.extractStopPoints(xmlDocument)
    const slides = await this.extractSlides(xmlDocument)
    this.loaded = true
    const finishLayout = async () => {
      if(debug) {
        console.debug({
          'Finishing': { slides, stopPoints },
        })
      }

      await this.layout(slides, stopPoints)
    }
    addListener(ui, 'load', finishLayout, false)
  }

  /**
   * Does the final layout on the slides. This cannot be done
   * until all the html is loaded
   */
  async layout(slides, stopPoints) {
    if(!ui.loaded) {
      throw new Error('UI not loaded in `layout`.')
    }
    if(!this.configured && !this.finishingLayout) {
      this.finishingLayout = true
      this.timeSlides(slides, stopPoints)

      await Promise.all(Array.from(slides).map(
        async (slide) => {
          this.events.push(...ui.layoutSlide(slide))
        }
      ))
      this.events.sort((a, b) => (a.startTime - b.startTime))

      if(debug) {
        console.debug({ 'Slideshow Events': {
          events: this.events, totalTime: this.presentationTime
        } })
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

    const setSlideStartTime = (
      (element, startTime = null) => {
        if(startTime == null) {
          startTime = element.startTime
        }
        if(startTime != null) {
          if(startTime === 'none') {
            // start will be handled by the loader
          } else if(
            typeof(startTime) !== 'string'
            || !startTime.includes('+')
          ) { // non-relative offset
            element.startTime = Number(element.startTime)
          } else { // relative offset
            const offset = (
              Number(startTime.substring(startTime.indexOf('+') + 1))
            )
            if(currentStopIndex < 0) {
              currentStopIndex = 0 // first slide can’t have a relative offset
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
          }
        } else {
          if(currentStopIndex >= stopPoints.length) {
            console.error({
              'Too Few Stop Points': stopPoints
            })
          }
          element.startTime = stopPoints[++currentStopIndex]
        }
      }
    )

    for(const slide of slides) {
      setSlideStartTime(slide)

      for(let i = 0; i < slide.length; i++) {
        const info = slide[i]
        /* The first element should display as the slide opens
        *  unless it has an explicit offset specified
        */
        if(i == 0 && info.startTime == null) {
          setSlideStartTime(info, '+0')
        } else {
          setSlideStartTime(info)
        }
        const { timings = [] } = info
        for(const timing of timings) {
          setSlideStartTime(timing)
        }
      }

      let endTime = stopPoints[currentStopIndex + 1]
      if(slide.duration != null) {
        endTime = slide.startTime + slide.duration
      }
      slide.endTime = endTime

      for(const info of slide) {
        info.endTime = endTime
        const { timings = [] } = info
        for(const timing of timings) {
          if(!timing.element) {
            console.error({
              'No Element': timing.element,
            })
          }
          timing.endTime = endTime
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
        switch(objects.type) {
          case 'document': {
            const info = new DocumentInfo()
            for(const elm of Array.from(child.childNodes)) {
              if(elm.nodeType === Node.ELEMENT_NODE) {
                info.timings.push(TimingInfo.from(elm))
              }
            }
            this.ui.loadHTML(
              child.getAttribute('src'), info,
            )
            objects.push(info)
            break
          }
          case 'image': {
            objects.push(new ImageInfo(
              this.ui.loadImage(child.getAttribute('src')),
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
    if(!['configure', 'timeupdate'].includes(type)) {
      throw new Error(`Unknown Event Type: "${type}".`)
    }
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }

  dispatchEvent(event) {
    if(!['configure', 'timeupdate'].includes(event.type)) {
      throw new Error(`Unknown Event Type: "${event.type}".`)
    }
    for(const listener of this.listeners[event.type] ?? []) {
      listener.call(listener, event)
    }
  }

  addEvent(info, start, end, opts = { append: false }) {
    start ??= info.start ?? info.startTime
    end ??= info.end ?? info.endTime

    if(start >= end) {
      console.warn(
        `Event ends @ ${end} <= when it starts @ ${start}.`
      )
      ;[start, end] = [end, start]
    }

    let element = info
    while(element.element) element = element.element
    while(element.image) element = element.image

    Object.assign(info, {
      element, startTime: start, endTime: end
    })

    const event = (
      new Proxy(info, new ProxiedDisplayEvent())
    )
    event.active = false

    if(opts.append) this.events.push(event)

    this.presentationTime = (
      Math.max(this.presentationTime, end)
    )

    return event
  }
}
