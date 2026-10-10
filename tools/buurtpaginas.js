#!/usr/bin/env node
/* ============================================================================
   Buurtpagina's — La Mia Pizzeria
   ----------------------------------------------------------------------------
   Maakt de landingspagina's per buurt (pizza-hoboken.html, …) en de pagina
   over halal pizza. Eén bron voor alles, zodat de pagina's onderling kloppen.

   Iets aanpassen (korting, minimum, uren, tekst van een buurt)?
     1. Pas het hieronder aan.
     2. Draai:  node tools/buurtpaginas.js
     3. Commit de gewijzigde .html-bestanden.

   De structured data (Restaurant) wordt uit index.html overgenomen, zodat
   adres, uren en rating op elke pagina dezelfde zijn als op de homepage.
   ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SITE = 'https://www.lamiapizzeria.be';
var ZAAK = { lat: 51.1861375, lon: 4.3874416 }; // Abdijstraat 226a

/* ---- Feiten die op elke pagina staan (houd gelijk met de webshop) ---- */
var FEIT = {
  korting: '30%',            // korting op online bestellingen voor levering
  minimum: '€ 20',           // minimum voor levering, na korting (server: MIN_ORDER)
  leverprijs: '€ 6',         // pizza's en pasta's kosten zoveel meer bij levering (order.html: PIZZA_SURCHARGE)
  straal: 8,                 // km rond de zaak (server: DELIVERY_RADIUS_KM)
  tel: '+3236442331',
  telTekst: '03 644 23 31',
  uren: [['Maandag – vrijdag', '11:30 – 02:00'], ['Zaterdag – zondag', '14:00 – 02:00']]
};

var HALAL_PIZZAS = [
  ['Pepperoni', 'Tomatensaus, mozzarella, halal pepperoni'],
  ['Godfather', 'Halal pepperoni, halal ham, halal spek'],
  ['Bronx', 'Merguez, halal pepperoni, meatballs'],
  ['Kofta', 'Kofta (gehakt), halal spek, paprika'],
  ['Shawarma', 'Paprika, rode ui, verse knoflook'],
  ['Marakesh', 'Merguez, paprika, champignons'],
  ['C & B Burger', 'Cheddar, halal spek, kofta (gehakt)'],
  ['4 Season', 'Halal salami, halal ham, paprika, champignons']
];

/* ---- De buurten ----
   punt = een herkenbaar middelpunt van de buurt, enkel om de afstand in
   vogelvlucht te berekenen. */
