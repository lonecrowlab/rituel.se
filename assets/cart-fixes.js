/**
 * cart-fixes.js
 *
 * Plain, framework-free JavaScript fixes for flaky cart behaviours:
 *
 * 1) Quantity `+` / `-` buttons and the `.quantity__input` field inside the
 *    cart drawer and the /cart page sometimes did nothing. Root causes:
 *      - main.js's QuantityInput click handler reads `event.target.name`,
 *        but clicking the icon inside the button makes `event.target` the
 *        <svg>, not the <button>, so `name` is undefined and the wrong
 *        step direction (or none) gets applied.
 *      - The AJAX update path in main.js could throw (see cart-drawer
 *        trapFocus bug below), leaving the UI stuck.
 *    This file takes over quantity handling completely (capturing the
 *    click/change before main.js's handlers run) with a small, predictable
 *    implementation that talks directly to the Ajax Cart API.
 *
 * 2) Cart-drawer upsell toggle switches only worked when the upsell block's
 *    own inline <script> happened to execute. That script is only run when
 *    the HTML is parsed by the browser normally; when the drawer content is
 *    replaced via `element.innerHTML = ...` (e.g. after adding a product),
 *    injected <script> tags never execute, so the toggle's change handler
 *    never got attached and flipping the switch silently did nothing.
 *    This file registers a single, page-wide delegated handler for
 *    `.upsell-toggle-input` on load (always executes, regardless of what's
 *    in the DOM yet), so the toggle always works. It sets the same
 *    `document.body.dataset.cartUpsellHandlerBound` flag that
 *    snippets/upsell-block.liquid checks, so there is never a double
 *    handler / double add-to-cart call.
 *
 * 3) When "Enable silent add to cart" is switched off, upsell-block.liquid
 *    renders a plain `.upsell-add-btn` button instead of the toggle switch.
 *    Its click handler lives inside the SAME `if (!cartUpsellHandlerBound)`
 *    block as the toggle handler in point 2 above. Because this file sets
 *    that flag up-front (to guarantee the toggle always works), the inline
 *    script's block - and with it the add-button's click handler - never
 *    runs, so clicking "Add" silently did nothing. This file also owns
 *    `.upsell-add-btn` clicks below so the button works regardless of
 *    whether the surrounding HTML was parsed normally or injected later.
 *
 * 4) Removing a line item went through main.js CartRemoveButton →
 *    CartDrawerItems.updateQuantity, which:
 *      - POSTs to routes.cart_change_url (`/no/cart/change` without `.js`),
 *        which 404s on this store's locale/markets setup
 *      - Requests section ID `cart-drawer` instead of the live section-group
 *        ID, so Shopify returns the empty "To customize the cart, add blocks"
 *        fallback. Replacing `.drawer__inner` with that HTML removes
 *        `#CartDrawer-CartItems`, then disableLoading crashes on
 *        `null.classList`
 *    This file intercepts remove clicks, uses `/cart/change.js`, refreshes
 *    with the live section ID, and patches main.js so leftover callers
 *    cannot empty the drawer or throw.
 *
 * Note: the "Cannot access 'trapFocusHandlers' before initialization" error
 * seen when opening the cart drawer was caused by main.js being included
 * twice in layout/theme.liquid. That duplicate include has been removed;
 * this file does not need to patch trapFocus directly.
 */
