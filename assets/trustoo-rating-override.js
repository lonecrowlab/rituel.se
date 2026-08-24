(function () {
  const dataEl = document.getElementById('trustoo-rating-override-data');
  if (!dataEl) return;

  let data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (error) {
    return;
  }

  if (!data.rating) return;

  const MAX_ATTEMPTS = 150;
  const INTERVAL_MS = 200;
  let attempts = 0;

  function updateStarDisplay(starContainer, rating) {
    if (!starContainer) return;

    const numericRating = parseFloat(rating);
    if (Number.isNaN(numericRating)) return;

    const fullStars = Math.floor(numericRating);
    const decimal = numericRating - fullStars;
    const starItems = starContainer.querySelectorAll('.star-item');

    starItems.forEach(function (star, index) {
      star.classList.remove('half-star');

      const halfStarEl = star.querySelector('.item-star');
      if (halfStarEl) {
        halfStarEl.style.width = '';
      }

      if (index < fullStars) {
        return;
      }

      if (index === fullStars && decimal > 0) {
        star.classList.add('half-star');
        if (halfStarEl) {
          halfStarEl.style.width = String(Math.round(decimal * 100)) + '%';
        }
      }
    });
  }

  function applyOverride() {
    const headLeft = document.querySelector('.tt-head-left');
    if (!headLeft) return false;

    const bigPoint = headLeft.querySelector('.big-point');
    if (!bigPoint) return false;

    bigPoint.textContent = data.rating;

    if (data.countText) {
      const reviewsNum = headLeft.querySelector('.reviews-num');
      if (reviewsNum) {
        reviewsNum.textContent = ' ' + data.countText;
      }
    }

    updateStarDisplay(headLeft.querySelector('.vstar-star'), data.rating);
    return true;
  }

  const timer = window.setInterval(function () {
    attempts += 1;

    if (applyOverride() || attempts >= MAX_ATTEMPTS) {
      window.clearInterval(timer);
    }
  }, INTERVAL_MS);
})();
