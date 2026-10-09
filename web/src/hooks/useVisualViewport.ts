import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  viewport.addEventListener('resize', callback)
  viewport.addEventListener('scroll', callback)
  return () => {
    viewport.removeEventListener('resize', callback)
    viewport.removeEventListener('scroll', callback)
  }
}

// One string, so the snapshot is stable between changes.
const snapshot = () => {
  const viewport = window.visualViewport
  return viewport ? `${Math.round(viewport.height)}:${Math.round(viewport.offsetTop)}` : ''
}

/**
 * The part of the window that is actually visible. On a phone it shrinks when the on-screen
 * keyboard opens, which a fixed panel sized in viewport units does not notice on its own.
 * Null where the browser does not report it.
 */
export function useVisualViewport(): { height: number; offsetTop: number } | null {
  const value = useSyncExternalStore(subscribe, snapshot, () => '')
  if (!value) return null
  const [height, offsetTop] = value.split(':')
  return { height: parseInt(height!, 10), offsetTop: parseInt(offsetTop!, 10) }
}
