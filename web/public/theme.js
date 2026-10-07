// Loaded as a blocking script in <head> so the saved theme is applied before first paint.
// Keep the storage key and colors in sync with src/lib/theme.ts.
;(function () {
  var stored = null
  try {
    stored = localStorage.getItem('finance-copilot:theme')
  } catch (error) {
    // Storage can be blocked; fall back to the system preference.
  }
  var dark =
    stored === 'dark' ||
    (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#1a1917' : '#f4f2ed')
})()