var BUURTEN = [
  {
    slug: 'pizza-kiel', naam: 'Kiel', postcode: '2020', postcodes: ['2020'],
    punt: { lat: 51.1880, lon: 4.3880 },
    titel: 'Pizza bezorgen in Kiel (2020) | La Mia Pizzeria',
    omschrijving: 'New York style pizza uit de Abdijstraat, midden op het Kiel. Bezorgd of afhalen, 100% halal, elke dag open tot 02:00. Online 30% korting bij levering.',
    h1: 'Pizza bezorgen op het Kiel',
    lead: 'Het Kiel is onze eigen buurt. Dichter bij de oven kan je niet wonen: bestel online voor levering, of loop even binnen in de Abdijstraat 226a en neem je pizza warm mee.',
    tekst: [
      'We zitten zelf in de Abdijstraat, dus voor wie op het Kiel woont is dit de pizzeria om de hoek. Of je nu rond het Kielpark woont, in de buurt van de Sint-Bernardsesteenweg of richting het Olympisch Stadion: je bestelling is meteen bij je.',
      'Afhalen gaat hier het snelst. Bestel online, kies afhalen en je pizza staat klaar aan de toonbank. Liever thuis blijven? Dan bezorgen we, met 30% korting op je hele online bestelling.'
    ],
    extra: ['Afhalen of bezorgen op het Kiel?', [
      'Woon je op wandelafstand, dan is afhalen vaak de beste keuze. Onze afhaaldeals gelden namelijk alleen als je zelf komt: de Familiedeal met drie large pizza\'s, de Duo\'s met twee pizza\'s, de Pasta Deal. Die vind je niet bij levering.',
      'Bezorgen loont dan weer voor een gewone bestelling van de kaart: online krijg je 30% korting op alles. Na een match in het Olympisch Stadion of een zomeravond in het Kielpark kan het nog laat: we zijn elke dag open tot 02:00.'
    ]],
    wijken: ['Abdijstraat en omgeving', 'Kielpark', 'Sint-Bernardsesteenweg', 'Rond het Olympisch Stadion', 'Kielsevest', 'Beerschot'],
    afhalen: 'Je vindt ons in de Abdijstraat 226a. Vanuit het Kiel ben je er te voet of met de fiets in een paar minuten.',
    vragen: [
      ['Kan ik ook afhalen?', 'Ja. Bestel online en kies "afhalen", of bel ons op 03 644 23 31. Je pizza staat klaar aan de Abdijstraat 226a. Afhalen kan elke dag tot 02:00.'],
      ['Kan ik ter plaatse eten?', 'Ja, je kan bij ons binnen of op het terras eten. Kom gewoon langs tijdens de openingsuren.'],
      ['Gelden de deals ook bij levering?', 'Nee, de afhaaldeals gelden enkel als je zelf komt afhalen. Bij levering krijg je wel 30% korting op je hele online bestelling van de gewone kaart.']
    ]
  },
  {
    slug: 'pizza-hoboken', naam: 'Hoboken', postcode: '2660', postcodes: ['2660'],
    punt: { lat: 51.1730, lon: 4.3470 },
    titel: 'Pizza bezorgen in Hoboken (2660) | La Mia Pizzeria',
    omschrijving: 'Pizza bestellen in Hoboken: New York style pizza, pasta en snacks, 100% halal. We bezorgen in heel Hoboken, elke dag tot 02:00. Online 30% korting bij levering.',
    h1: 'Pizza bezorgen in Hoboken',
    lead: 'Vanuit het Kiel rijden we zo Hoboken in. New York style pizza met huisgemaakt deeg, warm aan je deur, elke dag tot 02:00.',
    tekst: [
      'Hoboken ligt vlak naast ons. Via de Sint-Bernardsesteenweg zijn we snel bij je, of je nu rond de Kioskplaats woont, in Moretusburg of in Polderstad.',
      'Bestel je online voor levering, dan krijg je 30% korting op je hele bestelling. Het minimum voor levering is € 20 na korting.'
    ],
    extra: ['Van de Kioskplaats tot aan de Schelde', [
      'Hoboken is een eigen district, ten zuidwesten van het Kiel. De Sint-Bernardsesteenweg loopt van onze buurt dwars door Hoboken, en dat is ook de route van onze bezorgers. Het centrum rond de Kioskplaats en de Kapelstraat ligt op zo\'n 3 km in vogelvlucht.',
      'Ook verder richting de Schelde, in Polderstad en rond Hoboken-Polder, en in het zuiden bij Fort 8 bezorgen we gewoon. Twijfel je over je straat, vul dan je adres in de webshop in: je ziet meteen of het binnen onze zone van 8 km valt.'
    ]],
    wijken: ['Kioskplaats', 'Kapelstraat', 'Moretusburg', 'Polderstad', 'Hoboken-Polder', 'Fort 8'],
    afhalen: 'Zelf afhalen? Rij of fiets via de Sint-Bernardsesteenweg richting het Kiel; we zitten in de Abdijstraat 226a.',
    vragen: [
      ['Leveren jullie in heel Hoboken?', 'We bezorgen tot 8 km rond de zaak, en Hoboken ligt daar ruim binnen. In de webshop zie je meteen of je adres in de zone valt.'],
      ['Wat is de snelste weg om af te halen vanuit Hoboken?', 'Via de Sint-Bernardsesteenweg richting het Kiel. Daar sla je af naar de Abdijstraat; we zitten op nummer 226a.']
    ]
  },
  {
    slug: 'pizza-wilrijk', naam: 'Wilrijk', postcode: '2610', postcodes: ['2610'],
    punt: { lat: 51.1690, lon: 4.3920 },
    titel: 'Pizza bezorgen in Wilrijk (2610) | La Mia Pizzeria',
    omschrijving: 'Pizza bestellen in Wilrijk: van de Bist tot Valaar en campus Drie Eiken. New York style pizza, 100% halal, bezorgd tot 02:00. Online 30% korting bij levering.',
    h1: 'Pizza bezorgen in Wilrijk',
    lead: 'Laat studeren, laat thuis of gewoon zin in pizza? We bezorgen in Wilrijk elke dag tot 02:00, vers uit onze oven op het Kiel, een paar minuten verderop.',
    tekst: [
      'Wilrijk grenst aan het Kiel, dus we zijn er snel. We bezorgen rond de Bist, in Valaar, Neerland en Oosterveld, en ook op campus Drie Eiken van de Universiteit Antwerpen.',
      'Op kot of samen met vrienden? Onze deals met twee of drie pizza\'s, lookbrood en drank zijn gemaakt om te delen. Online bestellen voor levering geeft 30% korting op alles.'
    ],
    extra: ['Van de Bist tot Fort 6', [
      'Wilrijk is het district direct ten zuiden van ons; de Bist, het hart van Wilrijk, ligt op amper 2 km in vogelvlucht. Via de Boomsesteenweg ben je in een handomdraai bij ons.',
      'We bezorgen in heel Wilrijk: de woonwijken van Valaar en Neerland, Oosterveld, de buurt rond Fort 6 en de studentenkoten rond campus Drie Eiken. Studeer je er en bestel je met vrienden? Online bestellen voor levering geeft 30% korting op de hele bestelling.'
    ]],
    wijken: ['De Bist', 'Valaar', 'Neerland', 'Oosterveld', 'Campus Drie Eiken', 'Fort 6'],
    afhalen: 'Afhalen kan aan de Abdijstraat 226a op het Kiel, een paar minuten van Wilrijk.',
    vragen: [
      ['Leveren jullie ook op de campus of op kot?', 'Ja, zolang het adres binnen 8 km van de zaak ligt. Vul je exacte adres in, met kotnummer of gebouw in de opmerking, zodat de bezorger je meteen vindt.'],
      ['Hebben jullie deals voor een groep?', 'Ja. Kijk bij de afhaaldeals en promo\'s in de webshop: van een Duo tot de Familiedeal met drie large pizza\'s, lookbrood en frisdrank. Die deals gelden bij afhalen.']
    ]
  },
  {
    slug: 'pizza-edegem', naam: 'Edegem', postcode: '2650', postcodes: ['2650'],
    punt: { lat: 51.1560, lon: 4.4430 },
    titel: 'Pizza bezorgen in Edegem (2650) | La Mia Pizzeria',
    omschrijving: 'Ook in Edegem bezorgen we New York style pizza, pasta en snacks. 100% halal, elke dag tot 02:00. Bestel online voor levering en krijg 30% korting.',
    h1: 'Pizza bezorgen in Edegem',
    lead: 'Edegem ligt net buiten de stad, maar binnen onze bezorgzone. Bestel online en we brengen New York style pizza tot aan je deur.',
    tekst: [
      'Van Elsdonk tot Buizegem en rond het UZA: Edegem valt binnen de 8 km die we rond de zaak bezorgen. Woon je aan de uiterste rand, dan zegt de webshop je meteen of je adres binnen de zone ligt.',
      'Wie laat thuiskomt, kan bij ons nog terecht: we zijn elke dag open tot 02:00. Online bestellen voor levering geeft 30% korting op je hele bestelling.'
    ],
    extra: ['Net over de stadsgrens', [
      'Edegem is geen district van Antwerpen maar een eigen gemeente, ten zuidoosten van Wilrijk. Onze bezorgers rijden er via Wilrijk naartoe; het centrum ligt op zo\'n 5 km in vogelvlucht van de zaak. Dat is verder dan Hoboken of Berchem, maar nog ruim binnen onze zone van 8 km.',
      'Langs de Mechelsesteenweg, in Elsdonk, rond Fort 5 en Hof ter Linden en bij het UZA bezorgen we gewoon. Voor de straten helemaal aan de zuidrand van Edegem is het slim om eerst je adres in de webshop in te vullen.'
    ]],
    wijken: ['Edegem-centrum', 'Elsdonk', 'Buizegem', 'Rond het UZA', 'Fort 5', 'Mechelsesteenweg'],
    afhalen: 'Afhalen kan aan de Abdijstraat 226a in Antwerpen (2020), via Wilrijk richting het Kiel.',
    vragen: [
      ['Edegem is geen Antwerpen. Leveren jullie er toch?', 'Ja. We kijken niet naar de gemeente maar naar de afstand: alles binnen 8 km van de zaak. Het grootste deel van Edegem valt daarbinnen; de webshop controleert je adres.'],
      ['Leveren jullie aan het UZA?', 'Ja, het UZA ligt binnen onze zone. Zet in de opmerking bij je bestelling de ingang of afdeling waar de bezorger je kan treffen.']
    ]
  },
  {
    slug: 'pizza-berchem', naam: 'Berchem', postcode: '2600', postcodes: ['2600'],
    punt: { lat: 51.1993, lon: 4.4322 },
    titel: 'Pizza bezorgen in Berchem (2600) | La Mia Pizzeria',
    omschrijving: 'Pizza bestellen in Berchem: rond het station, Zurenborg en de Driekoningenstraat. New York style, 100% halal, tot 02:00. Online 30% korting bij levering.',
    h1: 'Pizza bezorgen in Berchem',
    lead: 'Van het station van Berchem tot Zurenborg: we bezorgen New York style pizza in heel Berchem, elke dag tot 02:00.',
    tekst: [
      'Berchem ligt ten oosten van ons, ruim binnen onze bezorgzone. We leveren rond het station, in de Driekoningenstraat, langs de Grote Steenweg en in het Berchemse deel van Zurenborg.',
      'Bestel online voor levering en je krijgt 30% korting op je hele bestelling. Het minimum is € 20 na korting.'
    ],
    extra: ['Rond het station en in Zurenborg', [
      'Berchem is een eigen district, op ongeveer 3,5 km in vogelvlucht van onze zaak. Het station van Berchem vormt er het middelpunt, met de Driekoningenstraat en de Grote Steenweg als drukke winkelstraten.',
      'Ook in Zurenborg, met de Cogels-Osylei en zijn opvallende herenhuizen, bezorgen we. Werk je op een kantoor rond het station? Zet de bedrijfsnaam en verdieping in de opmerking, dan vindt de bezorger je meteen.'
    ]],
    wijken: ['Station Berchem', 'Driekoningenstraat', 'Grote Steenweg', 'Zurenborg', 'Cogels-Osylei', 'Uitbreidingstraat'],
    afhalen: 'Afhalen? Je vindt ons in de Abdijstraat 226a op het Kiel, aan de zuidkant van de stad.',
    vragen: [
      ['Leveren jullie ook in Zurenborg?', 'Ja. Zurenborg ligt deels in Berchem en deels in Antwerpen, en beide delen vallen binnen onze zone van 8 km.'],
      ['Leveren jullie op kantoor rond het station?', 'Ja. Geef de bedrijfsnaam, het gebouw of de verdieping mee in de opmerking bij je bestelling.'],
      ['Loont het om vanuit Berchem zelf af te halen?', 'Dat kan, de zaak ligt op zo\'n 3,5 km in vogelvlucht. Wie afhaalt, kan kiezen uit de afhaaldeals zoals de Duo\'s en de Familiedeal; wie laat bezorgen in Berchem, krijgt online 30% korting op de gewone kaart.']
    ]
  },
  {
    slug: 'pizza-antwerpen-zuid', naam: 'Antwerpen-Zuid', postcode: '2000', postcodes: ['2000', '2018'],
    punt: { lat: 51.2089, lon: 4.3943 },
    titel: 'Pizza bezorgen op het Zuid (Antwerpen) | La Mia Pizzeria',
    omschrijving: 'Pizza bestellen op het Zuid: rond het KMSKA, de Waalse en Vlaamse Kaai en Nieuw Zuid. New York style, 100% halal, tot 02:00. Online 30% korting bij levering.',
    h1: 'Pizza bezorgen op het Zuid',
    lead: 'Het Zuid ligt op een paar minuten van onze oven. Bestel online en geniet van een New York style pizza op je appartement, je kantoor of na een avond uit.',
    tekst: [
      'Van de Leopold De Waelplaats en het KMSKA tot de Vlaamse en Waalse Kaai en de nieuwe torens van Nieuw Zuid: het hele Zuid valt binnen onze bezorgzone.',
      'We zijn elke dag open tot 02:00, dus ook laat op de avond kan je nog bestellen. Online voor levering krijg je 30% korting op je hele bestelling.'
    ],
    extra: ['Musea, kaaien en Nieuw Zuid', [
      'Het Zuid is de buurt van musea en terrassen: het KMSKA, het FOMU aan de Waalse Kaai en het M HKA liggen er op wandelafstand van elkaar. Vanuit onze zaak is het zo\'n 2,5 km in vogelvlucht.',
      'Nieuw Zuid, de nieuwe woonwijk langs de Schelde, en de appartementen rond de Gedempte Zuiderdokken horen er ook bij. Woon je in een appartementsgebouw, zet dan je bel of verdieping in de opmerking.'
    ]],
    wijken: ['Leopold De Waelplaats', 'Rond het KMSKA', 'Vlaamse Kaai', 'Waalse Kaai', 'Nieuw Zuid', 'Gedempte Zuiderdokken'],
    afhalen: 'Afhalen kan aan de Abdijstraat 226a, een paar minuten rijden of fietsen naar het zuiden.',
    vragen: [
      ['Leveren jullie ook op kantoor?', 'Ja, op elk adres binnen 8 km van de zaak. Zet de bedrijfsnaam of verdieping in de opmerking bij je bestelling.'],
      ['Kan ik na middernacht nog bestellen op het Zuid?', 'Ja. We zijn elke dag open tot 02:00, en zolang we open zijn kan je online bestellen voor levering of afhalen.']
    ]
  }
];

