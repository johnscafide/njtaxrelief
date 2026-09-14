(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const annualDialog = $('#annual-dialog');
  const tourDialog = $('#tour-dialog');
  const imageDialog = $('#image-dialog');
  const mobileButton = $('.mobile-menu');
  const navigation = $('#main-nav');
  const resourcesButton = $('#resources-button');
  const resourcesMenu = $('#resources-menu');
  const continueLink = $('#continue-link');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const startedAt = performance.now();
  const exitStorageKey = 'watchdog:agent:annual-seen';
  const dialogOpeners = new WeakMap();
  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let checkoutBusy = false;
  let engaged = false;
  let seenAnnual = false;
  let toastTimer;

  try { seenAnnual = sessionStorage.getItem(exitStorageKey) === '1'; } catch (_) { /* In-memory session fallback. */ }

  function animate(element, frames, options = {}) {
    if (!element || reducedMotion.matches || typeof element.animate !== 'function') return;
    return element.animate(frames, { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
  }

  function setResources(open, restoreFocus = false) {
    if (!resourcesButton || !resourcesMenu) return;
    resourcesButton.setAttribute('aria-expanded', String(open));
    resourcesMenu.hidden = !open;
    if (!open && restoreFocus) resourcesButton.focus();
  }

  function setNavigation(open, restoreFocus = false) {
    if (!mobileButton || !navigation) return;
    mobileButton.setAttribute('aria-expanded', String(open));
    mobileButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    navigation.classList.toggle('is-open', open);
    if (!open) setResources(false);
    if (!open && restoreFocus) mobileButton.focus();
  }

  function topDialog() {
    return $$('dialog[open]').at(-1);
  }

  function usableFocusTargets(dialog) {
    return $$(focusableSelector, dialog).filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function openDialog(dialog, opener = document.activeElement) {
    if (!dialog || dialog.open) return false;
    dialogOpeners.set(dialog, opener);
    setResources(false);
    setNavigation(false);
    dialog.showModal();
    document.body.classList.add('has-dialog');
    const first = $('[data-dialog-initial-focus]', dialog)
      || (dialog === annualDialog ? $('#annual-title', dialog) : null)
      || $('[data-dialog-close]', dialog)
      || usableFocusTargets(dialog)[0];
    first?.focus({ preventScroll: true });
    animate(dialog, [{ opacity: 0.86, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }]);
    return true;
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  $$('dialog').forEach(dialog => {
    let beganOnBackdrop = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { beganOnBackdrop = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
      if (beganOnBackdrop && event.target === dialog && outside(event)) closeDialog(dialog);
      beganOnBackdrop = false;
    });
    dialog.addEventListener('close', () => {
      document.body.classList.toggle('has-dialog', Boolean(topDialog()));
      if (dialog === annualDialog && continueLink) {
        continueLink.hidden = true;
        continueLink.removeAttribute('href');
      }
      const opener = dialogOpeners.get(dialog);
      const remaining = topDialog();
      if (opener?.isConnected && opener.getClientRects().length && (!remaining || remaining.contains(opener))) {
        opener.focus({ preventScroll: true });
      } else if (remaining) {
        usableFocusTargets(remaining)[0]?.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || topDialog() !== dialog) return;
      const targets = usableFocusTargets(dialog);
      const first = targets[0];
      const last = targets.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !targets.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
  });

  $$('[data-dialog-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('[data-tour-open]').forEach(button => button.addEventListener('click', () => openDialog(tourDialog, button)));

  function showAnnual(opener, destination) {
    if (!annualDialog || checkoutBusy || topDialog()) return false;
    if (continueLink) {
      continueLink.hidden = !destination;
      if (destination) continueLink.href = destination;
      else continueLink.removeAttribute('href');
    }
    if (!openDialog(annualDialog, opener)) return false;
    seenAnnual = true;
    try { sessionStorage.setItem(exitStorageKey, '1'); } catch (_) { /* Keep the in-memory guard. */ }
    return true;
  }

  $$('[data-annual-open]').forEach(button => button.addEventListener('click', () => showAnnual(button)));
  $('[data-keep-lifetime]')?.addEventListener('click', () => {
    closeDialog(annualDialog);
    $('#founding-access')?.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
  });
  $('[data-tour-pricing]')?.addEventListener('click', () => closeDialog(tourDialog));

  resourcesButton?.addEventListener('click', () => setResources(resourcesButton.getAttribute('aria-expanded') !== 'true'));
  mobileButton?.addEventListener('click', () => setNavigation(mobileButton.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('.resources')) setResources(false);
    if (!event.target.closest('.site-header')) setNavigation(false);
    if (event.target.closest('#main-nav a[href^="#"]')) setNavigation(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || topDialog()) return;
    if (resourcesButton?.getAttribute('aria-expanded') === 'true') setResources(false, true);
    else if (mobileButton?.getAttribute('aria-expanded') === 'true') setNavigation(false, true);
  });
  resourcesButton?.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault(); setResources(true); $('a', resourcesMenu)?.focus();
  });
  resourcesMenu?.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const links = $$('a', resourcesMenu);
    const index = links.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    event.preventDefault(); links[next]?.focus();
  });

  ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach(type => {
    document.addEventListener(type, () => { engaged = true; }, { once: true, passive: true });
  });
  function mayOfferOnExit() {
    return engaged && performance.now() - startedAt >= 7000 && !seenAnnual && !checkoutBusy && !topDialog() && document.visibilityState === 'visible';
  }
  document.addEventListener('mouseout', event => {
    if (desktopPointer.matches && event.relatedTarget === null && event.clientY <= 0 && mayOfferOnExit()) {
      showAnnual(document.activeElement);
    }
  });
  document.addEventListener('click', event => {
    if (desktopPointer.matches || !mayOfferOnExit() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[data-outbound]') : null;
    if (!link || link.target === '_blank' || link.hasAttribute('download') || link.closest('dialog')) return;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    const destination = new URL(raw, location.href);
    if (!['http:', 'https:'].includes(destination.protocol)) return;
    if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search) return;
    if (showAnnual(link, destination.href)) event.preventDefault();
  });

  const year = $('#copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());

  const tourTabs = $$('[data-tour-tab]');
  const tourPanel = $('#tour-panel');
  const tourImage = $('#tour-image');
  const tourCaption = $('#tour-image-caption');
  const tourList = $('#tour-detail-list');
  const researchContent = {
    label: $('#tour-detail-label')?.textContent || '',
    title: $('#tour-detail-title')?.textContent || '',
    copy: $('#tour-detail-copy')?.textContent || '',
    items: tourList ? $$('li', tourList).map(item => item.textContent) : []
  };

  function setTourTab(key, focus = false) {
    const selected = tourTabs.find(tab => tab.dataset.tourTab === key);
    if (!selected) return;
    const source = document.getElementById(`tour-content-${key}`)?.content;
    const content = key === 'research' ? researchContent : source ? {
      label: $('[data-detail-label]', source)?.textContent || '',
      title: $('[data-detail-title]', source)?.textContent || '',
      copy: $('[data-detail-copy]', source)?.textContent || '',
      items: $$('li', source).map(item => item.textContent)
    } : null;
    tourTabs.forEach(tab => {
      tab.setAttribute('aria-selected', String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
    });
    tourPanel?.setAttribute('aria-labelledby', selected.id);
    if (content) {
      ['label', 'title', 'copy'].forEach(part => {
        const target = $(`#tour-detail-${part}`);
        if (target) target.textContent = content[part];
      });
      if (tourList) tourList.replaceChildren(...content.items.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }));
    }
    // content-architecture: dynamic — image descriptions follow the selected real or illustrative screenshot.
    const live = key === 'platform';
    if (tourImage) {
      tourImage.src = live ? '/agent/assets/platform-live.png' : '/agent/assets/platform-illustrative.png';
      tourImage.alt = live
        ? 'Actual Watchdog public Uniformity Index page, showing New Jersey assessment uniformity research.'
        : 'Illustrative Watchdog Agent dashboard for a fictional property, with sample ownership, permits and value history.';
      tourImage.dataset.screenshotType = live ? 'actual-public-platform' : 'illustrative-agent-dashboard';
    }
    if (tourCaption) {
      // content-architecture: dynamic — discloses which screenshot type is selected; the public view is not presented as an Agent dashboard.
      tourCaption.textContent = live
        ? 'Actual Watchdog public Uniformity Index page (/fairness). This is public research, not an Agent dashboard.'
        : 'Illustrative Agent dashboard. The property, values and activity shown are sample data.';
    }
    if (focus) selected.focus();
    if (tourDialog?.open) animate($('.tour-detail', tourDialog), [{ opacity: 0.65, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180 });
  }

  tourTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setTourTab(tab.dataset.tourTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tourTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tourTabs.length) % tourTabs.length;
      setTourTab(tourTabs[next].dataset.tourTab, true);
    });
  });
  setTourTab('research');
  $('.tour-image-button')?.addEventListener('click', event => {
    if (!imageDialog || !tourImage) return;
    const image = $('img', imageDialog);
    const caption = $('p', imageDialog);
    if (image) { image.src = tourImage.src; image.alt = tourImage.alt; }
    if (caption) caption.textContent = tourCaption?.textContent || '';
    openDialog(imageDialog, event.currentTarget);
  });

  function notify(message) {
    const toast = $('#page-toast');
    if (!toast) return;
    (topDialog() || document.body).appendChild(toast);
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 10000);
  }

  function billingError(error) {
    // content-architecture: dynamic — checkout feedback is selected from live billing errors, not marketing content.
    const messages = {
      BILLING_ENROLLMENT_CLOSED: 'Paid enrollment is not open yet. Watchdog is finishing its launch checks.',
      BILLING_CONTROLLED_ONLY: 'Checkout is currently limited to controlled launch accounts.',
      LIFETIME_ACTIVE_SUBSCRIPTION: 'This account already has recurring billing. Manage that subscription before switching to Lifetime.',
      LIFETIME_ALREADY_ACTIVE: 'Founding Lifetime is already active on this account.',
      WATCHDOG_TEST_NO_REAL_SPEND: 'This test account cannot create a real charge.',
      SIGN_IN_REQUIRED: 'Your session has ended. Please sign in before choosing a membership.',
      PRICE_NOT_CONFIGURED: 'This billing option is not configured yet. Your account was not charged.',
      STRIPE_NOT_CONFIGURED: 'Billing is not configured yet. Your account was not charged.',
      LEGACY_SUBSCRIPTION_MIGRATION_REQUIRED: 'This account needs a billing migration. Contact Watchdog support before starting a new subscription.'
    };
    return messages[error?.code] || error?.message || 'Checkout could not open. Please try again.';
  }

  function setCheckoutBusy(busy) {
    checkoutBusy = busy;
    $$('[data-agent-lifetime-checkout], [data-agent-annual-checkout]').forEach(button => {
      button.disabled = busy;
      button.setAttribute('aria-busy', String(busy));
    });
  }

  function storePendingOffer(kind) {
    try {
      if (kind === 'lifetime') {
        sessionStorage.setItem('watchdog:lifetime:pending', 'agent');
        sessionStorage.removeItem('watchdog:billing:pending');
      } else {
        sessionStorage.setItem('watchdog:billing:pending', JSON.stringify({ tier: 'agent', cadence: 'yearly' }));
        sessionStorage.removeItem('watchdog:lifetime:pending');
      }
    } catch (_) {
      throw new Error('Allow session storage in this browser so your selected membership can continue after sign-in.');
    }
  }

  async function checkout(kind) {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    try {
      const billing = window.WatchdogBilling;
      const authClient = billing?.client?.();
      if (!authClient?.auth?.getSession || typeof billing?.invoke !== 'function' || typeof billing?.checkout !== 'function') {
        throw new Error('Secure checkout is still loading. Please try again in a moment.');
      }
      // This client-side session check selects the sign-in handoff only. The existing server billing gate remains authoritative.
      const response = await authClient.auth.getSession();
      if (response.error) throw response.error;
      if (!response.data?.session) {
        storePendingOffer(kind);
        location.assign(kind === 'lifetime' ? '/dashboard?billing=signin&offer=lifetime' : '/dashboard?billing=signin');
        return;
      }
      try {
        sessionStorage.removeItem('watchdog:lifetime:pending');
        sessionStorage.removeItem('watchdog:billing:pending');
      } catch (_) { /* Signed-in checkout does not depend on storage. */ }
      if (kind === 'lifetime') {
        const result = await billing.invoke('create-lifetime-checkout', { tier: 'agent' });
        if (!result?.url) throw new Error('A secure checkout URL was not returned. Please try again.');
        const destination = new URL(result.url, location.origin);
        if (destination.protocol !== 'https:' || destination.username || destination.password) {
          throw new Error('A secure checkout URL was not returned. Please try again.');
        }
        location.assign(destination.href);
      } else {
        // The shared client catches its own billing failures; await completion and always release our local busy state.
        await billing.checkout('agent', { cadence: 'yearly' });
        const sharedToast = $('#wd-billing-toast');
        if (sharedToast && !sharedToast.hidden && sharedToast.textContent) notify(sharedToast.textContent);
      }
    } catch (error) {
      notify(billingError(error));
    } finally {
      setCheckoutBusy(false);
    }
  }
  $$('[data-agent-lifetime-checkout]').forEach(button => button.addEventListener('click', () => checkout('lifetime')));
  $$('[data-agent-annual-checkout]').forEach(button => button.addEventListener('click', () => checkout('annual')));
  window.addEventListener('pageshow', () => setCheckoutBusy(false));

  // Details appear immediately; motion adds emphasis without hiding the initial render.
  if (!reducedMotion.matches) {
    $$('.hero-copy > *, .product-preview').forEach((element, index) => {
      animate(element, [{ opacity: 0.75, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: Math.min(index * 45, 180), duration: 420 });
    });
    const line = $('.chart-line');
    if (line?.getTotalLength) {
      const length = line.getTotalLength();
      animate(line, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], { duration: 1150, delay: 180 });
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          animate(entry.target, [{ transform: 'translateY(3px)', opacity: 0.8 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 360 });
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.25 });
      $$('.features article, .price-card').forEach(element => observer.observe(element));
    }
  }

  $$('.button, .tour-image-button').forEach(button => {
    button.addEventListener('pointerdown', () => animate(button, [{ transform: 'scale(1)' }, { transform: 'scale(.985)' }, { transform: 'scale(1)' }], { duration: 180 }));
  });
  $$('.tour-mascot img, [data-beagle]').forEach(beagle => {
    let greeting;
    const greet = () => {
      if (greeting?.playState === 'running') return;
      greeting = animate(beagle, [{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg) translateY(-2px)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' }], { duration: 620 });
    };
    beagle.addEventListener('pointerenter', greet);
    beagle.closest('button, a')?.addEventListener('focus', greet);
  });
  reducedMotion.addEventListener?.('change', event => {
    if (event.matches) document.getAnimations().forEach(animation => animation.cancel());
  });

  if (new URLSearchParams(location.search).get('preview') === 'annual') {
    showAnnual(document.activeElement);
  }
})();
