/* Funnelsight site script, shared by every page.
   1. Consent banner and GA4: Google's script loads only after "Accept".
   2. CTA tracking: a cta_click event in GA4, sent only with consent.
   Structured data (JSON-LD) and page-specific scripts stay in each page. */
(function () {
  var GA_ID = 'G-NG2EK7DNXQ';
  var CONSENT_KEY = 'fs_consent';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });
  gtag('js', new Date());
  gtag('config', GA_ID);

  function readConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function saveConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* private mode: choice kept for this page only */ }
  }

  var consent = readConsent();
  var banner = document.getElementById('consent-banner');

  function setConsent(granted) {
    consent = granted ? 'granted' : 'denied';
    gtag('consent', 'update', {
      'analytics_storage': consent,
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied'
    });
    saveConsent(consent);
    if (granted && !document.getElementById('ga-loader')) {
      var s = document.createElement('script');
      s.id = 'ga-loader';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      document.head.appendChild(s);
    }
    if (!granted) {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (name.indexOf('_ga') === 0) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.funnelsight.dev';
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }
      });
    }
    if (banner) banner.style.display = 'none';
  }

  if (consent === 'granted' || consent === 'denied') {
    setConsent(consent === 'granted');
  } else if (banner) {
    banner.style.display = 'flex';
  }

  var acceptBtn = document.getElementById('consent-accept');
  var declineBtn = document.getElementById('consent-decline');
  if (acceptBtn) acceptBtn.addEventListener('click', function () { setConsent(true); });
  if (declineBtn) declineBtn.addEventListener('click', function () { setConsent(false); });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'consent-reopen' && banner) banner.style.display = 'flex';
  });

  /* CTA tracking.
     A CTA is a link to /trial, a button-styled link, or the "Read next" card.
     Its location comes from a data-cta attribute if the link has one,
     otherwise from where it sits on the page, so generated pages need no
     extra markup. */
  var LOCATIONS = [
    ['.read-next', 'read-next'],
    ['nav', 'nav'],
    ['.hero', 'hero'],
    ['.cta-band', 'cta-band'],
    ['.article-cta', 'article'],
    ['footer', 'footer']
  ];

  function isCta(link) {
    var href = link.getAttribute('href') || '';
    var cls = link.className || '';
    return link.hasAttribute('data-cta') ||
      href.indexOf('/trial') === 0 ||
      /(^|\s)(btn-[\w-]+|nav-cta|read-next-card)(\s|$)/.test(cls) ||
      !!link.closest('.read-next');
  }

  function locationOf(link) {
    if (link.getAttribute('data-cta')) return link.getAttribute('data-cta');
    for (var i = 0; i < LOCATIONS.length; i++) {
      if (link.closest(LOCATIONS[i][0])) return LOCATIONS[i][1];
    }
    return 'body';
  }

  function textOf(link) {
    var title = link.querySelector('.read-next-title');
    var text = (title || link).textContent || '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  document.addEventListener('click', function (e) {
    if (consent !== 'granted') return;
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || !isCta(link)) return;
    var url;
    try { url = new URL(link.href, location.href); } catch (err) { return; }
    gtag('event', 'cta_click', {
      'cta_location': locationOf(link),
      'cta_text': textOf(link),
      'cta_destination': url.origin === location.origin ? url.pathname : url.href,
      'transport_type': 'beacon'
    });
  });
})();