/* De halal-pagina: geen buurt, maar een eigen zoekintentie. */
var HALAL = {
  slug: 'halal-pizza-antwerpen',
  titel: 'Halal pizza in Antwerpen | La Mia Pizzeria',
  omschrijving: 'Al ons vlees is 100% halal: pepperoni, salami, ham, spek, kip, kofta en merguez. New York style pizza in Antwerpen, bezorgd of afhalen tot 02:00.',
  h1: 'Halal pizza in Antwerpen',
  lead: 'Bij La Mia Pizzeria hoef je niet te twijfelen: al ons vlees is 100% halal. Ook de pepperoni, salami, ham en spek.'
};

/* ============================================================================
   Hulpfuncties
   ========================================================================== */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function km(a, b) {
  var R = 6371, r = Math.PI / 180;
  var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function restaurantLd() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Geen JSON-LD gevonden in index.html');
  return JSON.parse(m[1]);
}
function ldScript(obj) {
  return '<script type="application/ld+json">\n' + JSON.stringify(obj, null, 1).replace(/</g, '\\u003c') + '\n</script>';
}

/* ============================================================================
   Opmaak (gedeeld door alle buurtpagina's)
   ========================================================================== */
var CSS = [
  "@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:swap;src:url(fonts/anton.woff2) format('woff2')}",
  "@font-face{font-family:'Manrope';font-style:normal;font-weight:400 700;font-display:swap;src:url(fonts/manrope.woff2) format('woff2')}",
  ':root{--ink:#fff;--ink-2:#fdf4ef;--panel:#fff;--line:#ebe1d9;--coral:#c0291f;--red:#c6342b;--red-dark:#a3261e;--gold:#a9741a;--yellow:#f5c518;--cream:#1b1512;--muted:#60554f;--muted-2:#8b807a;--bar-bg:rgba(255,255,255,.94);--footer-bg:#171210;--radius:16px;--sh-sm:0 6px 18px rgba(60,30,15,.09);--maxw:1080px}',
  ':root[data-theme="dark"]{--ink:#141110;--ink-2:#1d1917;--panel:#231e1b;--line:#332b26;--coral:#e5372b;--gold:#e6b24c;--cream:#f6ede0;--muted:#b6a99c;--muted-2:#8c8073;--bar-bg:rgba(20,17,16,.9);--footer-bg:#0f0c0b;--sh-sm:0 6px 18px rgba(0,0,0,.35);color-scheme:dark}',
  '*{box-sizing:border-box;margin:0;padding:0}',
  "body{font-family:'Manrope','Segoe UI',Helvetica,Arial,sans-serif;color:var(--cream);background:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}",
  "h1,h2,h3{font-family:'Anton','Arial Narrow',Impact,sans-serif;font-weight:400;letter-spacing:.5px;text-transform:uppercase;line-height:1.05}",
  'a{color:inherit}',
  '.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}',
  '.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.85rem 1.6rem;border-radius:999px;font-weight:700;font-size:.98rem;text-decoration:none;border:2px solid transparent;transition:transform .15s ease,background .15s ease}',
  '.btn:hover{transform:translateY(-2px)}',
  '.btn-yellow{background:var(--yellow);color:#1a1206}',
  '.btn-red{background:var(--red);color:#fff}.btn-red:hover{background:var(--red-dark)}',
  '.btn-ghost{color:#f6ede0;border-color:rgba(246,237,224,.5)}.btn-ghost:hover{border-color:var(--yellow);color:var(--yellow)}',
  /* header */
  'header{position:sticky;top:0;z-index:20;background:var(--bar-bg);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}',
  '.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;height:68px}',
  '.logo img{height:52px;width:auto;display:block}',
  '.nav-links{display:flex;align-items:center;gap:1.3rem}',
  '.nav-links a{font-size:.88rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;text-decoration:none}',
  '.nav-links a:hover{color:var(--gold)}',
  '.nav-links .btn{color:#1a1206;padding:.55rem 1.1rem;font-size:.85rem}',
  '@media(max-width:720px){.nav-links a.hide-m{display:none}}',
  /* hero */
  '.hero{position:relative;color:#f6ede0;text-align:center;padding:clamp(3.5rem,9vw,6.5rem) 0 clamp(3rem,8vw,5rem);background:linear-gradient(180deg,rgba(12,8,6,.62),rgba(12,8,6,.78)),url(images/hero.webp) center 40%/cover no-repeat #1b1512}',
  '.crumbs{font-size:.8rem;color:#dccdbb;margin-bottom:1.2rem}.crumbs a{color:#ffd36a;text-decoration:none}',
  ".eyebrow{display:flex;justify-content:center;align-items:center;gap:.6rem;text-transform:uppercase;letter-spacing:.26em;font-size:.72rem;font-weight:700;color:#ffd36a;margin-bottom:1rem;font-family:'Manrope','Segoe UI',Helvetica,Arial,sans-serif;line-height:1.4}",
  '.eyebrow::before,.eyebrow::after{content:"";width:30px;height:1px;background:#ffd36a;opacity:.55}',
  '.hero h1{font-size:clamp(2.5rem,7.5vw,4.8rem);color:#fff;text-shadow:0 3px 26px rgba(0,0,0,.55);margin-bottom:1rem}',
  '.hero .lead{max-width:620px;margin:0 auto 1.8rem;color:#e9dccb;font-size:1.05rem}',
  '.hero-cta{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.8rem}',
  '.chips{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;list-style:none}',
  '.chips li{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:.35rem .85rem;font-size:.84rem;font-weight:600}',
  /* secties */
  'section.blok{padding:clamp(2.8rem,7vw,4.5rem) 0}',
  'section.alt{background:var(--ink-2)}',
  '.kicker{display:block;text-transform:uppercase;letter-spacing:.22em;font-size:.72rem;font-weight:700;color:var(--red);margin-bottom:.5rem}',
  'h2{font-size:clamp(1.8rem,4.5vw,2.6rem);color:var(--coral);margin-bottom:1rem}',
  '.cols{display:grid;grid-template-columns:1.25fr 1fr;gap:clamp(1.5rem,4vw,3rem);align-items:start}',
  '@media(max-width:820px){.cols{grid-template-columns:1fr}}',
  '.prose p{margin-bottom:1rem;color:var(--cream);max-width:62ch}',
  '.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--sh-sm);padding:1.4rem 1.5rem}',
  '.card h3{font-size:1.25rem;color:var(--coral);margin-bottom:.8rem}',
  '.facts{list-style:none;display:grid;gap:.6rem}',
  '.facts li{display:flex;gap:.7rem;align-items:flex-start;font-size:.95rem}',
  '.facts b{color:var(--cream)}',
  '.wijken{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.2rem}',
  '.wijken li{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:.35rem .9rem;font-size:.88rem;font-weight:600}',
  '.pizzas{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.9rem;margin:1.2rem 0 1.6rem}',
  '.pizzas li{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem 1.1rem}',
  '.pizzas b{display:block;font-size:1.02rem;margin-bottom:.15rem}',
  '.pizzas span{color:var(--muted);font-size:.88rem}',
  '.faq{max-width:760px}',
  '.faq details{border-bottom:1px solid var(--line);padding:1rem 0}',
  '.faq summary{cursor:pointer;font-weight:700;font-size:1.02rem;list-style:none;display:flex;justify-content:space-between;gap:1rem}',
  '.faq summary::-webkit-details-marker{display:none}',
  '.faq summary::after{content:"+";color:var(--red);font-size:1.3rem;line-height:1}',
  '.faq details[open] summary::after{content:"–"}',
  '.faq details p{margin-top:.6rem;color:var(--muted)}',
  '.andere{list-style:none;display:flex;flex-wrap:wrap;gap:.6rem}',
  '.andere a{display:inline-block;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:.5rem 1rem;font-weight:600;text-decoration:none}',
  '.andere a:hover{border-color:var(--red);color:var(--red)}',
  '.uren{list-style:none;display:grid;gap:.3rem;font-size:.95rem}',
  '.uren li{display:flex;justify-content:space-between;gap:1rem}',
  '.muted{color:var(--muted)}',
  '.cta-band{background:var(--red);color:#fff;text-align:center;padding:clamp(2.5rem,6vw,3.8rem) 0}',
  '.cta-band h2{color:#fff}.cta-band p{margin:0 auto 1.4rem;max-width:560px;color:#fde8e4}',
  'footer{background:var(--footer-bg);color:#cdbfb0;text-align:center;padding:2.4rem 0;font-size:.9rem}',
  'footer img{height:80px;width:auto;margin:0 auto 1rem;display:block}',
  'footer a{color:#ffd36a;text-decoration:none}',
  'footer p+p{margin-top:.4rem}',
  '.fine{font-size:.78rem;color:#8c8073;margin-top:1rem}'
].join('\n');

