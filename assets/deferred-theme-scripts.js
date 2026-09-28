// Load non-critical theme scripts after window load to reduce head bandwidth contention
(function () {
  'use strict';

  var loaded = false;

  function injectScript(src) {
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadDeferredThemeScripts() {
    if (loaded) return;
    loaded = true;

    var sources = window.__deferredThemeScriptSources || [];
    sources.forEach(injectScript);
  }

  if (document.readyState === 'complete') {
    loadDeferredThemeScripts();
  } else {
    window.addEventListener('load', loadDeferredThemeScripts, { once: true });
  }
})();
