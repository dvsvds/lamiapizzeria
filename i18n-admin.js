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

  // Menu-omschrijvingen (volledige zinnen) — sleutel = exacte NL-tekst
  Object.assign(DICT, {
    'Tomaat, mozzarella, basilicum': 'Tomato, mozzarella, basil',
    'Tomatensaus, mozzarella': 'Tomato sauce, mozzarella',
    'Pepperoni, salami, hete honing': 'Pepperoni, salami, hot honey',
    'Pepperoni, ham, spek': 'Pepperoni, ham, bacon',
    'Ham, ananas, rode ui': 'Ham, pineapple, red onion',
    'Kip, ananas, hete honing': 'Chicken, pineapple, hot honey',
    'Pittige rosa, mozzarella, parmezaan': 'Spicy rosé, mozzarella, parmesan',
    'Kaas, vleessaus, paprika': 'Cheese, meat sauce, bell pepper',
    'Kip, paprika, zwarte olijven, geitenkaas': 'Chicken, bell pepper, black olives, goat cheese',
    'Kip, jalapeño, paprika, corn': 'Chicken, jalapeño, bell pepper, corn',
    'Merguez, pepperoni, meatballs': 'Merguez, pepperoni, meatballs',
    'Kip, basilicumpesto, tomaten': 'Chicken, basil pesto, tomatoes',
    'Rode ui, champignons, paprika, olijven': 'Red onion, mushrooms, bell pepper, olives',
    'Kofta (gehakt), spek, paprika': 'Kofta (minced meat), bacon, bell pepper',
    'Verse tomaat, ricotta, spinazie': 'Fresh tomato, ricotta, spinach',
    'Tonijn, zwarte olijven, rode ui': 'Tuna, black olives, red onion',
    'Kip, champignons, kerriesaus': 'Chicken, mushrooms, curry sauce',
    'Kip, pepperoni, jalapeños, BBQ-saus': 'Chicken, pepperoni, jalapeños, BBQ sauce',
    'Tonijn, jalapeños, ananas': 'Tuna, jalapeños, pineapple',
    'Ham, ananas, corn': 'Ham, pineapple, corn',
    'Champignons, parmezaan': 'Mushrooms, parmesan',
    'Kip, ananas, BBQ-saus': 'Chicken, pineapple, BBQ sauce',
    'Merguez, paprika, champignons': 'Merguez, bell pepper, mushrooms',
    'Gorgonzola, kip, rode ui, pittige saus': 'Gorgonzola, chicken, red onion, spicy sauce',
    'Rode ui, paprika, BBQ-saus': 'Red onion, bell pepper, BBQ sauce',
    'BBQ-kip, spek, ananas': 'BBQ chicken, bacon, pineapple',
    'Kip, spinazie, ricotta, knoflook-roomsaus': 'Chicken, spinach, ricotta, garlic cream sauce',
    'Paprika, rode ui, verse knoflook': 'Bell pepper, red onion, fresh garlic',
    'Kip, feta, zwarte olijven, oregano': 'Chicken, feta, black olives, oregano',
    'Cheddar, spek, kofta (gehakt)': 'Cheddar, bacon, kofta (minced meat)',
    'Salami, jalapeño': 'Salami, jalapeño',
    'Kip, spinazie, paprika': 'Chicken, spinach, bell pepper',
    'Mozzarella, ricotta, gorgonzola, goudse kaas': 'Mozzarella, ricotta, gorgonzola, gouda cheese',
    'Spek, champignons, parmezaan, roomsaus': 'Bacon, mushrooms, parmesan, cream sauce',
    'Ansjovis, rode ui, zwarte olijven': 'Anchovies, red onion, black olives',
    'Salami, ham, paprika, champignons': 'Salami, ham, bell pepper, mushrooms',
    'Kerstomaten, parmezaan, rucola': 'Cherry tomatoes, parmesan, rocket',
    'Paprika, rode ui, kaas, BBQ-saus': 'Bell pepper, red onion, cheese, BBQ sauce',
    'Mozzarella, rode ui': 'Mozzarella, red onion',
    'Rode ui, zwarte olijven, zeevruchten': 'Red onion, black olives, seafood',
    'Dubbelgevouwen deeg, mozzarella, provolone': 'Folded dough, mozzarella, provolone',
    'Met ricotta, uit de steenoven': 'With ricotta, from the stone oven',
    'Champignons, tagliatelle': 'Mushrooms, tagliatelle',
    'Parmezaan, penne': 'Parmesan, penne',
    'Champignons, penne': 'Mushrooms, penne',
    'Spinazie, tagliatelle': 'Spinach, tagliatelle',
    'Pittige tomatensaus, knoflook': 'Spicy tomato sauce, garlic',
    'Tomatensaus, parmezaan': 'Tomato sauce, parmesan',
    'Champignons, mozzarella, alfredosaus': 'Mushrooms, mozzarella, alfredo sauce',
    'Groenten, creamy saus': 'Vegetables, creamy sauce',
    'Kaassaus, ham': 'Cheese sauce, ham',
    'Maïs, paprika, kaas, bbq saus': 'Corn, bell pepper, cheese, BBQ sauce',
    'Champignons, diavolosaus': 'Mushrooms, diavolo sauce',
    'Ricotta, spinazie, roomsaus': 'Ricotta, spinach, cream sauce',
    'Met salade, komkommer, tomaat & saus': 'With salad, cucumber, tomato & sauce',
    'Friet, kaas, salade & saus': 'Fries, cheese, salad & sauce',
    'Vers gebakken': 'Freshly baked',
    'Krokante kipfilet': 'Crispy chicken fillet',
    'Pikant of BBQ': 'Spicy or BBQ',
    'Met dip': 'With dip',
    'Pittig': 'Spicy',
    'Gefrituurd': 'Deep-fried',
    'Mexicaans': 'Mexican',
    'Klassieker': 'Classic',
    'Vegetarisch': 'Vegetarian',
    'Kruidige soep': 'Spiced soup',
    'Pikante worst': 'Spicy sausage',
    'Huisgemaakt met mascarpone': 'Homemade with mascarpone',
    'Romig': 'Creamy',
    'Warme chocoladebrownie': 'Warm chocolate brownie',
    'Diverse smaken': 'Various flavours',
    'Rijk aan chocolade': 'Rich in chocolate',
    'Vraag naar onze suggestie': 'Ask for our suggestion',
    'Amerikaans roomijs': 'American ice cream',
    'Premium roomijs': 'Premium ice cream',
    'Italiaans roomijs': 'Italian ice cream',
    'Nogger, Calippo & meer': 'Nogger, Calippo & more',
    'Frisdrank': 'Soft drink',
    'Plat': 'Still',
    'Sprankelend': 'Sparkling',
    'Fruitig': 'Fruity',
    'Energydrink': 'Energy drink',
    'Plat water': 'Still water',
    'Bruiswater': 'Sparkling water',
    'Water': 'Water',
    'Zuiveldrank': 'Dairy drink',
    'IJskoffie': 'Iced coffee',
    'Vers sap': 'Fresh juice',
    "3 large pizza's + 3 looksaus + 1,5L frisdrank": '3 large pizzas + 3 garlic sauce + 1.5L soft drink',
    "2 large pizza's": '2 large pizzas',
    "2 medium pizza's + 2 looksaus": '2 medium pizzas + 2 garlic sauce',
    "3 medium pizza's + 3 looksaus + 12 wings": '3 medium pizzas + 3 garlic sauce + 12 wings',
    "1 large pizza + 2 looksaus + 2 frisdrank + mozzarellastokjes": '1 large pizza + 2 garlic sauce + 2 soft drinks + mozzarella sticks',
    "4 small pizza's + 4 looksaus + 4 frisdrank": '4 small pizzas + 4 garlic sauce + 4 soft drinks',
    "2 medium pizza's + 2 looksaus + 1,5L frisdrank": '2 medium pizzas + 2 garlic sauce + 1.5L soft drink',
    "2 pasta's (kip of scampi) + 1 looksaus": '2 pastas (chicken or scampi) + 1 garlic sauce'
  });

  // Nederlandse productnamen (Italiaanse/eigennamen blijven staan)
  Object.assign(DICT, {
    'Broodje Calamari': 'Calamari sandwich', 'Broodje Falafel': 'Falafel sandwich',
    'Broodje Kafta': 'Kafta sandwich', 'Broodje Kip': 'Chicken sandwich',
    'Broodje Merguez': 'Merguez sandwich', 'Broodje Mexicano': 'Mexicano sandwich',
    'Broodje Shoarma': 'Shawarma sandwich', 'Broodje Visfilet': 'Fish fillet sandwich',
    'Calamari (7 st.)': 'Calamari (7 pcs)', 'Chicken Taquito (2 st.)': 'Chicken Taquito (2 pcs)',
    'Crispy Kipburger': 'Crispy Chicken Burger', 'Curry Kip': 'Curry Chicken',
    'BBQ Kip': 'BBQ Chicken', 'BBQ Kip Pasta': 'BBQ Chicken Pasta',
    'Falafel (4 st.)': 'Falafel (4 pcs)', 'Familiedeal': 'Family Deal',
    'Frieten Groot': 'Fries Large', 'Frieten Klein': 'Fries Small', 'Hot Kip': 'Hot Chicken',
    "IJsje (Ben & Jerry's)": "Ice cream (Ben & Jerry's)", 'Jalapeño Kaas (5 st.)': 'Jalapeño Cheese (5 pcs)',
    'Kaaskroket (2 st.)': 'Cheese croquette (2 pcs)', 'Kapsalon Kip': 'Kapsalon Chicken',
    'Kapsalon Visfilet': 'Kapsalon Fish fillet', 'Kapsalon Vlees': 'Kapsalon Meat',
    'Kass & Ham': 'Cheese & Ham', 'Keftaburger': 'Kefta Burger',
    'Kip Curry Pasta': 'Chicken Curry Pasta', 'Kip Nuggets (5 st.)': 'Chicken Nuggets (5 pcs)',
    'Kip Roomsaus': 'Chicken Cream Sauce', 'Kiptenders (3 st.)': 'Chicken Tenders (3 pcs)',
    'Knoflookbrood & Kaas': 'Garlic Bread & Cheese',
    'Lookbrood Cream Spinazie & Kaas': 'Garlic Bread Cream Spinach & Cheese',
    'Lookbrood Ham & Kaas': 'Garlic Bread Ham & Cheese', 'Lookbrood Kaas': 'Garlic Bread Cheese',
    'Lookbrood Pepperoni & Kaas': 'Garlic Bread Pepperoni & Cheese',
    'Lookbrood Pesto & Kaas': 'Garlic Bread Pesto & Cheese',
    'Moroccan Harira (soep)': 'Moroccan Harira (soup)', 'Mozzarellastokjes (5 st.)': 'Mozzarella Sticks (5 pcs)',
    'Ravioli Ricotta & Spinazie': 'Ravioli Ricotta & Spinach',
    'Scampi Basilicumroomsaus': 'Scampi Basil Cream Sauce', 'Scampi Roomsaus': 'Scampi Cream Sauce',
    'Speciaal Nagerecht': 'Special Dessert', "Verse jus d'orange": 'Fresh orange juice',
    'Visfilet op een stokje': 'Fish fillet on a stick', 'Waterijs / kinderijs': "Water ice / kids' ice"
  });

  // Losse woorden binnen samengestelde/dynamische teksten (hele woorden, veilig UI-jargon)
  var WORDS = [
    ['producten', 'products'], ['categorieën', 'categories'], ['artikels', 'items'], ['artikel', 'item'],
    ['Subtotaal', 'Subtotal'], ['Totaal', 'Total'], ['Korting', 'Discount'], ['Leveringskosten', 'Delivery fee'],
    ['waarvan', 'of which'], ['stuk', 'each'], ['Tafel', 'Table'], ['afgerekende', 'settled'],
    ['afgerekend', 'settled'], ['geparkeerd', 'parked'], ['geopend', 'opened'], ['toegevoegd', 'added'],
    ['Sessie sinds openen', 'Session since opening'], ['Wisselgeld', 'Change'], ['Ontvangen', 'Received'],
    ['Leveren', 'Delivery'], ['Afhalen', 'Takeaway']
  ];

  var NORM = {};
  Object.keys(DICT).forEach(function (k) { NORM[k.trim().toLowerCase()] = DICT[k]; });

  function trPhrase(s) {
    var k = s.trim().toLowerCase();
    var v = NORM[k];
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