/* ============================================================================
   Pagina-onderdelen
   ========================================================================== */
function kop(p) {
  return '<!DOCTYPE html>\n<html lang="nl">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<script>try{ if(localStorage.getItem(\'lamia_thema\')===\'dark\') document.documentElement.setAttribute(\'data-theme\',\'dark\'); }catch(e){}</script>\n' +
    '<title>' + esc(p.titel) + '</title>\n' +
    '<meta name="description" content="' + esc(p.omschrijving) + '">\n' +
    '<link rel="canonical" href="' + SITE + '/' + p.slug + '">\n' +
    '<link rel="icon" href="/favicon.ico" sizes="48x48">\n' +
    '<link rel="icon" type="image/png" sizes="96x96" href="images/favicon-96.png">\n' +
    '<link rel="apple-touch-icon" sizes="180x180" href="images/apple-touch-icon.png">\n' +
    '<link rel="preload" href="fonts/anton.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<meta property="og:type" content="website">\n<meta property="og:locale" content="nl_BE">\n' +
    '<meta property="og:site_name" content="La Mia Pizzeria">\n' +
    '<meta property="og:title" content="' + esc(p.h1 + ' | La Mia Pizzeria') + '">\n' +
    '<meta property="og:description" content="' + esc(p.omschrijving) + '">\n' +
    '<meta property="og:url" content="' + SITE + '/' + p.slug + '">\n' +
    '<meta property="og:image" content="' + SITE + '/images/hero.jpg">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<script src="analytics.js" defer></script>\n' +
    '<style>\n' + CSS + '\n</style>\n' +
    p.ld + '\n</head>\n<body>\n';
}

