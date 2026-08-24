(function () {
  function parseCount(value) {
    if (value == null) return '';
    const digits = String(value).replace(/[^\d]/g, '');
    if (!digits) return String(value).trim();
    return parseInt(digits, 10).toLocaleString();
  }

  function parseJsonObjectFrom(text, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }

    return null;
  }

  function parseRatingDataFromScripts() {
    const scripts = document.querySelectorAll('script:not([src])');

    for (let i = 0; i < scripts.length; i += 1) {
      const text = scripts[i].textContent;
      const marker = text.match(/(?:const|let|var)\s+ratingData\s*=\s*/);
      if (!marker) continue;

      const start = text.indexOf('{', marker.index + marker[0].length);
      if (start === -1) continue;

      const jsonText = parseJsonObjectFrom(text, start);
      if (!jsonText) continue;

      try {
        const data = JSON.parse(jsonText);
        const rating = data.rating != null ? String(data.rating).trim() : '';
        const count = data.total_reviews != null ? parseCount(data.total_reviews) : '';
        if (rating || count) {
          return { rating: rating, count: count };
        }
      } catch (error) {
        /* ignore malformed inline JSON */
      }
    }

    return null;
  }

  function computeRatingFromStars(starContainer) {
    if (!starContainer) return '';

    const items = starContainer.querySelectorAll('.star-item');
    if (!items.length) return '';

    let rating = 0;
    items.forEach(function (star) {
      if (star.classList.contains('half-star')) {
        const width = star.querySelector('.item-star')?.style.width || '';
        const percent = parseFloat(width) || 50;
        rating += percent / 100;
        return;
      }

      const fill = star.querySelector('.item-star');
      if (fill && fill.style.width && fill.style.width !== '0%' && fill.style.width !== '0px') {
        rating += parseFloat(fill.style.width) / 100 || 1;
        return;
      }

      if (!star.querySelector('.item-nostar, .nostar')) {
        rating += 1;
      }
    });

    return rating ? String(Math.round(rating * 10) / 10) : '';
  }

  function extractRating(value) {
    if (!value) return '';
    const match = String(value).match(/\d+[.,]\d+|\d+/);
    return match ? match[0].replace(',', '.') : '';
  }

  function scrapeFromRoot(root) {
    if (!root) return null;

    const ratingEl =
      root.querySelector('.big-point') ||
      root.querySelector('.tt-rating-text') ||
      root.querySelector('.point');

    let rating = extractRating(ratingEl?.textContent);

    if (!rating) {
      rating = computeRatingFromStars(root.querySelector('.vstar-star, .product-icon-list'));
    }

    const countEl =
      root.querySelector('.product-reviews-num') ||
      root.querySelector('.reviews-num') ||
      root.querySelector('[class*="reviews-num"]');

    const count = parseCount(countEl?.textContent);

    if (!rating && !count) return null;

    return { rating: rating, count: count };
  }

  function scrapeOriginalTrustooData() {
    return (
      parseRatingDataFromScripts() ||
      scrapeFromRoot(document.querySelector('#seal-star-rating-widget')) ||
      scrapeFromRoot(document.querySelector('.custom-vstar-rating-widget')) ||
      scrapeFromRoot(document.querySelector('.tt-head-left'))
    );
  }

  function hasOriginalPlaceholders(textEl) {
    if (!textEl) return false;
    const text = textEl.textContent || '';
    return /\[original\.rating\]/i.test(text) || /\[original\.count\]/i.test(text);
  }

  function isBlockReady(blockEl, data, textEl) {
    if (!data) return false;

    if (blockEl.dataset.starsSource === 'original') {
      if (!data.rating) return false;
      if (textEl && hasOriginalPlaceholders(textEl)) return false;
      return true;
    }

    if (!textEl) return false;

    return !hasOriginalPlaceholders(textEl);
  }

  function applyOriginalRating(blockEl, data) {
    if (!blockEl || !data) return false;

    const textEl = blockEl.querySelector('[data-rating-stars-text]');
    let updated = false;

    if (data.rating && blockEl.dataset.starsSource === 'original') {
      blockEl.style.setProperty('--rating', data.rating);
      updated = true;
    }

    if (textEl && hasOriginalPlaceholders(textEl)) {
      let html = textEl.innerHTML;
      const before = html;

      if (data.rating) {
        html = html.replace(/\[original\.rating\]/gi, data.rating);
      }
      if (data.count) {
        html = html.replace(/\[original\.count\]/gi, data.count);
      } else {
        html = html.replace(/\[original\.count\]/gi, '');
      }

      if (html !== before) {
        textEl.innerHTML = html;
        updated = true;
      }
    } else if (data.rating && blockEl.dataset.starsSource === 'original') {
      updated = true;
    }

    if (updated && isBlockReady(blockEl, data, textEl)) {
      blockEl.classList.add('rating-stars--loaded');
      return true;
    }

    return false;
  }

  function replaceOriginalPlaceholders() {
    const data = scrapeOriginalTrustooData();
    if (!data) return false;

    let applied = false;

    document.querySelectorAll('[data-rating-stars-block]').forEach(function (blockEl) {
      const source = blockEl.dataset.starsSource;
      const textEl = blockEl.querySelector('[data-rating-stars-text]');
      const needsOriginal = source === 'original' || hasOriginalPlaceholders(textEl);

      if (needsOriginal && applyOriginalRating(blockEl, data)) {
        applied = true;
      }
    });

    return applied;
  }

  function init() {
    let attempts = 0;
    const maxAttempts = 100;

    const timer = window.setInterval(function () {
      attempts += 1;
      const applied = replaceOriginalPlaceholders();
      if (applied || attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 200);

    const observer = new MutationObserver(function () {
      replaceOriginalPlaceholders();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setTimeout(function () {
      observer.disconnect();
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
