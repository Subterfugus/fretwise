// Parser-blocking head script: restore the theme before stylesheets can paint.
;(function () {
  var theme = 'dark'
  try {
    var cached = localStorage.getItem('fretwise-theme')
    if (['dark', 'light', 'high-contrast', 'stage', 'sunburst', 'maple', 'surf-green'].indexOf(cached) !== -1) theme = cached
  } catch (_) {}
  document.documentElement.setAttribute('data-theme', theme)
})()