function header() {
  return '<header>\n  <div class="wrap nav">\n' +
    '    <a href="/" class="logo"><img src="images/logo.webp" alt="La Mia Pizzeria" width="559" height="447"></a>\n' +
    '    <nav class="nav-links">\n' +
    '      <a href="/#menu" class="hide-m">Menu</a>\n' +
    '      <a href="/#bezorgen" class="hide-m">Bezorggebied</a>\n' +
    '      <a href="tel:' + FEIT.tel + '" class="hide-m">' + FEIT.telTekst + '</a>\n' +
    '      <a href="order.html" class="btn btn-yellow">Bestellen</a>\n' +
    '    </nav>\n  </div>\n</header>\n';
}

function hero(p, eyebrow, crumb) {
  return '<section class="hero">\n  <div class="wrap">\n' +
    '    <p class="crumbs"><a href="/">La Mia Pizzeria</a> › ' + esc(crumb) + '</p>\n' +
    '    <h1><span class="eyebrow">' + esc(eyebrow) + '</span>' + esc(p.h1) + '</h1>\n' +
    '    <p class="lead">' + esc(p.lead) + '</p>\n' +
    '    <div class="hero-cta">\n' +
    '      <a href="order.html" class="btn btn-yellow">🛵 Bestel online</a>\n' +
    '      <a href="tel:' + FEIT.tel + '" class="btn btn-ghost">📞 ' + FEIT.telTekst + '</a>\n' +
    '    </div>\n' +
    '    <ul class="chips"><li>' + FEIT.korting + ' korting bij online levering</li><li>Afhalen of bezorgen</li><li>100% halal</li><li>Elke dag tot 02:00</li></ul>\n' +
    '  </div>\n</section>\n';
}

