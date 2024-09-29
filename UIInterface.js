import {
  setStyleProperty, addListener,
  loadXMLDocument, createEvent,
  nodeIsInDocument,
} from './compatability.js'
import { DisplayEvent } from './Slideshow.js'
import { slideshow, uiInterface } from './control.js'

/**
 * Represents an interface between a Slideshow and the containing page
 */
export class UIInterface {
  constructor(container) {
    this.container = container
    container.tempImageHolder = document.createElement('div')
    container.tempImageHolder.className = 'tablecell'
    container.appendChild(container.tempImageHolder)

    this.removeElements = true; // either removeChild or set display='none' on hide
    this._unloadedObjects = 0; // number of images requested, but not uploaded
    this.loaded = false
    this.loadingStyle = {}
    this.loadingStyle.border = '2px solid red'
    this.loadingStyle.width = this.loadingStyle.height = '40px'
    this.loadedStyle = { 'border-color': 'green' }
    this.loadErrorStyle = { 'border-color': 'orange' }
  }

  loadImage(filename) {
    const image = new Image()
    for(const prop in this.loadingStyle) {
      setStyleProperty(image, prop, this.loadingStyle[prop])
    }
    const loadListener = () => {
      uiInterface.imageLoaded(image)
    }
    const errorListener = () => {
      uiInterface.imageError(this.error)
    }
    loadListener.image = errorListener.image = image
    loadListener.ui = errorListener.ui = this
    addListener(image, 'load', loadListener, false)
    addListener(image, 'error', errorListener, false)
    this.incrementObjectCount()
    image.src = filename
    this.container.tempImageHolder.appendChild(image)
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
    callback.info.element.className = 'htmlholder'
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
          console.error(`Couldn’t find: ${timing.id}`)
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
          if(
            child.nodeType == Node.ELEMENT_NODE
            && (
              ['style', 'link'].includes(
                child.nodeName.toLowerCase()
              )
            )
          ) {
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
            info.styleSheets ??= new Array()
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
    console.debug({ count: this._unloadedObjects, loaded: slideshow.loaded })
    if(this._unloadedObjects === 0 && slideshow.loaded) { // config is parsed
      this.loaded = true
      const event = createEvent('Events')
      event.initEvent('load', true, true); //true for can bubble, true for cancelable
      this.dispatchEvent(event)
    }
  }

  layoutSlide(slide) {
    if(nodeIsInDocument(this.container.tempImageHolder)) {
      this.container.removeChild(this.container.tempImageHolder)
    }
    let events = new Array()
    if(slide.length > 0) {
      const element = document.createElement('div')
      if(slide.loader) {
        events = slide.loader.call(this, slide, element)
      } else  if(slide.type == 'html') {
        for(let i = 0; i < slide.length; i++) {
          element.className = 'tablecell single'
          events = this.layoutHTML(slide[i], element)
        }
      } else { // image slide, no mixed mode slides at this point
        const customLayout = slide[0].style != null
        for(const { style } of slide) {
          if(
            (customLayout && style == null)
            || (!customLayout && style != null)
          ) {
            // Must all be custom or none
            console.error(
              'Mixed table and custom layout'
              + ' not currently supported.'
            )
          }
        }
        if(customLayout) {
          events = this.layoutCustomImages(slide, element)
        } else if(slide.length === 1) {
          element.classList = ['tablecell', 'single']
          if(nodeIsInDocument(slide[0].image)) {
            slide[0].image.parentNode.removeChild(slide[0].image)
          }
          element.appendChild(slide[0].image)
        } else {
          events = this.layoutImageTable(slide, element)
        }
      }
      for(const { image } of slide) {
        if(image) {
          for(const prop in this.loadingStyle) {
            setStyleProperty(image, prop, null)
          }
        }
      }
      this.container.appendChild(element)
      events.push(
        new DisplayEvent(
          { element }, slide.startTime, slide.endTime
        )
      )
    }
    return events
  }

  /**
   * Take a slide and lay the elements out in a customlayout div
   */
  layoutCustomImages(slide, holder) {
    const events = new Array()
    holder.className = 'customlayout'
    for(const info of slide) {
      info.element = document.createElement('div')
      info.element.className = 'customelm'
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
      events.push(new DisplayEvent(
        info, info.startTime, info.endTime,
      ))
    }
    return events
  }

  /**
   * Take a slide and put the elements in a css table
   */
  layoutImageTable(slide, holder) {
    const events = new Array()
    holder.className = 'multipics'
    let col = undefined
    const switchIndex = Math.floor(slide.length / 2)
    for(let index = 0; index < slide.length; index++) {
      const info = slide[index]
      if(index === 0 || index === switchIndex) {
        col = document.createElement('div')
        const classList = [`${(index == 0 ? 'left' : 'right')}col`]
        if(index == 0) {
          classList.push(`elm-${switchIndex}`)
        } else {
          classList.push(`elm-${slide.length - switchIndex}`)
        }
        col.classList = classList
        holder.appendChild(col)
      }
      info.element = document.createElement('div')
      info.element.className = 'innertable'
      col?.appendChild(info.element)
      if(typeof(slide[index]) !== 'undefined') {
        const tablecell = document.createElement('div')
        tablecell.className = 'tablecell'
        info.element.appendChild(tablecell)
        if(nodeIsInDocument(slide[index].image)) {
          slide[index].image
          .parentNode
          .removeChild(slide[index].image)
        }
        tablecell.appendChild(slide[index].image)
        events.push(new DisplayEvent(
          info,
          slide[index].startTime,
          slide[index].endTime,
        ))
      }
    }
    return events
  }

  layoutHTML(slide, holder) {
    const events = new Array()
    for(let i = 0; i < slide.length; i++) {
      holder.appendChild(slide[i].element)
      events.push(new DisplayEvent(
        slide[i], slide.startTime, slide.endTime,
      ))
      for(let j = 0; j < slide[i].timings.length; j++) {
        const timing = slide[i].timings[j]
        events.push(new DisplayEvent(
          timing, timing.startTime, timing.endTime,
        ))
      }
    }
    return events
  }

  addEventListener(type, listener, bubble) {
    if(type !== 'load') {
      throw new Error(`Unknown Event Type: "${type}".`)
    }
    this.loadListeners ??= new Array()
    this.loadListeners.push(listener)
  }

  dispatchEvent(event) {
    if(event.type !== 'load') {
      throw new Error(`Unknown Event Type: "${event.type}".`)
    }
    if(!this.loadListeners) {
      console.debug('No `load` listeners.')
    } else {
      for(const listener of this.loadListeners) {
        listener.call(listener, event)
      }
    }
  }
}
