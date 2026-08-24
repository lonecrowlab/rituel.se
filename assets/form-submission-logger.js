// Updated by Elevate: 2026-01-02T23:25:23.145Z
// Form Submission Logger - Intercepts and logs all cart submissions
(function() {
  'use strict';

  console.log('📋 FORM LOGGER: Initializing form submission interceptor');

  // Intercept all form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;

    // Check if this is a cart add form
    if (form.action && form.action.includes('/cart/add')) {
      console.log('🚀 FORM SUBMISSION INTERCEPTED', {
        formId: form.id,
        formAction: form.action,
        timestamp: new Date().toISOString()
      });

      // Log all form data
      const formData = new FormData(form);
      const formDataObj = {};

      for (let [key, value] of formData.entries()) {
        if (formDataObj[key]) {
          // Handle multiple values for same key (like items[])
          if (!Array.isArray(formDataObj[key])) {
            formDataObj[key] = [formDataObj[key]];
          }
          formDataObj[key].push(value);
        } else {
          formDataObj[key] = value;
        }
      }

      console.log('📋 FORM DATA:', formDataObj);

      // Log specific important fields
      const variantId = formData.get('id');
      const quantity = formData.get('quantity');
      const sellingPlan = formData.get('selling_plan');

      console.log('🎯 KEY VALUES:', {
        variantId: variantId,
        quantity: quantity,
        sellingPlan: sellingPlan
      });

      // Log all input elements in the form
      const inputs = form.querySelectorAll('input, select, textarea');
      const inputValues = {};

      inputs.forEach(input => {
        if (input.name) {
          inputValues[input.name] = {
            value: input.value,
            type: input.type,
            checked: input.checked,
            disabled: input.disabled
          };
        }
      });

      console.log('📝 ALL INPUT VALUES:', inputValues);

      // Check for bundle data
      const bundleData = form.querySelector('input[name="properties[_bundle]"]');
      if (bundleData) {
        try {
          const bundle = JSON.parse(bundleData.value);
          console.log('📦 BUNDLE DATA:', bundle);
        } catch (err) {
          console.log('📦 BUNDLE DATA (raw):', bundleData.value);
        }
      }

      // Check for items array (multi-item submission)
      const itemInputs = form.querySelectorAll('input[name^="items["]');
      if (itemInputs.length > 0) {
        const items = {};
        itemInputs.forEach(input => {
          const match = input.name.match(/items\[(\d+)\]\[(\w+)\]/);
          if (match) {
            const index = match[1];
            const field = match[2];
            if (!items[index]) items[index] = {};
            items[index][field] = input.value;
          }
        });
        console.log('🛒 MULTI-ITEM SUBMISSION:', items);
      }

      // Log current page state
      console.log('📍 PAGE STATE:', {
        url: window.location.href,
        productHandle: window.location.pathname.split('/').pop(),
        referrer: document.referrer
      });

      // Check for active components
      const activeComponents = {
        quantityBreaks: !!document.querySelector('.qb-option.qb-active'),
        subscription: !!document.querySelector('.plan-option.selected'),
        freeGifts: !!document.querySelector('.free-gifts-row__product.unlocked'),
        variantPicker: !!document.querySelector('input[name="options[Color]"]:checked, input[name="options[Size]"]:checked, select[name="options[Color]"], select[name="options[Size]"]')
      };

      console.log('🔧 ACTIVE COMPONENTS:', activeComponents);

      // If quantity breaks is active, log its state
      if (activeComponents.quantityBreaks) {
        const activeQB = document.querySelector('.qb-option.qb-active');
        if (activeQB) {
          console.log('🔵 QB STATE:', {
            qty: activeQB.dataset.qty,
            finalPrice: activeQB.dataset.finalPrice,
            finalCompare: activeQB.dataset.finalCompare
          });
        }
      }

      // If subscription is active, log its state
      if (activeComponents.subscription) {
        const selectedPlan = document.querySelector('.plan-option.selected');
        if (selectedPlan) {
          console.log('🟢 SUBSCRIPTION STATE:', {
            plan: selectedPlan.dataset.plan,
            planId: selectedPlan.querySelector('input[name="selling_plan"]')?.value
          });
        }
      }

      // Log final submission summary
      console.log('✅ SUBMISSION SUMMARY:', {
        variant: variantId,
        quantity: quantity,
        subscription: sellingPlan || 'none',
        bundleItems: bundleData ? 'yes' : 'no',
        multiItems: itemInputs.length > 0 ? itemInputs.length : 0,
        timestamp: new Date().toISOString()
      });

      console.log('=====================================');
    }
  }, true); // Use capture phase to intercept early

  // Also intercept AJAX cart additions
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    if (url && url.includes('/cart/add')) {
      console.log('🌐 AJAX CART ADD INTERCEPTED:', {
        url: url,
        method: options?.method || 'GET',
        timestamp: new Date().toISOString()
      });

      if (options?.body) {
        try {
          if (typeof options.body === 'string') {
            const data = JSON.parse(options.body);
            console.log('📋 AJAX DATA:', data);
          } else if (options.body instanceof FormData) {
            const data = {};
            for (let [key, value] of options.body.entries()) {
              data[key] = value;
            }
            console.log('📋 AJAX FORMDATA:', data);
          }
        } catch (err) {
          console.log('📋 AJAX BODY (raw):', options.body);
        }
      }
    }

    return originalFetch.apply(this, args);
  };

  // Log when variant changes
  document.addEventListener('variant-change', function(e) {
    console.log('🔄 VARIANT CHANGED:', e.detail);
  });

  // Log when quantity changes
  document.addEventListener('quantity-update', function(e) {
    console.log('🔢 QUANTITY UPDATED:', e.detail);
  });

  console.log('📋 FORM LOGGER: Ready and intercepting submissions');
})();