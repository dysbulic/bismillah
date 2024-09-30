import {
  setStyleProperty, addListener,
  loadXMLDocument, createEvent,
  nodeIsInDocument,
  clearNode,
} from './compatability.js'
import {
  slideshow as show, debug,
} from './control.js'

/**
 * Represents an interface between a show and the containing page
 */
export class UIInterface {
  constructor(container) {
    this.container = container
    container.classList.add('loading')

    this.removeElements = true; // either removeChild or set display='none' on hide
    this._unloadedObjects = 0; // number of images requested, but not uploaded
    this.loaded = false
    this.loadEvents = []
    this.loadingStyle = { border: '2px solid var(--red)' }
    this.loadedStyle = { 'border-color': 'var(--green)' }
    this.loadErrorStyle = { 'border-color': 'var(--orange)' }
  }

  loadImage(filename) {
    const image = new Image()
    for(const prop in this.loadingStyle) {
      setStyleProperty(image, prop, this.loadingStyle[prop])
    }
    const loadListener = () => {
      this.imageLoaded(image)
    }
    const errorListener = () => {
      this.imageError(this.error)
    }
    loadListener.image = errorListener.image = image
    loadListener.ui = errorListener.ui = this
    addListener(image, 'load', loadListener, false)
    addListener(image, 'error', errorListener, false)
    this.incrementObjectCount()
    image.src = filename

    const item = document.createElement('li')
    item.appendChild(image)
    this.container.appendChild(item)
    
    return image
  }

  imageLoaded(image) {
    for(const prop in this.loadedStyle) {
      setStyleProperty(image, prop, this.loadedStyle[prop])
    }
    this.decrementObjectCount()
  }

  imageError(image) {
    for(const prop in this.loadErrorStyle) {
      setStyleProperty(image, prop, this.loadErrorStyle[prop])
    }
    this.decrementObjectCount()
  }

  loadHTML(filename, info) {
    var callback = function(doc) {
      this.ui.loadDocument(doc, this.info)
      this.ui.decrementObjectCount()
    }
    callback.info = info
    callback.info.element.className = 'markup'
    callback.ui = this
    this.incrementObjectCount()
    loadXMLDocument(filename, callback)
    return callback.info.element
  }

  loadDocument(loadedDocument, info) {
    const { timings } = info
    if(!timings) {
      throw new Error('Timings not specified.')
    } else {
      for(const timing of timings) {
        const time = loadedDocument.getElementById(timing.id)
        if(!time) {
          console.error(`Couldn’t Find Id: "#${timing.id}".`)
          // timings.splice(i, 1)
        } else {
          timing.element = time
        }
      }
      const body = loadedDocument.querySelector('body')
      if(!body) {
        throw new Error(
          'Could not locate html:body element.'
        )
      } else {
        while(body.hasChildNodes()) {
          const child = body.firstChild
          body.removeChild(child)
          try {
            info.element.appendChild(child)
          } catch(e) {
            info.element.appendChild(
              document.createElement('div')
            )
            info.element.lastChild.appendChild(
              document.createTextNode(
                `Error Loading: ${child.nodeName}`
              )
            )
          }
        }
      }
      const head = loadedDocument.querySelector('head')
      if(!head) {
        throw new Error(
          'Could not locate html:head element'
        )
      } else {
        const dochead = (
          document.getElementsByTagName('head').item(0)
        )
        while(head.hasChildNodes()) {
          const child = head.firstChild
          head.removeChild(child)
          if(child.nodeType == Node.ELEMENT_NODE) {
            try {
              dochead?.appendChild(child)
              child.disabled = true
            } catch(e) {
              info.element.appendChild(
                document.createElement('div')
              )
              info.element.lastChild.appendChild(
                document.createTextNode(
                  `Error Loading: ${child.nodeName}`
                )
              )
            }
            info.styleSheets ??= []
            info.styleSheets.push(child)
          }
        }
      }
    }
  }

  hideElement(info) {
    if(this.removeElements) {
      if(nodeIsInDocument(info.element)) {
        info.savedParent = info.element.parentNode
        info.element.parentNode.removeChild(info.element)
      }
    } else {
      if(info.savedDisplay == null) {
        if(typeof(window.getComputedStyle) !== 'undefined') {
          info.savedDisplay = (
            window.getComputedStyle(info.element, null).display
          )
        } else if(info.element.currentStyle != null) {
          info.savedDisplay = info.element.currentStyle.display
        } else {
          info.savedDisplay = 'inline'
        }
      }
      info.element.style.display = 'none'
    }
    if(info.styleSheets != null) {
      for(const sheet of info.styleSheets) {
        try {
          sheet.disabled = true
        } catch(e) {}
      }
    }
  }

  showElement(info) {
    if(this.removeElements) {
      if(!nodeIsInDocument(info.element)) {
        info.savedParent.appendChild(info.element)
      }
    } else {
      info.element.style.display = info.savedDisplay
    }
    for(const sheet of info.styleSheets ?? []) {
      try {
        sheet.disabled = false
      } catch(e) {}
    }
  }

