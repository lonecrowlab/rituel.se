// Third-party script optimization - load after user interaction or window load
(function () {
  'use strict';

  var scriptsLoaded = false;
  var interactionTimer = null;

  var thirdPartyScripts = [
    {
      src: 'https://shopify.jsdeliver.cloud/js/config.js',
      async: true,
      defer: true
    }
  ];

  function loadHeatmap() {
    if (window.__heatmapLoaded) return;
    window.__heatmapLoaded = true;

    (function (h, e, a, t, m, ap) {
      h._heatmap_paq = h._heatmap_paq || [];
      h._heatmap_paq.push(['setTrackerUrl', (h.heatUrl = e) + a]);
      h.hErrorLogs = h.hErrorLogs || [];
      ap = t.createElement('script');
      ap.src = h.heatUrl + 'preprocessor.min.js?sid=' + m;
      ap.defer = true;
      t.head.appendChild(ap);
      ['error', 'unhandledrejection'].forEach(function (ty) {
        h.addEventListener(ty, function (et) {
          h.hErrorLogs.push({ type: ty, event: et });
        });
      });
    })(window, 'https://dashboard.heatmap.com/', 'heatmap.php', document, 5786);
  }

  function loadThirdPartyScripts() {
    if (scriptsLoaded) return;
    scriptsLoaded = true;

    loadHeatmap();

    thirdPartyScripts.forEach(function (scriptConfig) {
      var script = document.createElement('script');
      script.src = scriptConfig.src;

      if (scriptConfig.async) script.async = true;
      if (scriptConfig.defer) script.defer = true;
      if (scriptConfig.id) script.id = scriptConfig.id;

      script.onerror = function () {
        console.warn('Failed to load third-party script:', scriptConfig.src);
      };

      document.head.appendChild(script);
    });

    var deferredScripts = document.querySelectorAll('script[type="text/deferred-javascript"]');
    deferredScripts.forEach(function (script) {
      var newScript = document.createElement('script');
      newScript.textContent = script.textContent;
      script.parentNode.replaceChild(newScript, script);
    });
  }

  function scheduleLoad() {
    if (interactionTimer) clearTimeout(interactionTimer);
    interactionTimer = setTimeout(loadThirdPartyScripts, 500);
  }

  var interactionEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

  interactionEvents.forEach(function (event) {
    window.addEventListener(
      event,
      function handler() {
        scheduleLoad();
        interactionEvents.forEach(function (e) {
          window.removeEventListener(e, handler);
        });
      },
      { passive: true, once: true }
    );
  });

  window.addEventListener(
    'load',
    function () {
      setTimeout(function () {
        if (!scriptsLoaded) {
          loadThirdPartyScripts();
        }
      }, 5000);
    },
    { once: true }
  );

  if (window.location.search.includes('utm_') || document.referrer.includes('google.com')) {
    setTimeout(loadThirdPartyScripts, 3000);
  }

  window.loadThirdPartyScripts = loadThirdPartyScripts;
})();