function feitenKaart(afstand, naam) {
  var rij = function (ic, html) { return '      <li><span>' + ic + '</span><span>' + html + '</span></li>\n'; };
  return '<div class="card">\n    <h3>Bezorgen in ' + esc(naam) + '</h3>\n    <ul class="facts">\n' +
    (afstand ? rij('📍', '<b>± ' + afstand + ' km</b> in vogelvlucht van onze zaak') : '') +
    rij('🛵', '<b>' + FEIT.korting + ' korting</b> op je hele online bestelling voor levering') +
    rij('💶', 'Minimum <b>' + FEIT.minimum + '</b> na korting; pizza en pasta hebben bij levering een leverprijs') +
    rij('🗺️', 'We bezorgen tot <b>' + FEIT.straal + ' km</b> rond de Abdijstraat') +
    rij('🕑', 'Elke dag open <b>tot 02:00</b>') +
    rij('💳', 'Online betalen met Bancontact of kaart') +
    '    </ul>\n  </div>';
}

function pizzaLijst(lijst) {
  return '<ul class="pizzas">\n' + lijst.map(function (x) {
    return '  <li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>';
  }).join('\n') + '\n</ul>\n';
}

function faqHtml(vragen) {
  return '<div class="faq">\n' + vragen.map(function (v) {
    return '  <details><summary>' + esc(v[0]) + '</summary><p>' + esc(v[1]) + '</p></details>';
  }).join('\n') + '\n</div>\n';
}

function urenKaart() {
  return '<div class="card">\n    <h3>Afhalen &amp; openingsuren</h3>\n' +
    '    <p style="margin-bottom:.8rem"><b>Abdijstraat 226a, 2020 Antwerpen</b></p>\n' +
    '    <ul class="uren">\n' + FEIT.uren.map(function (u) { return '      <li><span>' + u[0] + '</span><span>' + u[1] + '</span></li>'; }).join('\n') + '\n    </ul>\n' +
    '    <p class="muted" style="font-size:.85rem;margin-top:.8rem">Uren kunnen op feestdagen afwijken.</p>\n' +
    '    <p style="margin-top:1rem"><a href="https://www.google.com/maps/search/?api=1&amp;query=La+Mia+Pizzeria+Abdijstraat+226a+2020+Antwerpen" rel="noopener">Route via Google Maps →</a></p>\n' +
    '  </div>';
}

