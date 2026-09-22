/* ============================================================================
   LA MIA PIZZERIA — Google Analytics (GA4) met cookie-toestemming
   ----------------------------------------------------------------------------
   Dit script staat op de publieke pagina's (index.html en order.html) en doet
   niets zolang de server geen meet-ID meegeeft. De server zet die ID in
   `window.LAMIA_GA` wanneer de omgevingsvariabele GA_MEASUREMENT_ID is
   ingevuld (bv. G-ABC123XYZ). Zo hoeft er nooit code te wijzigen om
   Analytics aan of uit te zetten.

   Privacy (België/EU): statistiek-cookies mogen pas ná toestemming. Daarom:
     1. Google Consent Mode v2 start op "denied" (geen cookies, geen opslag).
     2. Een klein bannertje vraagt toestemming; de keuze wordt onthouden.
     3. Bij "Oké" wordt de toestemming naar "granted" gezet en meet GA gewoon.
        Bij "Liever niet" blijft alles uit (GA krijgt enkel cookieloze pings,
        zonder identificatie — dat is hoe Consent Mode werkt).
   ========================================================================== */
(function () {
  'use strict';
  var ID = window.LAMIA_GA;
  if (!ID || !/^G-[A-Z0-9]+$/i.test(ID)) return;

  var KEY = 'lamia_cookies';           // 'ja' | 'nee'
  function keuze() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function bewaar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /* ---- gtag-basis: consent standaard geweigerd, dan pas de loader ---- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });
  gtag('js', new Date());
  gtag('config', ID, { anonymize_ip: true, send_page_view: true });

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
  document.head.appendChild(s);

  function toestemming(ja) {
    gtag('consent', 'update', { analytics_storage: ja ? 'granted' : 'denied' });
  }

  /* ---- een paar nuttige gebeurtenissen, naast wat GA zelf al meet ---- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) gtag('event', 'bellen', { plaats: a.textContent.trim().slice(0, 40) });
    else if (/order(\.html)?(\?|#|$)/.test(href)) gtag('event', 'bestel_klik', { plaats: (a.className || a.textContent).trim().slice(0, 40) });
  });
  if (/[?&]betaald=/.test(location.search)) gtag('event', 'bestelling_betaald');

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
  bar.setAttribute('aria-label', en() ? 'Cookies' : 'Cookies');
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
