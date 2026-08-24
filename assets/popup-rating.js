(function () {
  const STAR_PATH =
    'M8.89062 0.565613L11.4299 6.07066L17.4501 6.78446L12.9992 10.9006L14.1807 16.8468L8.89062 13.8856L3.60056 16.8468L4.78206 10.9006L0.331117 6.78446L6.35139 6.07066L8.89062 0.565613Z';

  const CHEVRON_SVG =
    '<svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M1 1L5 5L9 1" stroke="CURRENT_COLOR" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';

  function parseSelector(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('#') || trimmed.startsWith('.')) return trimmed;
    return '.' + trimmed;
  }

  function resolveTriggerElements(selectorValue, scope) {
    const selector = parseSelector(selectorValue);
    if (!selector) return [];

    const root = scope || document;
    const nodes = Array.from(root.querySelectorAll(selector));
    if (nodes.length) return nodes;

    if (!selector.startsWith('#') && !selector.startsWith('.')) {
      const byId = root.getElementById(selector);
      if (byId) return [byId];
    }

    return [];
  }

  function resolveTriggerByAttachment(configEl) {
    const attachmentType = configEl.dataset.attachmentType || 'custom_rating_block';
    const section = configEl.closest('.shopify-section') || document;

    if (attachmentType === 'trustwill_app') {
      return document.querySelector('#seal-star-rating-widget') || document.querySelector('.custom-vstar-rating-widget');
    }

    if (attachmentType === 'custom_rating_block') {
      return section.querySelector('[data-rating-stars-block]');
    }

    if (attachmentType === 'custom_selector') {
      const triggers = resolveTriggerElements(configEl.dataset.triggerSelector, section);
      return triggers.length ? triggers[0] : null;
    }

    return null;
  }

  function parseCount(value) {
    if (value == null) return 0;
    const digits = String(value).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function formatCount(count) {
    if (!count && count !== 0) return '';
    return count.toLocaleString();
  }

  function replaceReviewCount(template, count) {
    if (!template) return '';
    const formatted = formatCount(count);
    return template
      .replace(/\[reviews\.count\]/gi, formatted)
      .replace(/\[rating\.count\]/gi, formatted);
  }

  function scrapeTrustooData() {
    const headLeft = document.querySelector('.tt-head-left');
    if (!headLeft) return null;

    const ratingText = headLeft.querySelector('.big-point')?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : NaN;

    const breakdown = [];
    headLeft.querySelectorAll('.head-center .star-raw').forEach(function (row) {
      const stars = parseInt(row.querySelector('.star-classify .number')?.textContent?.trim() || '0', 10);
      const count = parseCount(row.querySelector('.star-num')?.textContent);
      if (stars >= 1 && stars <= 5) {
        breakdown.push({ stars: stars, count: count });
      }
    });

    breakdown.sort(function (a, b) {
      return b.stars - a.stars;
    });

    let totalCount = breakdown.reduce(function (sum, item) {
      return sum + item.count;
    }, 0);

    if (!totalCount) {
      totalCount = parseCount(headLeft.querySelector('.reviews-num')?.textContent);
    }

    if (Number.isNaN(rating) && !breakdown.length && !totalCount) {
      return null;
    }

    return {
      rating: Number.isNaN(rating) ? null : rating,
      totalCount: totalCount,
      breakdown: breakdown,
    };
  }

  function buildFallbackData(fallbackRating, fallbackCount) {
    const rating = parseFloat(String(fallbackRating || '').replace(',', '.'));
    const totalCount = parseCount(fallbackCount);

    if (Number.isNaN(rating) && !totalCount) return null;

    return {
      rating: Number.isNaN(rating) ? null : rating,
      totalCount: totalCount,
      breakdown: [],
    };
  }

  function getReviewData(configEl) {
    return scrapeTrustooData() || buildFallbackData(configEl.dataset.fallbackRating, configEl.dataset.fallbackCount);
  }

  function starSvg(color) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 17" fill="none" aria-hidden="true">' +
      '<path fill="' +
      color +
      '" d="' +
      STAR_PATH +
      '"></path></svg>'
    );
  }

  function renderStars(container, rating, accentColor) {
    if (!container) return;

    const numericRating = parseFloat(rating);
    if (Number.isNaN(numericRating)) {
      container.innerHTML = '';
      return;
    }

    const emptyColor = '#e0e0e0';
    const fullStars = Math.floor(numericRating);
    const decimal = numericRating - fullStars;
    let html = '';

    for (let i = 0; i < 5; i += 1) {
      if (i < fullStars) {
        html += '<span class="popup-rating-dropdown__star">' + starSvg(accentColor) + '</span>';
      } else if (i === fullStars && decimal > 0) {
        const width = Math.round(Math.min(decimal, 1) * 100);
        html +=
          '<span class="popup-rating-dropdown__star popup-rating-dropdown__star--half">' +
          '<span class="popup-rating-dropdown__star-empty">' +
          starSvg(emptyColor) +
          '</span>' +
          '<span class="popup-rating-dropdown__star-fill" style="width:' +
          width +
          '%">' +
          starSvg(accentColor) +
          '</span></span>';
      } else {
        html += '<span class="popup-rating-dropdown__star">' + starSvg(emptyColor) + '</span>';
      }
    }

    container.innerHTML = html;
  }

  function renderBreakdown(container, breakdown, accentColor, barBg) {
    if (!container) return;

    if (!breakdown.length) {
      container.innerHTML = '';
      return;
    }

    const maxCount = breakdown.reduce(function (max, item) {
      return Math.max(max, item.count);
    }, 0);

    container.innerHTML = breakdown
      .map(function (item) {
        const percent = maxCount ? (item.count / maxCount) * 100 : 0;
        const label = item.stars + ' ★';
        return (
          '<div class="popup-rating-dropdown__bar-row">' +
          '<span class="popup-rating-dropdown__bar-label">' +
          label +
          '</span>' +
          '<span class="popup-rating-dropdown__bar-track" style="background:' +
          barBg +
          '">' +
          '<span class="popup-rating-dropdown__bar-fill" style="width:' +
          percent +
          '%;background:' +
          accentColor +
          '"></span>' +
          '</span>' +
          '<span class="popup-rating-dropdown__bar-count">(' +
          formatCount(item.count) +
          ')</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function waitForTrustooData(configEl, maxAttempts, intervalMs) {
    return new Promise(function (resolve) {
      let attempts = 0;

      function check() {
        attempts += 1;
        const data = getReviewData(configEl);
        if (data && (data.rating != null || data.totalCount || data.breakdown.length)) {
          resolve(data);
          return;
        }
        if (attempts >= maxAttempts) {
          resolve(data);
          return;
        }
        window.setTimeout(check, intervalMs);
      }

      check();
    });
  }

  function disableAnchorNavigation(trigger) {
    const anchors = [];

    if (trigger.matches('a[href]')) {
      anchors.push(trigger);
    }

    trigger.querySelectorAll('a[href]').forEach(function (anchor) {
      anchors.push(anchor);
    });

    anchors.forEach(function (anchor) {
      if (!anchor.dataset.popupRatingOriginalHref) {
        anchor.dataset.popupRatingOriginalHref = anchor.getAttribute('href') || '';
      }
      anchor.setAttribute('href', '#');
      anchor.setAttribute('role', 'button');
      anchor.addEventListener(
        'click',
        function (event) {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true
      );
    });
  }

  function injectChevron(trigger, chevronColor) {
    if (trigger.querySelector('.popup-rating-chevron')) return;

    const textRow =
      trigger.querySelector('.rating-stars-and-text') ||
      trigger.querySelector('.rating-stars__text') ||
      trigger;

    const chevron = document.createElement('span');
    chevron.className = 'popup-rating-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = CHEVRON_SVG.replace('CURRENT_COLOR', chevronColor || '#343F20');
    textRow.appendChild(chevron);
  }

  function shouldInjectChevron(configEl) {
    const attachmentType = configEl.dataset.attachmentType || 'custom_rating_block';
    return attachmentType !== 'custom_rating_block';
  }

  function bindTrigger(controller, trigger) {
    if (!trigger || trigger.dataset.popupRatingBound === 'true') return false;

    const chevronColor = controller.configEl.dataset.chevronColor || '#343F20';

    disableAnchorNavigation(trigger);
    if (shouldInjectChevron(controller.configEl)) {
      injectChevron(trigger, chevronColor);
    }

    controller.trigger = trigger;
    controller.wrapper = wrapTrigger(trigger, controller.dropdown);

    trigger.dataset.popupRatingBound = 'true';
    trigger.classList.add('popup-rating-trigger--clickable');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', controller.dropdown.id);

    const toggle = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (controller.isOpen) {
        controller.close();
      } else {
        controller.open(event);
      }
    };

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(event);
      }
    });

    return true;
  }

  function waitForTrigger(configEl, callback, maxAttempts, intervalMs) {
    let attempts = 0;

    function check() {
      attempts += 1;
      const trigger = resolveTriggerByAttachment(configEl);
      if (trigger) {
        callback(trigger);
        return;
      }
      if (attempts >= maxAttempts) return;
      window.setTimeout(check, intervalMs);
    }

    check();
  }

  function wrapTrigger(trigger, dropdown) {
    if (trigger.closest('.popup-rating-wrapper')) return trigger.closest('.popup-rating-wrapper');

    const wrapper = document.createElement('div');
    wrapper.className = 'popup-rating-wrapper';
    trigger.parentNode.insertBefore(wrapper, trigger);
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function PopupRatingController(configEl) {
    this.configEl = configEl;
    this.dropdown = document.getElementById(configEl.id + '-dropdown');
    this.wrapper = null;
    this.trigger = null;
    this.swiper = null;
    this.isOpen = false;
    this.suppressOutsideClick = false;
    this.boundKeydown = this.onKeydown.bind(this);
    this.boundDocumentClick = this.onDocumentClick.bind(this);

    if (!this.dropdown) return;

    this.scoreEl = this.dropdown.querySelector('[data-popup-rating-score]');
    this.starsEl = this.dropdown.querySelector('[data-popup-rating-stars]');
    this.totalEl = this.dropdown.querySelector('[data-popup-rating-total]');
    this.breakdownEl = this.dropdown.querySelector('[data-popup-rating-breakdown]');
    this.viewAllEl = this.dropdown.querySelector('[data-popup-rating-view-all]');
    this.sliderEl = this.dropdown.querySelector('[data-popup-rating-slider]');

    this.initTriggers();
    this.initCloseHandlers();
    this.initSlider();
  }

  PopupRatingController.prototype.initTriggers = function () {
    const controller = this;

    waitForTrigger(
      this.configEl,
      function (trigger) {
        bindTrigger(controller, trigger);
      },
      40,
      150
    );
  };

  PopupRatingController.prototype.initCloseHandlers = function () {
    this.dropdown.querySelectorAll('[data-popup-rating-close]').forEach(
      function (button) {
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }.bind(this));
      }.bind(this)
    );
  };

  PopupRatingController.prototype.initSlider = function () {
    const slides = this.sliderEl ? this.sliderEl.querySelectorAll('.swiper-slide') : [];
    const nav = this.dropdown.querySelector('.popup-rating-dropdown__nav');
    const reviewsSection = this.dropdown.querySelector('.popup-rating-dropdown__reviews');

    if (!this.sliderEl || !slides.length) {
      if (reviewsSection) reviewsSection.hidden = true;
      return;
    }

    if (reviewsSection) reviewsSection.hidden = false;
    if (nav) nav.hidden = slides.length <= 1;

    if (slides.length <= 1) return;

    const init = function () {
      if (typeof Swiper === 'undefined') {
        window.setTimeout(init, 100);
        return;
      }

      if (this.swiper && this.swiper.destroy) {
        this.swiper.destroy(true, true);
      }

      this.swiper = new Swiper(this.sliderEl, {
        slidesPerView: 1,
        spaceBetween: 0,
        loop: slides.length > 1,
        watchOverflow: true,
        navigation: {
          nextEl: this.dropdown.querySelector('.swiper-button-next'),
          prevEl: this.dropdown.querySelector('.swiper-button-prev'),
        },
        pagination: {
          el: this.dropdown.querySelector('.swiper-pagination'),
          clickable: true,
        },
      });
    }.bind(this);

    init();
  };

  PopupRatingController.prototype.populate = function (data) {
    const accentColor = this.configEl.dataset.accentColor || '#cc667c';
    const barBg = this.configEl.dataset.barBg || '#e6e6e6';
    const showTotal = this.configEl.dataset.showTotalReviews === 'true';
    const totalTemplate = this.configEl.dataset.totalReviewsTemplate || '';

    if (this.scoreEl) {
      this.scoreEl.textContent = data && data.rating != null ? String(data.rating) : '—';
    }

    renderStars(this.starsEl, data ? data.rating : null, accentColor);
    renderBreakdown(this.breakdownEl, data ? data.breakdown : [], accentColor, barBg);

    if (this.totalEl) {
      if (showTotal && data && data.totalCount) {
        const formatted = formatCount(data.totalCount);
        let text = replaceReviewCount(totalTemplate, data.totalCount);
        if (formatted && text.indexOf(formatted) !== -1) {
          text = text.replace(formatted, '<strong>' + formatted + '</strong>');
        }
        this.totalEl.innerHTML = text;
        this.totalEl.hidden = false;
      } else {
        this.totalEl.hidden = true;
        this.totalEl.textContent = '';
      }
    }

    if (this.viewAllEl) {
      const link = this.configEl.dataset.viewAllLink;
      if (link) this.viewAllEl.setAttribute('href', link);
    }
  };

  PopupRatingController.prototype.open = function () {
    if (this.isOpen) return;

    this.isOpen = true;
    this.dropdown.hidden = false;
    this.dropdown.setAttribute('aria-hidden', 'false');

    if (this.wrapper) this.wrapper.classList.add('is-open');
    if (this.trigger) this.trigger.setAttribute('aria-expanded', 'true');

    document.addEventListener('keydown', this.boundKeydown);
    this.suppressOutsideClick = true;
    window.requestAnimationFrame(
      function () {
        this.suppressOutsideClick = false;
        document.addEventListener('click', this.boundDocumentClick);
      }.bind(this)
    );

    waitForTrustooData(this.configEl, 40, 150).then(
      function (data) {
        this.populate(data);
        if (this.swiper) {
          this.swiper.update();
          if (this.swiper.slideToLoop) {
            this.swiper.slideToLoop(0);
          } else {
            this.swiper.slideTo(0);
          }
        }
      }.bind(this)
    );
  };

  PopupRatingController.prototype.close = function () {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.dropdown.hidden = true;
    this.dropdown.setAttribute('aria-hidden', 'true');

    if (this.wrapper) this.wrapper.classList.remove('is-open');
    if (this.trigger) this.trigger.setAttribute('aria-expanded', 'false');

    document.removeEventListener('keydown', this.boundKeydown);
    document.removeEventListener('click', this.boundDocumentClick);
  };

  PopupRatingController.prototype.onDocumentClick = function (event) {
    if (this.suppressOutsideClick) return;
    if (!this.wrapper) return;
    if (this.wrapper.contains(event.target)) return;
    this.close();
  };

  PopupRatingController.prototype.onKeydown = function (event) {
    if (event.key === 'Escape') {
      this.close();
    }
  };

  function init() {
    document.querySelectorAll('[data-popup-rating]').forEach(function (configEl) {
      new PopupRatingController(configEl);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