(function () {
  'use strict';

  /* -----------------------------------------------------------------------
   * Shared helpers
   * ---------------------------------------------------------------------*/

  function parseHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var message =
            (data && (data.description || data.message)) ||
            'Request failed (' + response.status + ')';
          var error = new Error(message);
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  // Cart drawer lives in cart-drawer-group.json (section group), so it has a
  // dynamic section ID like "sections--1234__cart-drawer". Requesting the
  // literal "cart-drawer" hits a stale settings_data copy (or an empty
  // fallback) and switches language / wipes blocks. Always use the live ID.
  function getCartDrawerSectionId() {
    var drawer = document.querySelector('cart-drawer[data-section-id]');
    if (drawer && drawer.getAttribute('data-section-id')) {
      return drawer.getAttribute('data-section-id');
    }
    var nested = document.querySelector('cart-drawer');
    var wrapper = nested && nested.closest('[id^="shopify-section-"]');
    if (wrapper && wrapper.id) {
      return wrapper.id.replace(/^shopify-section-/, '');
    }
    return 'cart-drawer';
  }

  function getLocaleRoot() {
    if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
      return window.Shopify.routes.root;
    }
    return '/';
  }

  function getCartApiUrl(endpoint) {
    var root = getLocaleRoot();
    if (root.charAt(root.length - 1) !== '/') root += '/';
    return root + String(endpoint).replace(/^\//, '');
  }

  function getCartSectionsParam() {
    return getCartDrawerSectionId() + ',cart-icon-bubble';
  }

  function getCartSectionsUrl() {
    return getLocaleRoot() + '?sections=' + getCartSectionsParam() + '&t=' + Date.now();
  }

  function isPlaceholderDrawerHtml(html) {
    return (
      typeof html === 'string' &&
      html.indexOf('To customize the cart, add blocks') !== -1
    );
  }

  window.CartDrawerSections = {
    getDrawerSectionId: getCartDrawerSectionId,
    getSectionsParam: getCartSectionsParam,
    getSectionsUrl: getCartSectionsUrl,
    pickDrawerHtml: function (sections) {
      if (!sections) return null;
      var live = sections[getCartDrawerSectionId()];
      var fallback = sections['cart-drawer'];
      if (live && !isPlaceholderDrawerHtml(live)) return live;
      if (fallback && !isPlaceholderDrawerHtml(fallback)) return fallback;
      return live || fallback || null;
    }
  };

  // Replaces the innerHTML of the live <cart-drawer> element with the
  // innerHTML of the freshly-fetched cart-drawer section, without nesting
  // <cart-drawer> inside <cart-drawer>.
  function updateCartDrawerHTML(sectionHTML) {
    if (!sectionHTML || isPlaceholderDrawerHtml(sectionHTML)) return;
    var existing = document.querySelector('cart-drawer');
    if (!existing) return;

    var prevSectionId = existing.getAttribute('data-section-id');
    var doc = parseHTML(sectionHTML);
    var rendered = doc.querySelector('cart-drawer');

    if (rendered) {
      existing.innerHTML = rendered.innerHTML;
      existing.className = rendered.className;
      if (rendered.getAttribute('data-section-id')) {
        existing.setAttribute('data-section-id', rendered.getAttribute('data-section-id'));
      } else if (prevSectionId) {
        existing.setAttribute('data-section-id', prevSectionId);
      }
    } else {
      existing.innerHTML = sectionHTML;
      if (prevSectionId) existing.setAttribute('data-section-id', prevSectionId);
    }
  }

  // Replaces the innerHTML of an existing element (matched by id) with the
  // innerHTML of the same id found inside a freshly-fetched section HTML.
  function updateSectionById(id, sectionHTML) {
    if (!sectionHTML) return;
    var existing = document.getElementById(id);
    if (!existing) return;

    var doc = parseHTML(sectionHTML);
    var rendered = doc.getElementById(id);

    if (rendered) {
      existing.innerHTML = rendered.innerHTML;
      if (rendered.className) existing.className = rendered.className;
    } else {
      existing.innerHTML = sectionHTML;
    }
  }

  function updateCartIconBubble(sectionHTML) {
    if (!sectionHTML) return;
    var cartIconBubble = document.querySelector('#cart-icon-bubble');
    if (!cartIconBubble) return;

    var doc = parseHTML(sectionHTML);
    var newBubble = doc.querySelector('.cart-count-bubble');
    var existingBubble = cartIconBubble.querySelector('.cart-count-bubble');

    if (newBubble && existingBubble) {
      existingBubble.innerHTML = newBubble.innerHTML;
    } else if (newBubble && !existingBubble) {
      cartIconBubble.appendChild(newBubble.cloneNode(true));
    } else if (!newBubble && existingBubble) {
      existingBubble.remove();
    }
  }

  function afterDrawerRefresh() {
    document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    if (typeof window.initSubscriptionUpgrade === 'function') {
      try {
        window.initSubscriptionUpgrade();
      } catch (e) {}
    }
    if (typeof window.initVariantSwapper === 'function') {
      try {
        window.initVariantSwapper();
      } catch (e) {}
    }
  }

  function dispatchCartUpdated(cart) {
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart, bubbles: true }));
    document.dispatchEvent(new CustomEvent('cart:change', { detail: cart, bubbles: true }));
  }

  function refreshDrawerSections(keepOpen) {
    var drawerSectionId = getCartDrawerSectionId();
    return fetchJSON(getCartSectionsUrl()).then(function (sections) {
      var cartDrawer = document.querySelector('cart-drawer');
      var wasOpen = !!(cartDrawer && cartDrawer.classList.contains('active'));
      var html = window.CartDrawerSections.pickDrawerHtml(sections);

      updateCartDrawerHTML(html);
      updateCartIconBubble(sections['cart-icon-bubble']);
      afterDrawerRefresh();

      cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer && (keepOpen || wasOpen)) {
        cartDrawer.classList.add('active');
        var innerDrawer = cartDrawer.querySelector('.drawer');
        if (innerDrawer) innerDrawer.classList.add('active');
        document.body.classList.add('overflow-hidden');
      }
    });
  }

  function refreshCartPageSections() {
    return fetchJSON(
      getLocaleRoot() + '?sections=main-cart-items,main-cart-footer,cart-icon-bubble&t=' + Date.now()
    ).then(function (sections) {
      updateSectionById('main-cart-items', sections['main-cart-items']);
      updateSectionById('main-cart-footer', sections['main-cart-footer']);
      updateCartIconBubble(sections['cart-icon-bubble']);
    });
  }

  function refreshCartIconOnly() {
    return fetchJSON(getLocaleRoot() + '?sections=cart-icon-bubble&t=' + Date.now()).then(function (
      sections
    ) {
      updateCartIconBubble(sections['cart-icon-bubble']);
    });
  }

  // Refresh cart drawer HTML + icon without opening the drawer (unless already open).
  function refreshDrawerInBackground() {
    return refreshDrawerSections(false);
  }

  function changeCartLine(payload) {
    return fetchJSON(getCartApiUrl('cart/change.js'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload)
    });
  }

  /* -----------------------------------------------------------------------
   * 0) Stop main.js from 404ing / wiping the drawer
   * ---------------------------------------------------------------------*/

  function ensureCartJsUrl(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/\/cart\/(change|update|clear)(?!\.js)\/?(?=\?|$)/, '/cart/$1.js');
  }

  function rewriteSectionsList(sections) {
    var liveId = getCartDrawerSectionId();
    var wasArray = Array.isArray(sections);
    var list = wasArray ? sections.slice() : String(sections).split(',');
    var hasLiveId = false;
    var i;

    for (i = 0; i < list.length; i++) {
      list[i] = String(list[i]).trim();
      if (list[i] === liveId) hasLiveId = true;
    }

    if (liveId && liveId !== 'cart-drawer' && !hasLiveId) {
      for (i = 0; i < list.length; i++) {
        if (list[i] === 'cart-drawer') list[i] = liveId;
      }
    }

    return wasArray ? list : list.join(',');
  }

  function rewriteCartRequestBody(body) {
    if (!body) return body;

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      var sections = body.get('sections');
      if (sections) {
        body.set('sections', rewriteSectionsList(sections));
        body.set('sections_url', getLocaleRoot());
      }
      return body;
    }

    if (typeof body !== 'string') return body;

    try {
      var data = JSON.parse(body);
      if (!data || typeof data !== 'object') return body;
      if (data.sections) {
        data.sections = rewriteSectionsList(data.sections);
        data.sections_url = getLocaleRoot();
        return JSON.stringify(data);
      }
    } catch (e) {}

    return body;
  }

  function rewriteSectionsQuery(url) {
    if (typeof url !== 'string' || url.indexOf('sections=') === -1) return url;
    var liveId = getCartDrawerSectionId();
    if (!liveId || liveId === 'cart-drawer') return url;
    return url.replace(/(?:^|[?&,])sections=([^&]*)/, function (match, list) {
      var prefix = match.charAt(0) === 's' ? '' : match.charAt(0);
      return prefix + 'sections=' + rewriteSectionsList(decodeURIComponent(list));
    });
  }

  function aliasCartDrawerSection(data) {
    if (!data || typeof data !== 'object') return null;
    var liveId = getCartDrawerSectionId();
    var map = data.sections || data;
    if (!map || typeof map !== 'object') return null;

    var changed = false;
    if (liveId && map[liveId] && !isPlaceholderDrawerHtml(map[liveId])) {
      if (map['cart-drawer'] !== map[liveId]) {
        map['cart-drawer'] = map[liveId];
        changed = true;
      }
    } else if (map['cart-drawer'] && isPlaceholderDrawerHtml(map['cart-drawer'])) {
      delete map['cart-drawer'];
      changed = true;
    }

    return changed ? data : null;
  }

  function patchCartChangeUrl() {
    if (window.routes && window.routes.cart_change_url && window.routes.cart_change_url.indexOf('.js') === -1) {
      window.routes.cart_change_url = window.routes.cart_change_url.replace(/\/?$/, '') + '.js';
    }
    if (window.routes && window.routes.cart_update_url && window.routes.cart_update_url.indexOf('.js') === -1) {
      window.routes.cart_update_url = window.routes.cart_update_url.replace(/\/?$/, '') + '.js';
    }
  }

  function installFetchGuard() {
    if (window.__cartFixesFetchPatched) return;
    window.__cartFixesFetchPatched = true;

    var originalFetch = window.fetch;
    window.fetch = function (url, options) {
      var urlString = typeof url === 'string' ? url : url && url.url;
      var isCartRequest =
        typeof urlString === 'string' &&
        (/\/cart\/(change|add|update|clear)/.test(urlString) ||
          urlString.indexOf('sections=') !== -1 ||
          urlString.indexOf('section_id=') !== -1);

      if (!isCartRequest) {
        return originalFetch.apply(this, arguments);
      }

      var nextUrl = typeof url === 'string' ? ensureCartJsUrl(rewriteSectionsQuery(urlString)) : url;
      var nextOptions = options;

      if (options && options.body) {
        nextOptions = Object.assign({}, options, {
          body: rewriteCartRequestBody(options.body)
        });
      }

      return originalFetch.call(this, nextUrl, nextOptions).then(function (response) {
        var contentType = response.headers && response.headers.get('content-type');
        if (!contentType || contentType.indexOf('application/json') === -1) return response;

        return response
          .clone()
          .json()
          .then(function (data) {
            var aliased = aliasCartDrawerSection(data);
            if (!aliased) return response;
            return new Response(JSON.stringify(aliased), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          })
          .catch(function () {
            return response;
          });
      });
    };
  }

  function wrapPrototypeMethod(ctor, name, wrapper) {
    if (!ctor || !ctor.prototype || typeof ctor.prototype[name] !== 'function') return;
    var original = ctor.prototype[name];
    ctor.prototype[name] = function () {
      return wrapper.call(this, original, arguments);
    };
  }

  function patchMainJsCartClasses() {
    var CartItems = window.customElements.get('cart-items');
    var CartDrawerItems = window.customElements.get('cart-drawer-items');
    var CartDrawer = window.customElements.get('cart-drawer');

    wrapPrototypeMethod(CartItems, 'disableLoading', function (original, args) {
      try {
        return original.apply(this, args);
      } catch (e) {}
    });

    wrapPrototypeMethod(CartItems, 'enableLoading', function (original, args) {
      try {
        return original.apply(this, args);
      } catch (e) {}
    });

    wrapPrototypeMethod(CartItems, 'getSectionInnerHTML', function (original, args) {
      var html = args[0];
      var selector = args[1];
      if (!html || isPlaceholderDrawerHtml(html)) {
        var existing = selector && document.querySelector(selector);
        return existing ? existing.innerHTML : '';
      }
      try {
        return original.apply(this, args);
      } catch (e) {
        return '';
      }
    });

    wrapPrototypeMethod(CartDrawerItems, 'getSectionInnerHTML', function (original, args) {
      var html = args[0];
      var selector = args[1];
      if (!html || isPlaceholderDrawerHtml(html)) {
        var existing = selector && document.querySelector(selector);
        return existing ? existing.innerHTML : '';
      }
      try {
        return original.apply(this, args);
      } catch (e) {
        return '';
      }
    });

    if (CartDrawerItems && CartDrawerItems.prototype) {
      CartDrawerItems.prototype.getSectionsToRender = function () {
        return [
          {
            id: 'CartDrawer',
            section: getCartDrawerSectionId(),
            selector: '.drawer__inner'
          },
          {
            id: 'cart-icon-bubble',
            section: 'cart-icon-bubble',
            selector: '.shopify-section'
          }
        ];
      };
    }

    wrapPrototypeMethod(CartDrawer, 'getSectionInnerHTML', function (original, args) {
      var html = args[0];
      var selector = args[1];
      if (!html || isPlaceholderDrawerHtml(html)) {
        var existing = selector && document.querySelector(selector);
        return existing ? existing.innerHTML : '';
      }
      try {
        return original.apply(this, args);
      } catch (e) {
        return '';
      }
    });
  }

  patchCartChangeUrl();
  installFetchGuard();

  if (window.customElements) {
    Promise.all([
      customElements.whenDefined('cart-items'),
      customElements.whenDefined('cart-drawer-items'),
      customElements.whenDefined('cart-drawer')
    ])
      .then(patchMainJsCartClasses)
      .catch(function () {
        patchMainJsCartClasses();
      });
  }

  /* -----------------------------------------------------------------------
   * 1) Quantity +/- buttons and manual input
   * ---------------------------------------------------------------------*/

  function clampQuantity(input, value) {
    var min = input.min !== '' && input.min != null ? parseFloat(input.min) : 0;
    var maxAttr = input.getAttribute('max');
    var max = maxAttr !== null && maxAttr !== '' ? parseFloat(maxAttr) : Infinity;

    if (isNaN(value)) value = min;
    if (value < min) value = min;
    if (max !== Infinity && value > max) value = max;
    return value;
  }

  function getStep(input) {
    var step = parseFloat(input.getAttribute('step'));
    return isNaN(step) || step <= 0 ? 1 : step;
  }

  function findQuantityWrapper(el) {
    return el.closest('quantity-input') || el.closest('.quantity') || el.parentElement;
  }

  function findCartItemContainer(input) {
    return input.closest('.cart-item') || input.closest('[data-index]') || null;
  }

  function isDrawerElement(el) {
    return !!el.closest('cart-drawer, #CartDrawer');
  }

  function setItemLoading(container, isLoading) {
    if (!container) return;
    var overlay = container.querySelector('.loading-overlay');
    if (overlay) overlay.classList.toggle('hidden', !isLoading);
  }

  function setButtonsDisabled(wrapper, disabled) {
    if (!wrapper) return;
    var buttons = wrapper.querySelectorAll('.quantity__button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = disabled;
    }
  }

  function showQuantityError(index, isDrawer, message) {
    var id = (isDrawer ? 'CartDrawer-LineItemError-' : 'Line-item-error-') + index;
    var el = document.getElementById(id);
    if (!el) return;
    var textEl = el.querySelector('.cart-item__error-text');
    if (textEl) textEl.textContent = message || '';
  }

  function getLinePayload(el, quantity) {
    var container = findCartItemContainer(el);
    var lineKey =
      (el.getAttribute && el.getAttribute('data-line-key')) ||
      (container && container.getAttribute('data-line-key')) ||
      '';
    if (lineKey) return { id: lineKey, quantity: quantity };
    var index = parseInt((el.dataset && el.dataset.index) || (container && container.dataset.index), 10);
    return { line: index, quantity: quantity };
  }

  function commitQuantityChange(input, previousValue, allowZero) {
    var index = parseInt(input.dataset.index, 10);
    var quantity = allowZero ? parseFloat(input.value) : clampQuantity(input, parseFloat(input.value));
    if (allowZero && (isNaN(quantity) || quantity < 0)) quantity = 0;
    if (!index || isNaN(quantity)) return;

    input.value = allowZero && quantity === 0 ? previousValue : quantity;

    if (quantity === previousValue) return;

    var wrapper = findQuantityWrapper(input);
    var container = findCartItemContainer(input);
    var isDrawer = isDrawerElement(input);
    var payload = getLinePayload(input, quantity);

    if (!payload.id && !payload.line) return;

    showQuantityError(index, isDrawer, '');
    setItemLoading(container, true);
    setButtonsDisabled(wrapper, true);
    input.disabled = true;

    changeCartLine(payload)
      .then(function (cart) {
        return (isDrawer ? refreshDrawerSections(true) : refreshCartPageSections()).then(function () {
          return cart;
        });
      })
      .then(function (cart) {
        dispatchCartUpdated(cart);
      })
      .catch(function (error) {
        input.value = previousValue;
        showQuantityError(index, isDrawer, (error && error.message) || 'Unable to update quantity');
      })
      .finally(function () {
        setItemLoading(container, false);
        setButtonsDisabled(wrapper, false);
        input.disabled = false;
      });
  }

  // Capture phase: run before main.js's own click handlers so we fully
  // own the step + cart update, avoiding the `event.target.name` bug and
  // any double-increment from the native handler also firing.
  document.addEventListener(
    'click',
    function (event) {
      var button = event.target.closest('.quantity__button--plus, .quantity__button--minus');
      if (!button || button.disabled) return;

      var wrapper = findQuantityWrapper(button);
      var input = wrapper ? wrapper.querySelector('.quantity__input') : null;
      if (!input) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();

      var isPlus = button.classList.contains('quantity__button--plus');
      var step = getStep(input);
      var previousValue = parseFloat(input.value);
      if (isNaN(previousValue)) previousValue = 0;

      var rawNext = isPlus ? previousValue + step : previousValue - step;
      var min = input.min !== '' && input.min != null ? parseFloat(input.min) : 0;
      var allowZero = !isPlus && rawNext < min && previousValue > 0;
      var nextValue = allowZero ? 0 : clampQuantity(input, rawNext);

      if (nextValue === previousValue) return;

      input.value = nextValue;
      commitQuantityChange(input, previousValue, allowZero);
    },
    true
  );

  // Track the value a field had before the user started editing it, so we
  // can revert cleanly if the server rejects the change.
  document.addEventListener(
    'focusin',
    function (event) {
      var input = event.target;
      if (input.classList && input.classList.contains('quantity__input')) {
        input.dataset.__prevValue = input.value;
      }
    },
    true
  );

  // Capture phase: intercept manual typing / stepper native "change" so we
  // fully own the AJAX update instead of the (crash-prone) native handler.
  document.addEventListener(
    'change',
    function (event) {
      var input = event.target;
      if (!input.classList || !input.classList.contains('quantity__input')) return;

      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();

      var previousValue = parseFloat(input.dataset.__prevValue);
      if (isNaN(previousValue)) previousValue = parseFloat(input.value);

      commitQuantityChange(input, previousValue, false);
    },
    true
  );

  /* -----------------------------------------------------------------------
   * 1b) Remove line item (X button) — do not let main.js handle this
   * ---------------------------------------------------------------------*/

  document.addEventListener(
    'click',
    function (event) {
      var remove = event.target.closest('cart-remove-button');
      if (!remove) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();

      var container = findCartItemContainer(remove);
      var isDrawer = isDrawerElement(remove);
      var payload = getLinePayload(remove, 0);

      if (!payload.id && !payload.line) return;

      setItemLoading(container, true);

      changeCartLine(payload)
        .then(function (cart) {
          return (isDrawer ? refreshDrawerSections(true) : refreshCartPageSections()).then(function () {
            return cart;
          });
        })
        .then(function (cart) {
          dispatchCartUpdated(cart);
        })
        .catch(function () {
          setItemLoading(container, false);
        });
    },
    true
  );

  /* -----------------------------------------------------------------------
   * 2) Cart-drawer upsell toggle switch (always-bound delegated handler)
   * ---------------------------------------------------------------------*/

  function initUpsellToggleHandling() {
    // snippets/upsell-block.liquid checks this same flag before binding its
    // own (inline-script-dependent) handler, so setting it here up-front
    // guarantees exactly one handler is ever active, and that it's always
    // the reliable, always-executed one below.
    if (document.body.dataset.cartUpsellHandlerBound === 'true') return;
    document.body.dataset.cartUpsellHandlerBound = 'true';

    window.__upsellToggleProcessing = window.__upsellToggleProcessing || false;

    function clearToggleLoading(productId) {
      var container = document.querySelector('.product-upsell-container[data-product-id="' + productId + '"]');
      if (!container) return;
      var loading = container.querySelector('.upsell-loading-overlay');
      var slider = container.querySelector('.upsell-toggle-slider');
      var input = container.querySelector('.upsell-toggle-input');
      if (loading) loading.classList.add('hidden');
      if (slider) slider.classList.remove('loading');
      if (input) input.disabled = false;
    }

    document.body.addEventListener('change', function (event) {
      var toggleInput = event.target;
      if (!toggleInput.classList || !toggleInput.classList.contains('upsell-toggle-input')) return;

      var upsellContainer = toggleInput.closest('.product-upsell-container');
      if (!upsellContainer) return;

      if (window.__upsellToggleProcessing) {
        toggleInput.checked = !toggleInput.checked;
        return;
      }

      var upsellType = upsellContainer.dataset.upsellType;
      var isCartDrawer = upsellType === 'cart-drawer';
      var variantId = parseInt(upsellContainer.dataset.variantId, 10);
      var productId = upsellContainer.dataset.productId;

      if (!variantId || isNaN(variantId)) {
        toggleInput.checked = !toggleInput.checked;
        return;
      }

      var loading = upsellContainer.querySelector('.upsell-loading-overlay');
      var toggleSlider = upsellContainer.querySelector('.upsell-toggle-slider');

      if (loading) loading.classList.remove('hidden');
      if (toggleSlider) toggleSlider.classList.add('loading');
      toggleInput.disabled = true;
      window.__upsellToggleProcessing = true;

      if (toggleInput.checked) {
        fetchJSON(getCartApiUrl('cart/add.js'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Upsell-Add': 'true'
          },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
        })
          .then(function () {
            return isCartDrawer ? refreshDrawerSections(true) : refreshDrawerInBackground();
          })
          .then(function () {
            dispatchCartUpdated();
            window.__upsellToggleProcessing = false;
            clearToggleLoading(productId);
          })
          .catch(function () {
            window.__upsellToggleProcessing = false;
            clearToggleLoading(productId);
            var container = document.querySelector('.product-upsell-container[data-product-id="' + productId + '"]');
            var revertInput = container && container.querySelector('.upsell-toggle-input');
            if (revertInput) revertInput.checked = false;
          });
      } else {
        fetchJSON(getCartApiUrl('cart.js'))
          .then(function (cart) {
            var lineItem = null;
            for (var i = 0; i < cart.items.length; i++) {
              if (cart.items[i].variant_id === variantId) {
                lineItem = cart.items[i];
                break;
              }
            }
            if (!lineItem) {
              window.__upsellToggleProcessing = false;
              clearToggleLoading(productId);
              return null;
            }
            return changeCartLine({ id: lineItem.key, quantity: 0 });
          })
          .then(function (result) {
            if (result === null) return;
            return (isCartDrawer ? refreshDrawerSections(true) : refreshDrawerInBackground()).then(function () {
              dispatchCartUpdated();
              window.__upsellToggleProcessing = false;
              clearToggleLoading(productId);
            });
          })
          .catch(function () {
            window.__upsellToggleProcessing = false;
            clearToggleLoading(productId);
            var container = document.querySelector('.product-upsell-container[data-product-id="' + productId + '"]');
            var revertInput = container && container.querySelector('.upsell-toggle-input');
            if (revertInput) revertInput.checked = true;
          });
      }
    });
  }

  /* -----------------------------------------------------------------------
   * 3) Cart-drawer / product-page upsell "Add" button (non-silent mode)
   * ---------------------------------------------------------------------*/

  function initUpsellAddButtonHandling() {
    if (document.body.dataset.cartUpsellAddButtonBound === 'true') return;
    document.body.dataset.cartUpsellAddButtonBound = 'true';

    document.addEventListener(
      'click',
      function (event) {
        var addButton = event.target.closest('.upsell-add-btn');
        if (!addButton || addButton.disabled) return;

        var upsellContainer = addButton.closest('.product-upsell-container');
        if (!upsellContainer) return;

        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();

        var upsellType = upsellContainer.dataset.upsellType;
        var isCartDrawer = upsellType === 'cart-drawer';
        var variantId =
          parseInt(upsellContainer.dataset.variantId, 10) || parseInt(addButton.dataset.variantId, 10);

        if (!variantId || isNaN(variantId)) return;

        var btnText = addButton.querySelector('.btn-text');
        var originalText = addButton.dataset.addLabel || (btnText ? btnText.textContent : 'Add');
        var addedText = addButton.dataset.addedLabel || 'Added';
        var loading = upsellContainer.querySelector('.upsell-loading-overlay');
        var productId = upsellContainer.dataset.productId;

        function clearAddButtonLoading() {
          var container = productId
            ? document.querySelector('.product-upsell-container[data-product-id="' + productId + '"]')
            : upsellContainer;
          if (!container) container = upsellContainer;

          var overlay = container.querySelector('.upsell-loading-overlay');
          var button = container.querySelector('.upsell-add-btn');
          var text = button ? button.querySelector('.btn-text') : null;

          if (overlay) overlay.classList.add('hidden');
          if (button) {
            button.classList.remove('loading');
            button.disabled = false;
          }
          return { button: button, btnText: text };
        }

        if (isCartDrawer && loading) {
          loading.classList.remove('hidden');
        } else {
          addButton.classList.add('loading');
        }
        addButton.disabled = true;

        fetchJSON(getCartApiUrl('cart/add.js'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Upsell-Add': 'true'
          },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
        })
          .then(function (cart) {
            return (isCartDrawer ? refreshDrawerSections(true) : refreshDrawerInBackground()).then(function () {
              return cart;
            });
          })
          .then(function (cart) {
            dispatchCartUpdated(cart);

            if (isCartDrawer) return;

            var fresh = clearAddButtonLoading();
            var activeButton = fresh.button || addButton;
            var activeBtnText = fresh.btnText || btnText;

            activeButton.classList.add('added');
            if (activeBtnText) activeBtnText.textContent = addedText;
            setTimeout(function () {
              activeButton.classList.remove('added');
              if (activeBtnText) activeBtnText.textContent = originalText;
            }, 2000);
          })
          .catch(function () {
            var fresh = clearAddButtonLoading();
            var activeBtnText = fresh.btnText || btnText;
            if (activeBtnText) activeBtnText.textContent = originalText;
          });
      },
      true
    );
  }

  initUpsellToggleHandling();
  initUpsellAddButtonHandling();
})();