function andereLinks(huidig) {
  var alle = BUURTEN.map(function (b) { return [b.slug, 'Pizza in ' + b.naam]; }).concat([[HALAL.slug, 'Halal pizza']]);
  return '<ul class="andere">\n' + alle.filter(function (x) { return x[0] !== huidig; }).map(function (x) {
    return '  <li><a href="' + x[0] + '">' + esc(x[1]) + '</a></li>';
  }).join('\n') + '\n</ul>\n';
}

function staart() {
  return '<section class="cta-band">\n  <div class="wrap">\n' +
    '    <h2>Trek in een echte New York pizza?</h2>\n' +
    '    <p>Kies uit het menu, betaal online en krijg ' + FEIT.korting + ' korting als we bij je bezorgen.</p>\n' +
    '    <a href="order.html" class="btn btn-yellow">🛵 Bestel online →</a>\n' +
    '  </div>\n</section>\n' +
    '<footer>\n  <div class="wrap">\n' +
    '    <a href="/"><img src="images/logo.webp" alt="La Mia Pizzeria" width="559" height="447" loading="lazy"></a>\n' +
    '    <p>Abdijstraat 226a, 2020 Antwerpen · <a href="tel:' + FEIT.tel + '">+32 3 644 23 31</a> · info.lamiapizzeria@mail.com</p>\n' +
    '    <p><a href="/">Home</a> · <a href="/#menu">Menu</a> · <a href="order.html">Online bestellen</a> · <a href="/#bezorgen">Bezorggebied</a></p>\n' +
    '    <p class="fine">© ' + new Date().getFullYear() + ' La Mia Pizzeria · New York style pizza in Antwerpen.</p>\n' +
    '  </div>\n</footer>\n</body>\n</html>\n';
}

function gedeeldeVragen() {
  return [
    ['Wat kost bezorgen?', 'Er zijn geen aparte bezorgkosten. Pizza\'s en pasta\'s hebben bij levering wel een leverprijs (' + FEIT.leverprijs + ' meer dan bij afhalen); daarna krijg je ' + FEIT.korting + ' korting op je hele online bestelling. Het minimum voor levering is ' + FEIT.minimum + ' na korting. De webshop toont altijd de juiste prijs voor afhalen of levering.'],
    ['Is alles halal?', 'Ja, al ons vlees is 100% halal. Ook onze pepperoni, salami, ham en spek zijn halal varianten.'],
    ['Tot hoe laat kan ik bestellen?', 'Elke dag tot 02:00. Van maandag tot vrijdag zijn we open vanaf 11:30, in het weekend vanaf 14:00.']
  ];
}

function ldVoor(p, crumb, vragen, extra) {
  var r = restaurantLd();
  var graph = [r, {
    '@type': 'WebPage', '@id': SITE + '/' + p.slug, url: SITE + '/' + p.slug,
    name: p.titel, description: p.omschrijving, inLanguage: 'nl-BE',
    about: { '@id': r['@id'] }, isPartOf: { '@id': SITE + '/#website' }
  }, {
    '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'La Mia Pizzeria', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: crumb, item: SITE + '/' + p.slug }
    ]
  }, {
    '@type': 'FAQPage', mainEntity: vragen.map(function (v) {
      return { '@type': 'Question', name: v[0], acceptedAnswer: { '@type': 'Answer', text: v[1] } };
    })
  }];
  if (extra) graph.push(extra);
  delete r['@context'];
  return ldScript({ '@context': 'https://schema.org', '@graph': graph });
}

/* ============================================================================
   Pagina's bouwen
   ========================================================================== */
function buurtPagina(b) {
  var afstand = km(ZAAK, b.punt);
  afstand = afstand < 1 ? null : (Math.round(afstand * 2) / 2).toString().replace('.', ',');
  var crumb = 'Pizza bezorgen in ' + b.naam;
  // enkel de buurtvragen: de algemene vragen (halal, uren, kosten) staan op de homepage
  var vragen = b.vragen;
  b.ld = ldVoor(b, crumb, vragen);
  return kop(b) + header() + hero(b, 'New York pizza · ' + b.naam + ' ' + b.postcode, crumb) +
    '<main>\n' +
    '<section class="blok">\n  <div class="wrap cols">\n  <div class="prose">\n' +
    '    <span class="kicker">Bezorgen &amp; afhalen</span>\n' +
    '    <h2>Pizza bestellen in ' + esc(b.naam) + '</h2>\n' +
    b.tekst.map(function (t) { return '    <p>' + esc(t) + '</p>\n'; }).join('') +
    '    <ul class="wijken" aria-label="Waar we bezorgen in ' + esc(b.naam) + '">\n' +
    b.wijken.map(function (w) { return '      <li>' + esc(w) + '</li>\n'; }).join('') +
    '    </ul>\n  </div>\n  ' + feitenKaart(afstand, b.naam) + '\n  </div>\n</section>\n' +
    '<section class="blok alt">\n  <div class="wrap prose">\n' +
    '    <span class="kicker">In de buurt</span>\n' +
    '    <h2>' + esc(b.extra[0]) + '</h2>\n' +
    b.extra[1].map(function (t) { return '    <p>' + esc(t) + '</p>\n'; }).join('') +
    '    <p>' + esc(b.afhalen) + '</p>\n' +
    '  </div>\n</section>\n' +
    '<section class="blok">\n  <div class="wrap">\n' +
    '    <span class="kicker">Van ons menu</span>\n' +
    '    <h2>Wat bestel je in ' + esc(b.naam) + '?</h2>\n' +
    // De server vult dit blok met de pizza's die in deze postcodes het vaakst
    // besteld worden (server.js: populairBlok). Te weinig bestellingen → deze tekst blijft.
    '    <!--populair:' + b.postcodes.join(',') + ':' + esc(b.naam) + '-->\n' +
    '    <p class="muted" style="max-width:62ch;margin-bottom:1.4rem">New York style pizza\'s met huisgemaakt deeg in small, medium en large, en daarnaast pasta, burgers, kapsalon, snacks en desserts.</p>\n' +
    '    <!--/populair-->\n' +
    '    <a href="/#menu" class="btn btn-red">Bekijk het volledige menu met prijzen</a>\n' +
    '  </div>\n</section>\n' +
    '<section class="blok alt">\n  <div class="wrap cols">\n  <div>\n' +
    '    <span class="kicker">Veelgestelde vragen</span>\n' +
    '    <h2>Vragen uit ' + esc(b.naam) + '</h2>\n' + faqHtml(vragen) +
    '    <p class="muted" style="margin-top:1rem">Meer over halal, bezorgkosten en openingsuren: <a href="/#faq">veelgestelde vragen</a>.</p>\n' +
    '  </div>\n  <div>\n  ' + urenKaart() + '\n  </div>\n  </div>\n</section>\n' +
    '<section class="blok">\n  <div class="wrap">\n' +
    '    <span class="kicker">Ook in de buurt</span>\n    <h2>We bezorgen ook in</h2>\n' + andereLinks(b.slug) +
    '  </div>\n</section>\n</main>\n' + staart();
}

