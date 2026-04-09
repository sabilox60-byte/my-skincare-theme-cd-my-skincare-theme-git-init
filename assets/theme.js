/* =============================================================================
   THEME.JS — Skincare Brand Shopify Theme
   Architecture: window.Theme namespace with discrete modules
   Dependencies: Swiper.js (CDN only) — zero other external libs
   ============================================================================= */

(function () {
  'use strict';

  /* ===========================================================================
     NAMESPACE
     ========================================================================= */
  window.Theme = window.Theme || {};

  /* ===========================================================================
     UTILS MODULE
     ========================================================================= */
  Theme.Utils = {
    /**
     * Debounce a function call
     * @param {Function} fn
     * @param {number} delay - ms
     * @returns {Function}
     */
    debounce(fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    /**
     * Format cents to Italian Euro string → "€12,50"
     * @param {number} cents
     * @returns {string}
     */
    formatMoney(cents) {
      return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
      }).format(cents / 100);
    },

    /**
     * Fetch JSON from a URL with error handling
     * @param {string} url
     * @returns {Promise<any>}
     */
    async getJSON(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    },

    /**
     * Serialize a form's named inputs into a plain object
     * @param {HTMLFormElement} form
     * @returns {Object}
     */
    serialize(form) {
      const data = new FormData(form);
      const result = {};
      data.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    },

    /**
     * Trap keyboard focus inside an element
     * @param {HTMLElement} element
     */
    trapFocus(element) {
      const focusable = element.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      element._focusTrapHandler = function (e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      element.addEventListener('keydown', element._focusTrapHandler);
      first.focus();
    },

    /**
     * Remove focus trap from element
     * @param {HTMLElement} element
     */
    releaseFocus(element) {
      if (element._focusTrapHandler) {
        element.removeEventListener('keydown', element._focusTrapHandler);
        delete element._focusTrapHandler;
      }
    },
  };

  /* ===========================================================================
     TOAST MODULE
     ========================================================================= */
  Theme.Toast = {
    _el: null,
    _timer: null,

    _ensure() {
      if (this._el) return;
      this._el = document.createElement('div');
      this._el.className = 'toast-notification';
      this._el.setAttribute('role', 'status');
      this._el.setAttribute('aria-live', 'polite');
      document.body.appendChild(this._el);
    },

    show(message, duration = 3000) {
      this._ensure();
      this._el.textContent = message;
      this._el.classList.add('is-visible');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this._el.classList.remove('is-visible');
      }, duration);
    },
  };

  /* ===========================================================================
     DRAWER MODULE — generic open/close for any drawer element
     ========================================================================= */
  Theme.Drawer = {
    _active: null,

    /**
     * Open a drawer by its element ID
     * @param {string} id - element id without #
     */
    open(id) {
      const el = document.getElementById(id);
      if (!el) return;

      // Close any currently open drawer first
      if (this._active && this._active !== el) {
        this.close(this._active.id);
      }

      this._active = el;
      el.classList.add('is-open');
      el.setAttribute('aria-expanded', 'true');
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');

      // Overlay
      const overlay = document.querySelector('[data-cart-overlay]');
      overlay?.classList.add('is-open');

      // Focus trap
      Theme.Utils.trapFocus(el);
    },

    /**
     * Close a drawer by its element ID (or close active if id omitted)
     * @param {string} [id]
     */
    close(id) {
      const el = id ? document.getElementById(id) : this._active;
      if (!el) return;

      el.classList.remove('is-open');
      el.setAttribute('aria-expanded', 'false');
      el.setAttribute('aria-hidden', 'true');

      // Only unlock scroll if no other drawers are open
      this._active = null;
      document.body.classList.remove('drawer-open');

      // Overlay
      const overlay = document.querySelector('[data-cart-overlay]');
      overlay?.classList.remove('is-open');

      // Release focus
      Theme.Utils.releaseFocus(el);
    },

    /**
     * Initialise click-outside and Escape to close any drawer
     */
    init() {
      // Click overlay to close
      document.addEventListener('click', (e) => {
        if (e.target.matches('[data-cart-overlay]')) {
          this.close();
        }
      });
    },
  };

  /* ===========================================================================
     CART MODULE
     ========================================================================= */
  Theme.Cart = {
    FREE_SHIPPING_THRESHOLD: 3900, // €39 in cents — overridden from settings if available
    GIFT_THRESHOLD:          3900,

    _cartDrawerEl:   null,
    _itemsEl:        null,
    _subtotalEl:     null,
    _shippingFillEl: null,
    _shippingTextEl: null,
    _countBadges:    [],
    _giftTrackerEl:  null,

    init() {
      this._cartDrawerEl   = document.getElementById('cart-drawer');
      this._itemsEl        = document.querySelector('[data-cart-items]');
      this._subtotalEl     = document.querySelector('[data-cart-subtotal]');
      this._shippingFillEl = document.querySelector('[data-shipping-fill]');
      this._shippingTextEl = document.querySelector('[data-shipping-text]');
      this._giftTrackerEl  = document.querySelector('[data-gift-tracker]');
      this._countBadges    = [...document.querySelectorAll('[data-cart-count]')];

      // Read threshold from data attribute if set via Liquid
      const threshold = document.querySelector('[data-free-shipping-threshold]');
      if (threshold) {
        this.FREE_SHIPPING_THRESHOLD = parseInt(threshold.dataset.freeShippingThreshold, 10) * 100;
        this.GIFT_THRESHOLD = this.FREE_SHIPPING_THRESHOLD;
      }

      // Open cart drawer triggers
      document.querySelectorAll('[data-open-cart]').forEach((btn) => {
        btn.addEventListener('click', () => this.openDrawer());
      });

      // Close triggers
      document.querySelectorAll('[data-cart-close]').forEach((btn) => {
        btn.addEventListener('click', () => this.closeDrawer());
      });

      // Cart updated event (fired after add/update/remove)
      document.addEventListener('cart:updated', () => this.refreshDrawer());

      // Qty / remove actions inside cart drawer (event delegation)
      this._itemsEl?.addEventListener('click', (e) => this._handleItemAction(e));

      // Fetch count on page load (silent)
      Theme.Utils.getJSON('/cart.js')
        .then((cart) => this._updateCountBadges(cart.item_count))
        .catch(() => {});
    },

    openDrawer() {
      if (!this._cartDrawerEl) return;
      Theme.Drawer.open('cart-drawer');
      this.refreshDrawer();
    },

    closeDrawer() {
      Theme.Drawer.close('cart-drawer');
    },

    /**
     * Add a variant to the cart
     * @param {number} variantId
     * @param {number} [quantity=1]
     * @param {Object} [properties={}]
     * @returns {Promise<Object>} Shopify cart response
     */
    async addItem(variantId, quantity = 1, properties = {}) {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity, properties }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.description || 'Impossibile aggiungere al carrello');
      }

      const data = await res.json();
      document.dispatchEvent(new CustomEvent('cart:updated'));
      return data;
    },

    /**
     * Update a line item quantity
     * @param {string} key - line item key
     * @param {number} quantity
     * @returns {Promise<Object>} Shopify cart
     */
    async updateItem(key, quantity) {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity }),
      });

      if (!res.ok) throw new Error('Impossibile aggiornare il carrello');
      const cart = await res.json();
      this._renderCart(cart);
      return cart;
    },

    /**
     * Remove a line item from the cart
     * @param {string} key
     * @returns {Promise<Object>}
     */
    async removeItem(key) {
      return this.updateItem(key, 0);
    },

    /**
     * Fetch latest cart state and re-render the drawer
     */
    async refreshDrawer() {
      try {
        const cart = await Theme.Utils.getJSON('/cart.js');
        this._renderCart(cart);
      } catch (err) {
        console.error('[Theme.Cart] refreshDrawer failed:', err);
      }
    },

    /* ── Private ── */

    _updateCountBadges(count) {
      this._countBadges.forEach((el) => {
        el.textContent = count;
        el.dataset.count = count;
      });
    },

    _updateShippingBar(totalPrice) {
      if (!this._shippingFillEl) return;
      const pct = Math.min((totalPrice / this.FREE_SHIPPING_THRESHOLD) * 100, 100);
      this._shippingFillEl.style.width = `${pct}%`;

      if (this._shippingTextEl) {
        const remaining = this.FREE_SHIPPING_THRESHOLD - totalPrice;
        if (remaining <= 0) {
          this._shippingTextEl.innerHTML = '<strong>Spedizione gratuita sbloccata!</strong> ✓';
        } else {
          this._shippingTextEl.innerHTML =
            `Aggiungi <strong>${Theme.Utils.formatMoney(remaining)}</strong> per la spedizione gratuita`;
        }
      }
    },

    _updateGiftTracker(totalPrice) {
      if (!this._giftTrackerEl) return;
      const unlocked = totalPrice >= this.GIFT_THRESHOLD;
      this._giftTrackerEl.dataset.unlocked = unlocked;
    },

    _renderCart(cart) {
      this._updateCountBadges(cart.item_count);
      this._updateShippingBar(cart.total_price);
      this._updateGiftTracker(cart.total_price);

      if (this._subtotalEl) {
        this._subtotalEl.textContent = Theme.Utils.formatMoney(cart.total_price);
      }

      if (!this._itemsEl) return;

      if (cart.items.length === 0) {
        this._itemsEl.innerHTML = `
          <div class="cart-drawer__empty">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0
                   00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114
                   60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0
                   11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
            </svg>
            <p>Il tuo carrello è vuoto</p>
            <a href="/collections/all" class="btn btn-primary btn-sm">Scopri i prodotti</a>
          </div>`;
        return;
      }

      this._itemsEl.innerHTML = cart.items.map((item) => `
        <div class="cart-item" data-key="${item.key}">
          <img class="cart-item__img"
               src="${item.image ? item.image.replace('http:', 'https:') : ''}"
               alt="${item.product_title}"
               width="80" height="80" loading="lazy">
          <div class="cart-item__info">
            <p class="cart-item__title">${item.product_title}</p>
            ${item.variant_title && item.variant_title !== 'Default Title'
              ? `<p class="cart-item__variant">${item.variant_title}</p>` : ''}
            <p class="cart-item__price">${Theme.Utils.formatMoney(item.line_price)}</p>
            <div class="cart-item__actions">
              <div class="cart-item__qty" role="group" aria-label="Quantità per ${item.product_title}">
                <button class="cart-item__qty-btn" data-qty-action="decrease" aria-label="Diminuisci">−</button>
                <span class="cart-item__qty-num">${item.quantity}</span>
                <button class="cart-item__qty-btn" data-qty-action="increase" aria-label="Aumenta">+</button>
              </div>
              <button class="cart-item__remove" data-qty-action="remove" aria-label="Rimuovi ${item.product_title}">
                Rimuovi
              </button>
            </div>
          </div>
        </div>`).join('');
    },

    async _handleItemAction(e) {
      const btn = e.target.closest('[data-qty-action]');
      if (!btn) return;

      const itemEl  = btn.closest('[data-key]');
      if (!itemEl) return;

      const key     = itemEl.dataset.key;
      const action  = btn.dataset.qtyAction;
      const qtyEl   = itemEl.querySelector('.cart-item__qty-num');
      const current = parseInt(qtyEl?.textContent || '1', 10);

      try {
        if (action === 'increase') {
          await this.updateItem(key, current + 1);
        } else if (action === 'decrease') {
          await this.updateItem(key, Math.max(0, current - 1));
        } else if (action === 'remove') {
          await this.removeItem(key);
        }
      } catch (err) {
        Theme.Toast.show(err.message);
      }
    },
  };

  /* ===========================================================================
     MENU MODULE
     ========================================================================= */
  Theme.Menu = {
    _openMegaItem: null,
    _hoverTimer:   null,

    /**
     * Initialise desktop mega menu hover with 150ms intent delay
     */
    initMegaMenu() {
      const navItems = document.querySelectorAll('[data-mega-trigger]');

      navItems.forEach((item) => {
        const menu   = item.querySelector('[data-mega-menu]');
        const trigger = item.querySelector('[data-mega-link]');
        if (!menu) return;

        // Desktop: hover intent
        item.addEventListener('mouseenter', () => {
          clearTimeout(this._hoverTimer);
          this._hoverTimer = setTimeout(() => this._openMega(item, menu), 150);
        });

        item.addEventListener('mouseleave', () => {
          clearTimeout(this._hoverTimer);
          this._hoverTimer = setTimeout(() => this._closeMega(item, menu), 150);
        });

        // Keyboard: Enter/Space toggle
        trigger?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.classList.contains('is-open')
              ? this._closeMega(item, menu)
              : this._openMega(item, menu);
          }
          if (e.key === 'Escape') this._closeMega(item, menu);
        });
      });
    },

    _openMega(item, menu) {
      // Close other open menus first
      if (this._openMegaItem && this._openMegaItem !== item) {
        const prevMenu = this._openMegaItem.querySelector('[data-mega-menu]');
        this._closeMega(this._openMegaItem, prevMenu);
      }

      item.classList.add('is-open');
      menu.classList.add('is-open');
      menu.setAttribute('aria-hidden', 'false');
      const trigger = item.querySelector('[data-mega-link]');
      trigger?.setAttribute('aria-expanded', 'true');
      this._openMegaItem = item;
    },

    _closeMega(item, menu) {
      item.classList.remove('is-open');
      menu?.classList.remove('is-open');
      menu?.setAttribute('aria-hidden', 'true');
      const trigger = item.querySelector('[data-mega-link]');
      trigger?.setAttribute('aria-expanded', 'false');
      if (this._openMegaItem === item) this._openMegaItem = null;
    },

    /**
     * Toggle mobile menu open/closed
     */
    toggleMobileMenu() {
      const mobileMenu = document.getElementById('mobile-menu');
      const hamburger  = document.querySelector('[data-hamburger]');
      if (!mobileMenu) return;

      const isOpen = mobileMenu.classList.contains('is-open');
      if (isOpen) {
        this.closeMobileMenu();
      } else {
        this.openMobileMenu();
      }
    },

    openMobileMenu() {
      const mobileMenu = document.getElementById('mobile-menu');
      const hamburger  = document.querySelector('[data-hamburger]');
      if (!mobileMenu) return;

      mobileMenu.classList.add('is-open');
      mobileMenu.setAttribute('aria-hidden', 'false');
      hamburger?.classList.add('is-open');
      hamburger?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
      Theme.Utils.trapFocus(mobileMenu);
    },

    closeMobileMenu() {
      const mobileMenu = document.getElementById('mobile-menu');
      const hamburger  = document.querySelector('[data-hamburger]');
      if (!mobileMenu) return;

      mobileMenu.classList.remove('is-open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      hamburger?.classList.remove('is-open');
      hamburger?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
      Theme.Utils.releaseFocus(mobileMenu);
    },

    /**
     * Global Escape key listener — closes any open mega menu or mobile menu
     */
    closeOnEscape() {
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // Close mega
        if (this._openMegaItem) {
          const menu = this._openMegaItem.querySelector('[data-mega-menu]');
          this._closeMega(this._openMegaItem, menu);
        }

        // Close mobile
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu?.classList.contains('is-open')) {
          this.closeMobileMenu();
        }

        // Close search
        Theme.Search?.close();

        // Close cart
        Theme.Cart.closeDrawer();
      });
    },

    init() {
      this.initMegaMenu();
      this.closeOnEscape();

      // Hamburger button
      document.querySelector('[data-hamburger]')?.addEventListener('click', () => {
        this.toggleMobileMenu();
      });

      // Mobile close button
      document.querySelector('[data-mobile-close]')?.addEventListener('click', () => {
        this.closeMobileMenu();
      });

      // Mobile sub-menu toggles
      document.querySelectorAll('[data-mobile-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sub  = btn.nextElementSibling;
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          sub?.classList.toggle('is-open', !open);
        });
      });

      // Scroll: sticky header offset
      this._initStickyHeader();
    },

    _initStickyHeader() {
      const header       = document.querySelector('[data-header]');
      const announcement = document.querySelector('[data-announcement-bar]');
      if (!header) return;

      const onScroll = Theme.Utils.debounce(() => {
        const offset = announcement ? Math.max(0, announcement.offsetHeight - window.scrollY) : 0;
        header.style.top = `${offset}px`;
        header.classList.toggle('is-scrolled', window.scrollY > 50);
      }, 16);

      window.addEventListener('scroll', onScroll, { passive: true });
    },
  };

  /* ===========================================================================
     SEARCH MODULE
     ========================================================================= */
  Theme.Search = {
    _el:    null,
    _input: null,

    init() {
      this._el    = document.getElementById('search-drawer');
      this._input = document.querySelector('[data-search-input]');

      document.querySelectorAll('[data-open-search]').forEach((btn) => {
        btn.addEventListener('click', () => this.open());
      });

      document.querySelector('[data-search-close]')?.addEventListener('click', () => {
        this.close();
      });
    },

    open() {
      if (!this._el) return;
      this._el.classList.add('is-open');
      this._el.setAttribute('aria-expanded', 'true');
      setTimeout(() => this._input?.focus(), 100);
    },

    close() {
      if (!this._el) return;
      this._el.classList.remove('is-open');
      this._el.setAttribute('aria-expanded', 'false');
    },
  };

  /* ===========================================================================
     SLIDER MODULE — wraps Swiper instances
     ========================================================================= */
  Theme.Slider = {
    /**
     * Hero slider: full-screen, autoplay 5s, dot pagination, pause on video
     */
    initHeroSlider() {
      const el = document.querySelector('[data-hero-swiper]');
      if (!el || typeof Swiper === 'undefined') return;

      const swiper = new Swiper(el, {
        loop: true,
        autoplay: {
          delay: 5000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        },
        pagination: {
          el: el.querySelector('.swiper-pagination'),
          clickable: true,
        },
        on: {
          slideChange(s) {
            const slide = s.slides[s.activeIndex];
            const video = slide?.querySelector('video');
            if (video) {
              video.play().catch(() => {});
              s.autoplay.stop();
              video.addEventListener('ended', () => s.autoplay.start(), { once: true });
            }
          },
        },
      });

      return swiper;
    },

    /**
     * Product / ingredients carousel: 1.2 mobile → 3 desktop
     */
    initProductSlider() {
      const els = document.querySelectorAll('[data-ingredients-swiper]');
      els.forEach((el) => {
        new Swiper(el, {
          slidesPerView: 1.2,
          spaceBetween: 16,
          breakpoints: {
            480:  { slidesPerView: 2.1, spaceBetween: 16 },
            768:  { slidesPerView: 3,   spaceBetween: 24 },
            1024: { slidesPerView: 4,   spaceBetween: 24 },
          },
        });
      });
    },

    /**
     * Protocols slider: freeMode, 1.2 → 3.5 → 4.5 per view
     */
    initProtocolsSlider() {
      const el = document.querySelector('[data-protocols-swiper]');
      if (!el || typeof Swiper === 'undefined') return;

      new Swiper(el, {
        freeMode: true,
        slidesPerView: 1.3,
        spaceBetween: 16,
        breakpoints: {
          480:  { slidesPerView: 2.2, spaceBetween: 16 },
          768:  { slidesPerView: 3.5, spaceBetween: 24 },
          1024: { slidesPerView: 4.5, spaceBetween: 24 },
        },
      });
    },

    initIngredientsSlider() {
      const el = document.querySelector('[data-ingredients-slider]');
      if (!el || typeof Swiper === 'undefined') return;

      new Swiper(el, {
        slidesPerView: 1.2,
        spaceBetween: 16,
        pagination: {
          el: '.ingredients-pagination',
          clickable: true,
        },
        breakpoints: {
          768:  { slidesPerView: 2.5, spaceBetween: 16 },
          1024: { slidesPerView: 3,   spaceBetween: 16 },
        },
      });
    },
  };

  /* ===========================================================================
     TABS MODULE — routine tabs with lazy product loading
     ========================================================================= */
  Theme.Tabs = {
    _cache: {},

    /**
     * Initialise all [data-routine-tabs] containers on the page
     * @param {HTMLElement} [container=document] - scope
     */
    init(container = document) {
      container.querySelectorAll('[data-routine-tabs]').forEach((section) => {
        const pills  = [...section.querySelectorAll('[data-tab-pill]')];
        const panels = [...section.querySelectorAll('[data-tab-panel]')];

        pills.forEach((pill, i) => {
          pill.addEventListener('click', () => this._activate(pill, pills, panels, section));

          // Keyboard: left/right arrow navigation
          pill.addEventListener('keydown', (e) => {
            let idx = pills.indexOf(e.currentTarget);
            if (e.key === 'ArrowRight') idx = (idx + 1) % pills.length;
            else if (e.key === 'ArrowLeft') idx = (idx - 1 + pills.length) % pills.length;
            else return;
            pills[idx].focus();
            pills[idx].click();
          });
        });
      });
    },

    async _activate(pill, pills, panels, section) {
      const tabId  = pill.dataset.tabPill;
      const handle = pill.dataset.collectionHandle;

      // Update pills
      pills.forEach((p) => {
        p.classList.remove('is-active');
        p.setAttribute('aria-selected', 'false');
        p.setAttribute('tabindex', '-1');
      });
      pill.classList.add('is-active');
      pill.setAttribute('aria-selected', 'true');
      pill.setAttribute('tabindex', '0');

      // Update panels
      panels.forEach((p) => p.classList.remove('is-active'));
      const panel = section.querySelector(`[data-tab-panel="${tabId}"]`);
      if (!panel) return;

      panel.classList.add('is-active');

      // Lazy-load products if panel is empty and has a collection handle
      if (handle && !panel.dataset.loaded) {
        await this.loadTabContent(handle, panel);
      }
    },

    /**
     * Fetch collection products and inject cards into panelEl
     * @param {string} handle - collection handle
     * @param {HTMLElement} panelEl
     */
    async loadTabContent(handle, panelEl) {
      panelEl.innerHTML = `<div class="routine-tabs__loading">
        <span class="loading-spinner loading-spinner--sm"></span>
      </div>`;

      try {
        if (!this._cache[handle]) {
          const data = await Theme.Utils.getJSON(
            `/collections/${handle}/products.json?limit=8`
          );
          this._cache[handle] = data.products;
        }

        const products = this._cache[handle];

        if (!products.length) {
          panelEl.innerHTML = '<p class="text-sm text-muted">Nessun prodotto trovato.</p>';
          return;
        }

        this.renderProducts(products, panelEl);
        panelEl.dataset.loaded = 'true';
      } catch (err) {
        panelEl.innerHTML = '<p class="text-sm text-muted">Impossibile caricare i prodotti.</p>';
        console.warn('[Theme.Tabs] loadTabContent error:', err);
      }
    },

    /**
     * Render an array of product objects as product cards
     * HTML structure matches product-card.liquid CSS classes exactly
     * @param {Array} products - Shopify products array from /products.json
     * @param {HTMLElement} container
     */
    renderProducts(products, container) {
      container.innerHTML = `<div class="routine-tabs__grid">
        ${products.map((product) => {
          const price      = Theme.Utils.formatMoney(product.variants[0]?.price || 0);
          const variantId  = product.variants[0]?.id;
          const imgPrimary = product.featured_image
            ? product.featured_image.replace('http:', 'https:')
            : '';
          const imgSecondary = product.images[1]
            ? product.images[1].src.replace('http:', 'https:')
            : '';
          const isBestSeller = product.tags?.includes('best-seller');
          const isNew        = product.tags?.includes('new');
          const isLimited    = product.tags?.includes('limited');
          const badge        = isBestSeller
            ? '<span class="product-badge badge badge-bestseller">Best Seller</span>'
            : isNew
            ? '<span class="product-badge badge badge-new">New</span>'
            : isLimited
            ? '<span class="product-badge badge badge-limited">Limited</span>'
            : '';

          return `
            <div class="product-card">
              <a class="card-media" href="/products/${product.handle}">
                <img class="img-primary"
                     src="${imgPrimary}"
                     alt="${product.title.replace(/"/g, '&quot;')}"
                     width="600" height="600"
                     loading="lazy">
                ${imgSecondary
                  ? `<img class="img-secondary" src="${imgSecondary}" alt="" width="600" height="600" loading="lazy">`
                  : ''}
                ${badge}
              </a>
              <div class="card-info">
                <h3 class="card-title">
                  <a href="/products/${product.handle}">${product.title}</a>
                </h3>
                <p class="card-price">${price}</p>
                <button class="btn-atc"
                        data-variant-id="${variantId}"
                        aria-label="Aggiungi ${product.title.replace(/"/g, '&quot;')} al carrello">
                  Aggiungi al carrello
                </button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
    },
  };

  /* ===========================================================================
     ATC MODULE — Add to Cart via event delegation
     ========================================================================= */
  Theme.ATC = {
    init() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-variant-id]');
        if (!btn || !btn.classList.contains('btn-atc') && !btn.dataset.atcBtn) return;
        this._handleClick(e, btn);
      });

      // Also handle the PDP main ATC button (different class)
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.product-buybox__atc-btn');
        if (!btn) return;
        this._handleClick(e, btn);
      });
    },

    async _handleClick(e, btn) {
      const variantId = btn.dataset.variantId;
      if (!variantId) return;

      // Get quantity from nearby qty input — search within product buybox or form wrapper
      const buybox   = btn.closest('.product-buybox') || btn.closest('[data-product-form]');
      const qtyInput = buybox?.querySelector('.qty-input');
      const qty      = parseInt(qtyInput?.value || '1', 10);

      const originalText = btn.textContent.trim();
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner loading-spinner--sm loading-spinner--light"></span>';

      try {
        await Theme.Cart.addItem(Number(variantId), qty);
        Theme.Cart.openDrawer();
        Theme.Toast.show('Prodotto aggiunto al carrello ✓');
      } catch (err) {
        Theme.Toast.show(err.message);
      } finally {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    },
  };

  /* ===========================================================================
     QUANTITY SELECTOR MODULE
     ========================================================================= */
  Theme.QtySelector = {
    init() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.qty-btn--minus, .qty-btn--plus');
        if (!btn) return;

        const selector  = btn.closest('[data-qty-selector]');
        const input     = selector?.querySelector('.qty-input');
        if (!input) return;

        const current = parseInt(input.value, 10) || 1;
        const min     = parseInt(input.min, 10) || 1;
        const max     = parseInt(input.max, 10) || 99;

        if (btn.classList.contains('qty-btn--plus')) {
          input.value = Math.min(current + 1, max);
        } else {
          input.value = Math.max(current - 1, min);
        }

        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
  };

  /* ===========================================================================
     VARIANT SELECTOR MODULE
     ========================================================================= */
  Theme.VariantSelector = {
    init() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-variant-btn]');
        if (!btn || btn.disabled) return;

        const group = btn.closest('[data-variant-group]');
        if (!group) return;

        group.querySelectorAll('[data-variant-btn]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        const form = btn.closest('[data-product-form]');
        if (form) this._updateForm(form);
      });
    },

    _updateForm(form) {
      const groups   = [...form.querySelectorAll('[data-variant-group]')];
      const selected = groups.map(
        (g) => g.querySelector('[data-variant-btn].is-active')?.dataset.value
      );

      const rawVariants = form.dataset.variants;
      if (!rawVariants) return;

      let variants;
      try {
        variants = JSON.parse(rawVariants);
      } catch {
        return;
      }

      const match = variants.find((v) => v.options.every((opt, i) => opt === selected[i]));
      if (!match) return;

      // Update ATC button
      const atcBtn = form.querySelector('.product-buybox__atc-btn');
      if (atcBtn) {
        atcBtn.dataset.variantId = match.id;
        atcBtn.disabled = !match.available;
        atcBtn.textContent = match.available ? 'Aggiungi al carrello' : 'Non disponibile';
      }

      // Update price
      const priceEl = form.querySelector('[data-variant-price]');
      if (priceEl) priceEl.textContent = Theme.Utils.formatMoney(match.price);

      const comparePriceEl = form.querySelector('[data-variant-compare-price]');
      if (comparePriceEl) {
        comparePriceEl.textContent = match.compare_at_price
          ? Theme.Utils.formatMoney(match.compare_at_price) : '';
        comparePriceEl.style.display = match.compare_at_price ? '' : 'none';
      }
    },
  };

  /* ===========================================================================
     PRODUCT GALLERY MODULE
     ========================================================================= */
  Theme.ProductGallery = {
    init() {
      document.querySelectorAll('[data-product-gallery]').forEach((gallery) => {
        const thumbs  = gallery.querySelectorAll('[data-gallery-thumb]');
        const mainImg = gallery.querySelector('[data-gallery-main] img');
        if (!mainImg) return;

        thumbs.forEach((thumb) => {
          thumb.addEventListener('click', () => {
            mainImg.src    = thumb.dataset.src || thumb.querySelector('img')?.src;
            if (thumb.dataset.srcset) mainImg.srcset = thumb.dataset.srcset;
            if (thumb.dataset.alt)    mainImg.alt    = thumb.dataset.alt;

            thumbs.forEach((t) => t.classList.remove('is-active'));
            thumb.classList.add('is-active');
          });
        });
      });
    },
  };

  /* ===========================================================================
     ACCORDION MODULE
     ========================================================================= */
  Theme.Accordion = {
    init() {
      document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-accordion-trigger]');
        if (!trigger) return;

        const item  = trigger.closest('[data-accordion-item]');
        if (!item) return;

        const isOpen  = item.classList.contains('is-open');
        const content = item.querySelector('[data-accordion-content]');

        // If accordion group configured, close siblings
        const group = item.closest('[data-accordion]');
        if (group?.dataset.accordion === 'single') {
          group.querySelectorAll('[data-accordion-item].is-open').forEach((openItem) => {
            if (openItem !== item) {
              openItem.classList.remove('is-open');
              openItem.querySelector('[data-accordion-trigger]')
                ?.setAttribute('aria-expanded', 'false');
            }
          });
        }

        item.classList.toggle('is-open', !isOpen);
        trigger.setAttribute('aria-expanded', String(!isOpen));
        content?.setAttribute('aria-hidden', String(isOpen));
      });
    },
  };

  /* ===========================================================================
     VIDEO FEATURE MODULE
     ========================================================================= */
  Theme.VideoFeature = {
    init() {
      document.querySelectorAll('[data-video-feature]').forEach((wrapper) => {
        const video   = wrapper.querySelector('video');
        const playBtn = wrapper.querySelector('[data-play-btn]');
        if (!video || !playBtn) return;

        playBtn.addEventListener('click', () => {
          if (video.paused) {
            video.play().catch(() => {});
            playBtn.style.opacity = '0';
            playBtn.setAttribute('aria-label', 'Pausa video');
          } else {
            video.pause();
            playBtn.style.opacity = '1';
            playBtn.setAttribute('aria-label', 'Riproduci video');
          }
        });

        video.addEventListener('click', () => playBtn.click());
      });
    },
  };

  /* ===========================================================================
     NEWSLETTER MODULE
     ========================================================================= */
  Theme.Newsletter = {
    init() {
      document.querySelectorAll('[data-newsletter-form]').forEach((form) => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input   = form.querySelector('[data-newsletter-input]');
          const success = form.querySelector('[data-newsletter-success]');
          const btn     = form.querySelector('[type="submit"]');
          if (!input?.value.trim()) return;

          btn.disabled = true;
          const orig   = btn.textContent;
          btn.innerHTML = '<span class="loading-spinner loading-spinner--sm loading-spinner--light"></span>';

          try {
            const body = new FormData();
            body.append('form_type', 'customer');
            body.append('utf8', '✓');
            body.append('customer[email]', input.value.trim());
            body.append('customer[tags]', 'newsletter');

            await fetch('/contact#contact_form', {
              method: 'POST',
              body,
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });

            form.style.display = 'none';
            success?.classList.add('is-visible');
          } catch {
            Theme.Toast.show('Errore. Riprova tra poco.');
            btn.disabled = false;
            btn.textContent = orig;
          }
        });
      });
    },
  };

  /* ===========================================================================
     FOOTER ACCORDION (mobile collapse)
     ========================================================================= */
  Theme.FooterAccordion = {
    init() {
      document.querySelectorAll('[data-footer-col]').forEach((col) => {
        const title = col.querySelector('[data-footer-col-title]');
        if (!title) return;

        title.addEventListener('click', () => {
          if (window.innerWidth >= 768) return; // desktop: always open
          const isOpen = col.classList.contains('is-open');
          col.classList.toggle('is-open', !isOpen);
          title.setAttribute('aria-expanded', String(!isOpen));
        });
      });
    },
  };

  /* ===========================================================================
     COLLECTION FILTERS
     ========================================================================= */
  Theme.CollectionFilters = {
    init() {
      document.querySelectorAll('[data-filter-pill]').forEach((pill) => {
        pill.addEventListener('click', () => {
          const group = pill.closest('[data-filter-group]');
          if (group) {
            group.querySelectorAll('[data-filter-pill]').forEach((p) => p.classList.remove('is-active'));
          }
          pill.classList.toggle('is-active');
          pill.closest('form')?.submit();
        });
      });
    },
  };

  /* ===========================================================================
     DOM READY — initialise all modules
     ========================================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    Theme.Drawer.init();
    Theme.Cart.init();
    Theme.Search.init();
    Theme.Menu.init();     // calls initMegaMenu() + closeOnEscape() internally
    Theme.Tabs.init();
    Theme.ATC.init();
    Theme.QtySelector.init();
    Theme.VariantSelector.init();
    Theme.ProductGallery.init();
    Theme.Accordion.init();
    Theme.VideoFeature.init();
    Theme.Newsletter.init();
    Theme.FooterAccordion.init();
    Theme.CollectionFilters.init();

    // Sliders are initialised inside their respective section <script> blocks
    // so Swiper is always available before they run. Expose init methods globally.
    // Usage in section: document.addEventListener('DOMContentLoaded', Theme.Slider.initHeroSlider)
  });
})();
