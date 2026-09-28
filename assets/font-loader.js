// Lazy load Material Symbols for below-fold icon usage only (fixed axes, single family)
(function () {
  'use strict';

  var FONT_URL =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0,0&display=swap';

  function isFontLoaded() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href && links[i].href.indexOf('Material+Symbols+Outlined') !== -1) {
        return true;
      }
    }
    return false;
  }

  function loadFonts() {
    if (isFontLoaded()) return;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    link.media = 'print';
    link.crossOrigin = 'anonymous';
    link.onload = function () {
      this.media = 'all';
      this.onload = null;
      document.documentElement.classList.add('material-fonts-loaded');
    };
    document.head.appendChild(link);
  }

  function scheduleLoad() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadFonts, { timeout: 8000 });
    } else {
      setTimeout(loadFonts, 5000);
    }
  }

  if (document.readyState === 'complete') {
    scheduleLoad();
  } else {
    window.addEventListener('load', scheduleLoad, { once: true });
  }
})();