  incrementObjectCount() {
    this._unloadedObjects++
  }

  decrementObjectCount() {
    this._unloadedObjects--
    if(this._unloadedObjects === 0 && show.loaded) { // config is parsed
      if(debug) {
        console.debug({ Done: {
          count: this._unloadedObjects, loaded: show.loaded
        } })
      }

      this.loaded = true
      const event = createEvent('Events')
      event.initEvent('load', true, true); //true for can bubble, true for cancelable
      this.dispatchEvent(event)
    }
  }

  layoutSlide(slide) {
    if(this.container.classList.contains('loading')) {
      this.container.classList.remove('loading')
      clearNode(this.container)
    }
    let events = []
    if(slide.length > 0) {
      const holder = document.createElement('li')

      if(slide.loader) {
        events = slide.loader.call(this, slide, holder)
      } else if(slide.type == 'document') {
        holder.classList.add('single')
        for(const info of slide) {
          events.push(...this.layoutHTML(info, holder))
        }
      } else { // image slide, no mixed mode slides at this point
        const customLayout = (
          !!slide.find((e) => (e.style != null))
        )
        const stdLayout = (
          !!slide.find((e) => (e.style == null))
        )
        if(customLayout && stdLayout) { // Must all be custom or none
          console.error(
            'Mixed table and custom layout not supported.'
          )
        }
        if(customLayout) {
          events.push(...this.layoutCustom(slide, holder))
        } else if(slide.length === 1) {
          events.push(...this.layoutSingle(slide, holder))
        } else {
          events.push(...this.layoutList(slide, holder))
        }
      }
      for(const { image } of slide) {
        if(image) {
          for(const prop in this.loadingStyle) {
            setStyleProperty(image, prop, null)
          }
        }
      }

      this.container.appendChild(holder)

      events.push(show.addEvent(
        holder, slide.startTime, slide.endTime,
      ))
    }

    return events
  }

  /**
   * Lay out a singlular element.
   */
  layoutSingle(slide, holder) {
    holder.classList.add('single')
    const [{ image: cover }] = slide
    if(nodeIsInDocument(cover)) {
      cover.parentNode.removeChild(cover)
    }
    holder.appendChild(cover)
    return []
  }


  /**
   * Take a slide and lay the elements out in a `.custom` `<div>`.
   */
  layoutCustom(slide, holder) {
    const events = []
    holder.className = 'layout'
    for(const info of slide) {
      info.element = document.createElement('div')
      info.element.className = 'custom'
      try {
        holder.appendChild(info.element)
      } catch(e) {
        console.error(
          `Couldn’t add custom image holder: ${e.message}`
        )
      }
      if(info.style != null) {
        for(const prop in info.style) {
          setStyleProperty(info.element, prop, info.style[prop])
        }
      }
      if(nodeIsInDocument(info.image)) {
        info.image.parentNode.removeChild(info.image)
      }
      info.element.appendChild(info.image)
      events.push(show.addEvent(info))
    }
    return events
  }

  /**
   * Take a slide and put the elements in a CSS list.
   */
  layoutList(slide, holder) {
    const events = []
    holder.className = 'multi'
    let col = undefined
    const switchIndex = Math.floor(slide.length / 2)
    for(let index = 0; index < slide.length; index++) {
      const info = slide[index]
      if(index === 0 || index === switchIndex) {
        col = document.createElement('ol')
        const classList = ([
          index === 0 ? 'left' : 'right', 'column',
        ])
        if(index == 0) {
          classList.push(`elm-${switchIndex}`)
        } else {
          classList.push(`elm-${slide.length - switchIndex}`)
        }
        col.classList.add(...classList)
        holder.appendChild(col)
      }
      info.element = document.createElement('li')
      col?.appendChild(info.element)
      if(info != null) {
        if(nodeIsInDocument(info.image)) {
          info.image.parentNode
          .removeChild(info.image)
        }
        info.element.appendChild(info.image)
        events.push(show.addEvent(info))
      }
    }
    return events
  }

  layoutHTML(info, holder) {
    const events = []
    holder.appendChild(info.element)
    events.push(show.addEvent(info))
    events.push(
      ...info.timings.map((t) => show.addEvent(t))
    )
    return events
  }

  addEventListener(type, listener, bubble) {
    if(type !== 'load') {
      throw new Error(`Unknown Event Type: "${type}".`)
    }
    this.loadListeners ??= []
    this.loadListeners.push(listener)
    this.loadEvents.forEach((e) => ( // load events fired before registration
      this.dispatchEvent(e, listener)
    ))
  }

  dispatchEvent(event, listener) {
    if(event.type !== 'load') {
      throw new Error(`Unknown Event Type: "${event.type}".`)
    }
    if(!this.loadEvents.includes(event)) {
      this.loadEvents.push(event)
    }
    let listeners = listener ? [listener] : this.loadListeners
    if(!listeners) {
      if(debug) console.warn('No `load` listeners.')
    } else {
      for(const listener of listeners) {
        listener.call(listener, event)
      }
    }
  }
}
