/* Compatability layer to get scripts to work on
 *  more than just mozilla.
 */

// From: http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/ecma-script-binding.html
if(!globalThis.Node) {
  globalThis.Node = {
    ELEMENT_NODE : 1,
    ATTRIBUTE_NODE : 2,
    TEXT_NODE : 3,
    CDATA_SECTION_NODE : 4,
    ENTITY_REFERENCE_NODE : 5,
    ENTITY_NODE : 6,
    PROCESSING_INSTRUCTION_NODE : 7,
    COMMENT_NODE : 8,
    DOCUMENT_NODE : 9,
    DOCUMENT_TYPE_NODE : 10,
    DOCUMENT_FRAGMENT_NODE : 11,
    NOTATION_NODE : 12,
  }
}

/**
 * Returns if event listeners can be added
 */
export function supportsEventListeners(element) {
  if(element == null) element = this
  return (
    typeof(element.addEventListener) != 'undefined'
    || typeof(this.attachEvent) != 'undefined'
  )
}

/**
 * Returns if elements can be dynamically inserted
 */
export function supportsDynamicInsertion() {
  return true
}

/**
 * Adds a listener that fires on document loading
 */
export function addLoadListener(listener, onbubble) {
  if(supportsEventListeners(this)) {
    addListener(this, 'load', listener, onbubble)
  } else if(supportsEventListeners(document)) {
    addListener(document, 'load', listener, onbubble)
  } else {
    alert('Could not set up load listener')
  }
}

/**
 * Adds an event listener to a component
 */
export function addListener(element, event, listener, bubble) {
  if(element.addEventListener) {
    if(typeof(bubble) == 'undefined') bubble = false
    element.addEventListener(event, listener, bubble)
  } else if(this.attachEvent) {
    element.attachEvent('on' + event, listener)
  } else {
    console.error(`Could not set up ${event} listener.`)
  }
}

/**
 * Remove an event listener from a component
 */
export function removeListener(element, event, listener, bubble) {
  if(element.removeEventListener) {
    if(typeof(bubble) == 'undefined') bubble = false
    element.removeEventListener(event, listener, bubble)
  } else if(this.detachEvent) {
    element.detachEvent('on' + event, listener)
  } else {
    console.error(`Could not remove ${event} listener.`)
  }
}

export const stylesheetAlerted = false

/**
 * Add a new rule to the last stylesheet
 */
export function addStylesheetRule(selector, declarations, stylesheet) {
  if(
    stylesheet == null
    && typeof(document.styleSheets) != 'undefined'
  ) {
    stylesheet = (
      document.styleSheets[document.styleSheets.length - 1]
    )
  }
  if(stylesheet != null) {
    const rules = undefined
    if(stylesheet.cssRules != null) {
      rules = stylesheet.cssRules
    } else if(stylesheet.rules != null) {
      rules = stylesheet.rules
    }
    if(rules != null) {
      if(stylesheet.insertRule != null) {
        stylesheet.insertRule(
          `${selector}{${declarations}}`,
          rules.length,
        )
      } else if(stylesheet.addRule != null) {
        stylesheet.addRule(selector, declarations)
      }
      return rules.at(-1).style
    }
  }
}

/**
 * Add an option to a select
 */
export function addOption(text, parent) {
  if(text) {
    const option = document.createElement('option')
    option.appendChild(document.createTextNode(text))
    parent.appendChild(option)
  }
}

export function createEvent(type, useBuiltIn = true) {
  if(typeof(document.createEvent) != 'undefined' && useBuiltIn) {
    return document.createEvent.apply(document, arguments)
  } else {
    const event = new Object()
    event[`init${type.substring(0, type.length - 1)}`] = function() {
      for(
        let i = 0;
        i < arguments.length && i < this.argNames.length;
        i++
      ) {
        this[this.argNames[i]] = arguments[i]
      }
    }
    const baseArgs = ['type', 'bubbles', 'cancelable']
    switch(type) {
      case 'UIEvents': {
        event.argNames = baseArgs.concat(['view', 'detail'])
        break
      }
      case 'MouseEvents': {
        event.argNames = baseArgs.concat([
          'view', 'detail', 'screenX', 'screenY',
          'clientX', 'clientY', 'ctrlKey', 'altKey',
          'shiftKey', 'metaKey', 'button',
          'relatedTarget'
        ])
        break
      }
      case 'MutationEvents': {
        event.argNames = baseArgs.concat([
          'relatedNode', 'prevValue', 'newValue',
          'attrName', 'attrChange'
        ])
        break
      }
      default: {
        event.argNames = baseArgs
      }
    }
    return event
  }
}

/**
 * Get the source of an event
 */
export function getSource(event) {
  if(event.target) {
    return event.target
  } else if(event.srcElement) {
    return event.srcElement
  }
  console.error('Could not find event source.')
}

/**
 * Keep an event from exhibiting its default behavior
 */
export function killEvent(event) {
  if(event.preventDefault) {
    event.preventDefault()
  } else { // assume it is IE
    event.returnValue = false
  }
}

/**
 * Get the form associated with a component that has received
 * a submit event
 */
export function getForm(submission) {
  // The event source may be the component that
  //  caused the submit or the whole form
  if(submission.form) {
    return submission.form
  } else if(submission.tagName.toLowerCase() == 'form') {
    return submission
  }
  console.error('Could not find form element.')
}

