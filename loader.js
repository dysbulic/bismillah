import {
  setStyleProperty, nodeIsInDocument,
} from './compatability.js'
import { slideshow } from './control.js'

export default function layout(slide, holder) {
  const events = []
  holder.className = 'customlayout'

  const duration = slide.endTime - slide.startTime
  const startDelay = duration * .1
  // pics regularly for the first 2/3 of the slide's display
  const picDelay = Math.round(
    (2 * (duration - startDelay) / 3) / slide.length
  )

  const orderIndexes = []
  const picIndexes = []
  for(let i = slide.length - 1; i >= 0; i--) {
    orderIndexes.push(i + 1)
    picIndexes.push(i)
  }
  orderIndexes.randomize()
  picIndexes.randomize()

  const topCount = 12
  const sideCount = 6

  for(let i = 0; i < slide.length; i++) {
    const info = slide[i]
    const index = orderIndexes[i]
    info.element = document.createElement('div')
    info.element.className = 'customelm'
    info.element.appendChild(slide[picIndexes[i]].image)

    const allSideCount = 2 * topCount + 2 * (sideCount - 2)
    const leftBorder = (topCount % 2 == 0 ? 1.5 : 2)
    const topBorder = (sideCount % 2 == 0 ? 1.5 : 2)
    let top, left
    if(index >= 1 && index <= topCount) { // top row
      const offset = index
      left = `${((offset - 1) / topCount) * 100}%`
      top = '0%'
    } else if(index > topCount && index <= topCount + sideCount - 2) { // left side
      const offset = index - topCount
      left = '0%'
      top = `${(offset / sideCount) * 100}%`
    } else if(index > topCount + sideCount - 2 && index <= topCount + 2 * (sideCount - 2)) { // right side
      const offset = index - (topCount + sideCount - 2)
      left = `${((topCount - 1) / topCount) * 100}%`
      top = `${(offset / sideCount) * 100}%`
    } else if(index > topCount + 2 * (sideCount - 2) && index <= allSideCount) { // bottom row
      const offset = index - (topCount + 2 * (sideCount - 2))
      left = `${((offset - 1) / topCount) * 100}%`
      top = `${((sideCount - 1) / sideCount) * 100}%`
    } else {
      let offset = index - allSideCount
      let rowOffset = topBorder
      if(offset >= 1 && offset <= Math.ceil((topCount - 2 * leftBorder - 2) / 2)) {
        left = `${((1 + leftBorder + 2 * (offset - 1)) / topCount) * 100}%`
      } else if(
        offset > Math.ceil((topCount - 2 * leftBorder - 2) / 2)
        && offset <= topCount - 2 * leftBorder - 1
      ) {
        offset -= Math.ceil((topCount - 2 * leftBorder - 2) / 2)
        if(offset / Math.ceil((topCount - 2 * leftBorder) / 2) > .5) {
          offset++
        }
        left = `${((leftBorder + 2 * (offset - 1)) / topCount) * 100}%`
        rowOffset++
      } else {
        offset -= topCount - leftBorder * 2 - 1
        left = `${((1 + leftBorder + 2 * (offset - 1)) / topCount) * 100}%`
        rowOffset += 2
      }
      top = `${(rowOffset * 1 / sideCount) * 100}%`
    }
    setStyleProperty(info.element, 'top', top)
    setStyleProperty(info.element, 'left', left)
    setStyleProperty(info.element, 'width', `${1 / topCount * 100}%`)

    if(nodeIsInDocument(info.element)) {
      info.element.parentNode.removeChild(info.element)
    }
    holder.appendChild(info.element)
    events.push(slideshow.addEvent(
      info,
      slide.startTime + startDelay + picDelay * (i + 1),
      slide.endTime,
    ))
  }
  return events
}