function halalPagina() {
  var p = HALAL;
  var crumb = 'Halal pizza in Antwerpen';
  var vragen = [
    ['Is echt al het vlees halal?', 'Ja. Al het vlees dat we gebruiken is halal: kip, kofta, merguez, shoarma en meatballs, maar ook de pepperoni, salami, ham en spek.'],
    ['Schenken jullie alcohol?', 'Nee. Op onze drankkaart staan frisdrank, water, ijsthee, energiedrank, ijskoffie en verse jus d\'orange.'],
    ['Hebben jullie ook vegetarische pizza\'s?', 'Ja, onder meer de Margarita, Veggie, Funghi, Italiano en Quattro Formaggi. Veganistische en glutenvrije opties zijn op aanvraag.'],
    ['Waar bezorgen jullie?', 'Tot 8 km rond de Abdijstraat: onder meer op het Kiel, in Hoboken, Wilrijk, Edegem, Berchem en op het Zuid. Online bestellen voor levering geeft ' + FEIT.korting + ' korting.']
  ].concat(gedeeldeVragen().filter(function (v) { return v[0] !== 'Is alles halal?'; }));
  p.ld = ldVoor(p, crumb, vragen);
  return kop(p) + header() + hero(p, 'New York pizza · 100% halal', crumb) +
    '<main>\n' +
    '<section class="blok">\n  <div class="wrap cols">\n  <div class="prose">\n' +
    '    <span class="kicker">100% halal</span>\n' +
    '    <h2>Halal, ook de pepperoni</h2>\n' +
    '    <p>Een New York style pizza draait om pepperoni, salami en spek. Bij veel pizzeria\'s is dat net het vlees dat niet halal is. Bij ons wel: we werken enkel met halal vlees, voor elke pizza, pasta, burger en snack op de kaart.</p>\n' +
    '    <p>Zo kies je gewoon wat je lekker vindt, zonder eerst te moeten vragen wat er precies op ligt. Op onze drankkaart staat bovendien geen alcohol.</p>\n' +
    '    <p>We bakken in de Abdijstraat in Antwerpen en bezorgen tot 8 km rond de zaak. Afhalen kan elke dag tot 02:00.</p>\n' +
    '  </div>\n  ' + feitenKaart(null, 'Antwerpen') + '\n  </div>\n</section>\n' +
    '<section class="blok alt">\n  <div class="wrap">\n' +
    '    <span class="kicker">Van ons menu</span>\n' +
    '    <h2>Pizza\'s met halal vlees</h2>\n' +
    '    <p class="muted" style="max-width:62ch">Al deze pizza\'s zijn er in small, medium en large. Een greep uit de kaart:</p>\n' +
    pizzaLijst(HALAL_PIZZAS) +
    '    <a href="/#menu" class="btn btn-red">Bekijk het volledige menu met prijzen</a>\n' +
    '  </div>\n</section>\n' +
    '<section class="blok">\n  <div class="wrap cols">\n  <div>\n' +
    '    <span class="kicker">Veelgestelde vragen</span>\n' +
    '    <h2>Over halal bij La Mia</h2>\n' + faqHtml(vragen) +
    '  </div>\n  <div>\n  ' + urenKaart() + '\n  </div>\n  </div>\n</section>\n' +
    '<section class="blok alt">\n  <div class="wrap">\n' +
    '    <span class="kicker">Bezorggebied</span>\n    <h2>Halal pizza bezorgen in</h2>\n' + andereLinks(p.slug) +
    '  </div>\n</section>\n</main>\n' + staart();
}

/* ---- Wegschrijven ---- */
var pages = BUURTEN.map(function (b) { return [b.slug, buurtPagina(b), km(ZAAK, b.punt)]; });
pages.push([HALAL.slug, halalPagina(), null]);
pages.forEach(function (x) {
  fs.writeFileSync(path.join(ROOT, x[0] + '.html'), x[1]);
  console.log(x[0] + '.html' + (x[2] != null ? '  (' + x[2].toFixed(1) + ' km)' : ''));
});

module.exports = { slugs: pages.map(function (x) { return x[0]; }) };