/**
 * Print in dialogs the properties an object has
 */
export function printProperties(element, skipConstants) {
  const lists = []
  for(let property in element) {
    if(skipConstants && property.match(/^[A-Z_0-9]*$/)) continue

    const name = `element.${property}`
    const value = element[property]
    const type = typeof(value)

    if(!lists[type]) lists[type] = `${type}s:`
    lists[type] += '\n'

    if(type == 'function') {
      lists[type] += name
    } else {
      lists[type] += `${name} => ${value}`
    }
  }
  console.info({ 'Object Properties': lists })
}

/**
 * Empty a node
 */
export function clearNode(node) {
  while(node.hasChildNodes()) {
    node.removeChild(node.firstChild)
  }
}

/**
 * Append the elements in an array to an element
 */
export function copyTo(holder, contents) {
  for(const content of Array.from(contents)) {
    holder.appendChild(content)
  }
}

/* Randomizes the elements of an array */
Array.prototype.randomize = function performFisherYates() {
  let i = this.length
  if(i > 0) {
    while(--i > 0) {
      const j = Math.floor(Math.random() * (i + 1))
      const tempi = this[i]
      const tempj = this[j]
      this[i] = tempj
      this[j] = tempi
    }
  }
}

export function nodeIsInDocument(node) {
  return (
    node != null
    && node.parentNode != null
    && node.parentNode.nodeType == Node.ELEMENT_NODE
  )
}

export function setStyleProperty(element, property, value) {
  if(element?.style == null) {
    console.error(`Not Stylable: ${typeof(element)}:`, element)
  } else {
    if(element.style.setProperty) {
      element.style.setProperty(property, value, null)
    } else if(element.style.setAttribute) {
      element.style.setAttribute(property, value)
    } else {
      element.style[property] = value
    }
  }
}

export function getCurrentStyle(element) {
  if(element.currentStyle) {
    return element.currentStyle
  } else if(
    document.defaultView
    && document.defaultView.getComputedStyle
  ) {
    return document.defaultView.getComputedStyle(element, '')
  }
}

export function setOpacity(element, opacity) {
  if(element?.style?.opacity != null) {
    element.style.opacity = opacity
  } else if(element.style.filter) {
  }
}

export function getXMLHttpRequest(callback) {
  let request
  if(typeof(XMLHttpRequest) !== 'undefined') {
    request = new XMLHttpRequest()
  } else if(window.ActiveXObject) {
    const msxmlProgIds = [
      'MSXML2.XMLHTTP.5.0',
      'MSXML2.XMLHTTP.4.0',
      'MSXML2.XMLHTTP.3.0',
      'MSXML2.XMLHTTP',
      'Microsoft.XMLHTTP',
    ]
    for(const msxmlProgId of msxmlProgIds) {
      try {
        request = new ActiveXObject(msxmlProgid)
        if(request) break
      } catch(e) {}
    }
  }
  if(request != null) {
    setXMLHttpCallback(request, callback)
  }
  return request
}

export async function loadXMLDocument(url, callback) {
  const res = await fetch(url)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  callback.call(callback, doc)
  return doc
}

export function selectNodes(document, xpath, namespaceID, namespace) {
  let nodes = null
  try {
    if(document.evaluate) {
      let resolver = null
      if(namespace) {
        resolver = {
          normalResolver: (
            document.createNSResolver(document.documentElement)
          ),
          lookupNamespaceURI(prefix) {
            switch(prefix) {
              case namespaceID: return namespace
              default: return (
                this.normalResolver.lookupNamespaceURI(prefix)
              )
            }
          }
        }
      }
      nodes = document.evaluate(
        xpath, document, resolver,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
      )
      nodes.length = () => (nodes.snapshotLength)
      nodes.item = (index) => (nodes.snapshotItem(index))
    } else if(
      document.documentElement
      && document.documentElement.selectNodes != null
    ) {
      if(namespace) {
        document.setProperty(
          'SelectionNamespaces',
          `xmlns:${namespaceID}='${namespace}'`
        )
      }
      document.setProperty('SelectionLanguage', 'XPath')
      nodes = document.documentElement.selectNodes(xpath)
    } else {
      console.error(
        `Could not select XPath: ${xpath} on ${document}.`
      )
    }
  } catch(e) {
    console.error(`[${xpath}]: ${e.message}`)
  }
  return nodes
}

export function getCookie() {
  const values = []
  const cookieParts = document.cookie.split(/ +/g)
  for(const part of cookieParts) {
    const equalsIndex = part.indexOf('=')
    if(equalsIndex > 0) {
      const name = part.substring(0, equalsIndex)
      values[name] = decodeURIComponent(
        part.substring(equalsIndex + 1)
      )
    }
  }
  return values
}

export function setCookie(values, expiration) {
  if(expiration == null) {
    expiration = 1 // one day
  }
  if(values.expires == null) {
    const expirationDate = new Date() 
    expirationDate.setTime(
      expirationDate.getTime() + (expiration * 24 * 60 * 60 * 1000)
    )
    values.expires = expirationDate.toGMTString()
  }
  const cookieValue = ''
  for(const key in values) {
    cookieValue += `${key}=${encodeURIComponent(values[key])};`
  }
  document.cookie = cookieValue
}
