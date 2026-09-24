/* ============================================================================
   LA MIA PIZZERIA — Google Analytics (GA4) + Google Tag Manager, met
   cookie-toestemming
   ----------------------------------------------------------------------------
   Dit script staat op de publieke pagina's (index.html en order.html).

   Twee Google-koppelingen, elk apart aan of uit te zetten:
     - Google Analytics 4 (meet-ID G-…): meet bezoekers en de belangrijkste
       kliks. Zit rechtstreeks op de site.
     - Google Tag Manager (container-ID GTM-…): gereedschapskist om later
       extra meetscripts toe te voegen (Meta-pixel, TikTok-pixel, Google
       Ads) zonder de code van de site aan te passen.
       ▶ Zet in Tag Manager GÉÉN Analytics-tag: Analytics zit al rechtstreeks
         op de site; anders wordt elk bezoek dubbel geteld.

   De ID's komen van de server (`window.LAMIA_GA` en `window.LAMIA_GTM`, uit
   de omgevingsvariabelen GA_MEASUREMENT_ID en GTM_CONTAINER_ID; `uit`
   schakelt uit) of, zonder server, van de standaardwaarden hieronder.

   Privacy (België/EU): statistiek- en marketingcookies mogen pas ná
   toestemming. Daarom:
     1. Google Consent Mode v2 start op "denied" (geen cookies, geen opslag).
        Dat geldt voor Analytics én voor alle Google-tags in Tag Manager.
     2. Een klein bannertje vraagt toestemming; de keuze wordt onthouden.
     3. Bij "Oké" gaat de toestemming naar "granted". Bij "Liever niet"
        blijft alles uit.
     Niet-Google-tags in Tag Manager (Meta, TikTok) luisteren niet vanzelf
     naar Consent Mode: geef die in Tag Manager bij "Toestemmingsinstellingen"
     de vereiste toestemming `ad_storage` mee, of laat ze afgaan op de
     gebeurtenis `toestemming_gegeven` die dit script stuurt.
   ========================================================================== */
(function () {
  'use strict';
  var STANDAARD_GA = 'G-KEFEYWN9YG';
  var STANDAARD_GTM = '';   // wordt ingevuld zodra de Tag Manager-container bestaat
  var GA = ('LAMIA_GA' in window) ? window.LAMIA_GA : STANDAARD_GA;
  var GTM = ('LAMIA_GTM' in window) ? window.LAMIA_GTM : STANDAARD_GTM;
  if (!GA || !/^G-[A-Z0-9]+$/i.test(GA)) GA = '';
  if (!GTM || !/^GTM-[A-Z0-9]+$/i.test(GTM)) GTM = '';
  if (!GA && !GTM) return;

  var KEY = 'lamia_cookies';           // 'ja' | 'nee'
  function keuze() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function bewaar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /* ---- dataLayer + consent standaard geweigerd, vóór er iets laadt ---- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });

  function laad(src) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  /* ---- Google Analytics 4, rechtstreeks ---- */
  if (GA) {
    gtag('js', new Date());
    gtag('config', GA, { anonymize_ip: true, send_page_view: true });
    laad('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA));
  }

  /* ---- Google Tag Manager ---- */
  if (GTM) {
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    laad('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM));
  }

  function toestemming(ja) {
    gtag('consent', 'update', {
      analytics_storage: ja ? 'granted' : 'denied',
      ad_storage: ja ? 'granted' : 'denied',
      ad_user_data: ja ? 'granted' : 'denied',
      ad_personalization: ja ? 'granted' : 'denied'
    });
    // voor niet-Google-tags in Tag Manager (trigger: aangepaste gebeurtenis)
    window.dataLayer.push({ event: ja ? 'toestemming_gegeven' : 'toestemming_geweigerd' });
  }

  /* ---- een paar nuttige gebeurtenissen: naar Analytics én naar Tag Manager ---- */
  function meet(naam, params) {
    if (GA) gtag('event', naam, params || {});
    if (GTM) window.dataLayer.push(Object.assign({ event: naam }, params || {}));
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) meet('bellen', { plaats: a.textContent.trim().slice(0, 40) });
    else if (/order(\.html)?(\?|#|$)/.test(href)) meet('bestel_klik', { plaats: (a.className || a.textContent).trim().slice(0, 40) });
  });
  if (/[?&]betaald=/.test(location.search)) meet('bestelling_betaald');

  /* ---- toestemmingsbanner ---- */
  var eerder = keuze();
  if (eerder === 'ja') { toestemming(true); return; }
  if (eerder === 'nee') { toestemming(false); return; }

  function en() { return document.documentElement.getAttribute('data-lang') === 'en'; }
  var T = en() ? {
    txt: 'We use a few cookies to see how the site is used, so we can make it better.',
    ja: 'OK', nee: 'No thanks'
  } : {
    txt: 'We gebruiken enkele cookies om te zien hoe de site gebruikt wordt, zodat we ze beter kunnen maken.',
    ja: 'Oké', nee: 'Liever niet'
  };

  var css = document.createElement('style');
  css.textContent =
    '.cookie-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;' +
    'display:flex;flex-wrap:wrap;gap:.6rem .9rem;align-items:center;justify-content:space-between;' +
    'padding:.85rem 1rem;border-radius:14px;background:var(--panel,#fff);color:var(--cream,#1b1512);' +
    'border:1px solid var(--line,#e6ded7);box-shadow:0 12px 32px rgba(0,0,0,.18);font:600 .88rem/1.4 inherit}' +
    '.cookie-bar p{margin:0;flex:1 1 240px}' +
    '.cookie-bar .cb-btns{display:flex;gap:.5rem}' +
    '.cookie-bar button{cursor:pointer;border-radius:999px;padding:.5rem .95rem;font:inherit;font-weight:800;border:1px solid var(--line,#e6ded7);background:transparent;color:inherit}' +
    '.cookie-bar button.ja{background:var(--red,#c0291f);border-color:var(--red,#c0291f);color:#fff}' +
    '@media (prefers-reduced-motion:no-preference){.cookie-bar{animation:cb-in .35s ease-out}}' +
    '@keyframes cb-in{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}';
  document.head.appendChild(css);

  var bar = document.createElement('div');
  bar.className = 'cookie-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookies');
  bar.innerHTML = '<p></p><div class="cb-btns"><button type="button" class="nee"></button><button type="button" class="ja"></button></div>';
  bar.querySelector('p').textContent = T.txt;
  bar.querySelector('.nee').textContent = T.nee;
  bar.querySelector('.ja').textContent = T.ja;
  bar.querySelector('.ja').addEventListener('click', function () { bewaar('ja'); toestemming(true); bar.remove(); });
  bar.querySelector('.nee').addEventListener('click', function () { bewaar('nee'); toestemming(false); bar.remove(); });
  document.body.appendChild(bar);

  /* keuze opnieuw kunnen maken (bv. later via een "Cookies"-link):  window.lamiaCookies.reset() */
  window.lamiaCookies = { reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); } };
})();
