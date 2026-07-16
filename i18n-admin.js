/* ============================================================================
   La Mia Pizzeria — taalknop (NL/EN) voor de personeelsschermen
   (beheer, kassa, keuken, rapporten).

   Werkwijze: één gedeeld woordenboek. In EN-modus vertaalt dit script de
   interface-teksten in de DOM (statisch én dynamisch aangemaakt via een
   MutationObserver). Productnamen en categorieën die je zelf beheert blijven
   staan zoals ingevoerd. Wisselen herlaadt de pagina (schone staat).
   Insluiten met:  <script src="i18n-admin.js"></script>  (vóór </body>)
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'lamia_admin_lang';
  var lang = 'nl';
  try { lang = localStorage.getItem(KEY) || 'nl'; } catch (e) {}

  // Volledige zinnen (sleutel = Nederlandse tekst, kleine letters + getrimd)
  var DICT = {
    // --- kop / navigatie ---
    'beheer': 'Management', 'kassa · pos': 'Register · POS', 'keuken': 'Kitchen', 'rapporten': 'Reports',
    'live · voedt site & kassa': 'Live · feeds site & register',
    '🛒 webshop': '🛒 Webshop', '🧾 kassa': '🧾 Register', '🍳 keuken': '🍳 Kitchen', '📊 rapporten': '📊 Reports',
    '🔑 pin': '🔑 PIN', 'uitloggen': 'Log out', '↩ site': '↩ Site',
    '🌐 online': '🌐 Online', '🅿️ geparkeerd': '🅿️ Parked', '📊 dagrapport': '📊 Day report',
    '⛶ scherm': '⛶ Screen', '⛶ verlaat': '⛶ Exit', 'terug naar site': 'Back to site',
    // --- login ---
    'log in met je pin om het menu te beheren.': 'Log in with your PIN to manage the menu.',
    'log in met je pin om het keukenscherm te openen.': 'Log in with your PIN to open the kitchen screen.',
    'log in met je pin.': 'Log in with your PIN.',
    'inloggen': 'Log in', 'verkeerde pin': 'Wrong PIN',
    // --- beheer ---
    'menu & prijzen': 'Menu & prices', 'zoek product…': 'Search product…', 'alle categorieën': 'All categories',
    '＋ product': '＋ Product', '＋ categorie': '＋ Category', 'bewerk': 'Edit', 'verwijder': 'Delete',
    'product': 'Product', 'nieuw product': 'New product', 'product bewerken': 'Edit product',
    'naam': 'Name', 'omschrijving': 'Description', 'categorie': 'Category', 'type': 'Type',
    'enkel (vaste prijs)': 'Single (fixed price)', 'pizza (s/m/l)': 'Pizza (S/M/L)', 'pasta': 'Pasta', 'drank': 'Drink',
    'prijs (€)': 'Price (€)', 'referentieprijs (€)': 'Reference price (€)',
    'small (€)': 'Small (€)', 'medium (€)': 'Medium (€)', 'large (€)': 'Large (€)',
    'label (optioneel)': 'Label (optional)', 'beschikbaar': 'Available', 'ja': 'Yes', 'nee': 'No',
    'afbeelding (webshop)': 'Image (webshop)', 'opslaan': 'Save',
    'nieuwe categorie': 'New category', 'categorie bewerken': 'Edit category',
    'id (technisch, a-z)': 'Id (technical, a-z)', 'kleur': 'Color', 'btw-soort': 'VAT type', 'eten': 'Food',
    'pin wijzigen': 'Change PIN', 'nieuwe pin (4–8 cijfers)': 'New PIN (4–8 digits)',
    'pizza': 'Pizza', 'pizza — slice': 'Pizza — slice', 'burger / broodje': 'Burger / sandwich',
    'snacks / friet / kapsalon': 'Snacks / fries / kapsalon', 'dessert': 'Dessert', 'promo': 'Deal',
    'product toegevoegd': 'Product added', 'opgeslagen': 'Saved', 'verwijderd': 'Deleted',
    'categorie opgeslagen': 'Category saved', 'categorie verwijderd': 'Category removed',
    'pin gewijzigd': 'PIN changed', 'weer beschikbaar': 'Available again', 'op onbeschikbaar gezet': 'Set to unavailable',
    'geen producten gevonden.': 'No products found.',
    // --- kassa ---
    'bestelling': 'Order', 'nog geen artikels.': 'No items yet.',
    'tik links op een product om te starten.': 'Tap a product on the left to start.',
    'ter plaatse': 'Dine-in', 'afhalen': 'Takeaway', 'leveren': 'Delivery', 'tafel': 'Table',
    'subtotaal': 'Subtotal', 'korting': 'Discount', 'leveringskosten': 'Delivery fee', 'totaal': 'Total',
    '🗑 wissen': '🗑 Clear', '% korting': '% Discount', '🅿️ parkeren': '🅿️ Park', 'afrekenen': 'Checkout',
    'toevoegen': 'Add', 'opties': 'options', 'formaat': 'Size', 'extra toppings': 'Extra toppings',
    'saus': 'Sauce', 'extra': 'Extra', 'opmerking': 'Note', 'verwijder': 'remove',
    'geparkeerde bons': 'Parked orders', 'geen geparkeerde bons.': 'No parked orders.',
    'openen': 'Open', '🌐 online bestellingen': '🌐 Online orders', 'online bestellingen': 'Online orders',
    'geen nieuwe online bestellingen.': 'No new online orders.', 'laad in kassa': 'Load into register', 'afvinken': 'Dismiss',
    'te betalen': 'To pay', 'cash': 'Cash', 'kaart': 'Card', 'split': 'Split',
    'ontvangen': 'Received', 'wisselgeld': 'Change', 'nog te betalen': 'Still to pay', 'gepast': 'Exact',
    'bevestig betaling': 'Confirm payment',
    'reken het volledige bedrag af op de kaartterminal en bevestig hieronder.': 'Charge the full amount on the card terminal and confirm below.',
    'vul het cash-deel in; de rest gaat op kaart.': 'Enter the cash part; the rest goes on card.',
    'korting': 'Discount', 'toepassen': 'Apply', 'geen': 'None',
    'kies een percentage óf een vast bedrag. vul één veld in.': 'Choose a percentage OR a fixed amount. Fill in one field.',
    'percentage %': 'Percentage %', 'of bedrag €': 'or Amount €',
    'dagrapport': 'Day report', '🖨 print x-rapport': '🖨 Print X report', '🔒 dag afsluiten (z)': '🔒 Close day (Z)',
    'omzet (incl. btw)': 'Turnover (incl. VAT)', 'aantal bons': 'Number of orders',
    'je mandje is leeg. voeg iets toe uit het menu.': 'Your basket is empty. Add something from the menu.',
    // --- keuken ---
    'verbinden…': 'connecting…', 'live': 'live', 'offline': 'offline',
    'nieuw': 'New', 'in bereiding': 'In progress', 'klaar': 'Ready',
    'geen nieuwe bestellingen': 'No new orders', 'niets in bereiding': 'Nothing in progress', 'niets klaar': 'Nothing ready',
    'start ▸': 'Start ▸', 'klaar ✓': 'Ready ✓', 'meegegeven': 'Handed over',
    '🍽 ter plaatse': '🍽 Dine-in', '🥡 afhalen': '🥡 Takeaway', '🛵 leveren': '🛵 Delivery',
    'web': 'Web', 'kassa': 'Register',
    // --- rapporten ---
    'vandaag': 'Today', 'gisteren': 'Yesterday', 'deze week': 'This week', 'deze maand': 'This month', 'toon': 'Show',
    '⬇ export csv': '⬇ Export CSV', 'aantal bestellingen': 'Number of orders', 'gemiddelde bon': 'Average ticket',
    '💳 per betaalmethode': '💳 By payment method', '💵 cash': '💵 Cash', '💳 kaart': '💳 Card',
    '⏳ bij afhaling/levering': '⏳ On pickup/delivery', '🧾 web vs. kassa': '🧾 Web vs. register',
    '🛒 webshop': '🛒 Webshop', '🧾 kassa': '🧾 Register',
    '📦 per type': '📦 By type', '🍽 ter plaatse': '🍽 Dine-in', '🥡 afhalen': '🥡 Takeaway', '🛵 leveren': '🛵 Delivery',
    'waarvan leveringskosten': 'of which delivery fees', 'korting gegeven': 'discount given',
    '🧮 btw (in de omzet begrepen)': '🧮 VAT (included in turnover)', 'btw 6%': 'VAT 6%', 'btw 12%': 'VAT 12%', 'btw 21%': 'VAT 21%',
    'totaal btw': 'Total VAT', '🍕 omzet per categorie': '🍕 Turnover per category',
    'geen bestellingen in deze periode.': 'No orders in this period.',
    // --- standaard categorielabels ---
    'alles': 'All', "pizza's": 'Pizzas', "pasta's": 'Pastas', 'burgers': 'Burgers', 'broodjes': 'Sandwiches',
    'kapsalon': 'Kapsalon', 'lookbrood': 'Garlic bread', 'snacks': 'Snacks', 'frieten': 'Fries',
    'desserts': 'Desserts', 'ijs': 'Ice cream', 'drankjes': 'Drinks', "promo's": 'Deals'
  };

  // Losse woorden binnen samengestelde/dynamische teksten (hele woorden, veilig UI-jargon)
  var WORDS = [
    ['producten', 'products'], ['categorieën', 'categories'], ['artikels', 'items'], ['artikel', 'item'],
    ['Subtotaal', 'Subtotal'], ['Totaal', 'Total'], ['Korting', 'Discount'], ['Leveringskosten', 'Delivery fee'],
    ['waarvan', 'of which'], ['stuk', 'each'], ['Tafel', 'Table'], ['afgerekende', 'settled'],
    ['afgerekend', 'settled'], ['geparkeerd', 'parked'], ['geopend', 'opened'], ['toegevoegd', 'added'],
    ['Sessie sinds openen', 'Session since opening'], ['Wisselgeld', 'Change'], ['Ontvangen', 'Received'],
    ['Leveren', 'Delivery'], ['Afhalen', 'Takeaway']
  ];

  function trPhrase(s) {
    var k = s.trim().toLowerCase();
    var v = DICT[k];
    if (v == null) return null;
    // behoud voor- en na-spaties van het originele tekstknooppunt
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + v + trail;
  }
  function trWords(s) {
    var out = s, changed = false;
    for (var i = 0; i < WORDS.length; i++) {
      var re = new RegExp('\\b' + WORDS[i][0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      if (re.test(out)) { out = out.replace(re, WORDS[i][1]); changed = true; }
    }
    return changed ? out : null;
  }

  function translateTextNode(t) {
    var val = t.nodeValue;
    if (!val || !val.trim()) return;
    var p = trPhrase(val);
    if (p !== null) { if (p !== val) t.nodeValue = p; return; }
    var w = trWords(val);
    if (w !== null) t.nodeValue = w;
  }
  function translateEl(el) {
    if (el.nodeType === 3) { translateTextNode(el); return; }
    if (el.nodeType !== 1) return;
    if (el.id === 'btnLang') return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n, nodes = [];
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateTextNode);
    var attrs = el.querySelectorAll ? el.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    [].forEach.call(attrs, function (e) {
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        if (e.hasAttribute(a)) { var v = trPhrase(e.getAttribute(a)); if (v !== null) e.setAttribute(a, v); }
      });
    });
  }

  var observer = null;
  function startObserver() {
    if (!window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      observer.disconnect();
      muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (node) { translateEl(node); }); });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function translateAll() { translateEl(document.body); startObserver(); }

  function injectButton() {
    var ref = document.getElementById('btnTheme') || document.querySelector('header .tbtn, .topbar .tbtn');
    if (!ref) return;
    var b = document.createElement('button');
    b.id = 'btnLang';
    b.className = ref.className || 'tbtn';
    b.textContent = lang === 'en' ? 'NL' : 'EN';
    b.title = 'Nederlands / English';
    ref.parentNode.insertBefore(b, ref);
    b.addEventListener('click', function () {
      try { localStorage.setItem(KEY, lang === 'en' ? 'nl' : 'en'); } catch (e) {}
      location.reload();
    });
  }

  function init() { injectButton(); if (lang === 'en') translateAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
