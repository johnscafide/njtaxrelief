(() => {
  'use strict';

  function bindProfessionalCheckout() {
    let busy = false;
    let toastTimer;
    const buttons = [...document.querySelectorAll('[data-professional-lifetime-checkout], [data-professional-annual-checkout]')];
    const toast = document.getElementById('page-toast');

    function notify(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 10000);
    }

    function setBusy(value) {
      busy = value;
      buttons.forEach(button => {
        button.disabled = value;
        button.setAttribute('aria-busy', String(value));
      });
    }

    function errorMessage(error) {
      const messages = {
        BILLING_ENROLLMENT_CLOSED: 'Paid enrollment is not open yet. Watchdog is finishing its launch checks.',
        BILLING_CONTROLLED_ONLY: 'Checkout is currently limited to controlled launch accounts.',
        LIFETIME_ACTIVE_SUBSCRIPTION: 'This account already has recurring billing. Manage that subscription before switching to Lifetime.',
        LIFETIME_ALREADY_ACTIVE: 'Founding Lifetime is already active on this account.',
        WATCHDOG_TEST_NO_REAL_SPEND: 'This test account cannot create a real charge.',
        SIGN_IN_REQUIRED: 'Your session has ended. Please sign in before choosing a membership.',
        PRICE_NOT_CONFIGURED: 'This billing option is not configured yet. Your account was not charged.',
        STRIPE_NOT_CONFIGURED: 'Billing is not configured yet. Your account was not charged.'
      };
      return messages[error?.code] || error?.message || 'Checkout could not open. Please try again.';
    }

    function storePending(kind, tier) {
      if (kind === 'lifetime') {
        sessionStorage.setItem('watchdog:lifetime:pending', tier);
        sessionStorage.removeItem('watchdog:billing:pending');
      } else {
        sessionStorage.setItem('watchdog:billing:pending', JSON.stringify({ tier, cadence: 'yearly' }));
        sessionStorage.removeItem('watchdog:lifetime:pending');
      }
    }

    async function checkout(kind, tier) {
      if (busy) return;
      setBusy(true);
      try {
        const billing = window.WatchdogBilling;
        const authClient = billing?.client?.();
        if (!authClient?.auth?.getSession || typeof billing?.invoke !== 'function' || typeof billing?.checkout !== 'function') {
          throw new Error('Secure checkout is still loading. Please try again in a moment.');
        }

        const response = await authClient.auth.getSession();
        if (response.error) throw response.error;
        if (!response.data?.session) {
          storePending(kind, tier);
          location.assign(kind === 'lifetime' ? '/dashboard?billing=signin&offer=lifetime' : '/dashboard?billing=signin');
          return;
        }

        sessionStorage.removeItem('watchdog:lifetime:pending');
        sessionStorage.removeItem('watchdog:billing:pending');

        if (kind === 'lifetime') {
          const result = await billing.invoke('create-lifetime-checkout', { tier });
          if (!result?.url) throw new Error('A secure checkout URL was not returned. Please try again.');
          const destination = new URL(result.url, location.origin);
          if (destination.protocol !== 'https:' || destination.username || destination.password) {
            throw new Error('A secure checkout URL was not returned. Please try again.');
          }
          location.assign(destination.href);
        } else {
          await billing.checkout(tier, { cadence: 'yearly' });
        }
      } catch (error) {
        notify(errorMessage(error));
      } finally {
        setBusy(false);
      }
    }

    document.querySelectorAll('[data-professional-lifetime-checkout]').forEach(button => {
      button.addEventListener('click', () => checkout('lifetime', button.dataset.tier || 'pro'));
    });
    document.querySelectorAll('[data-professional-annual-checkout]').forEach(button => {
      button.addEventListener('click', () => checkout('annual', button.dataset.tier || 'pro'));
    });
    window.addEventListener('pageshow', () => setBusy(false));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindProfessionalCheckout, { once: true });
  else bindProfessionalCheckout();
})();
