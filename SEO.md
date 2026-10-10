# SEO & Google-koppelingen — La Mia Pizzeria

Alles wat de site nodig heeft om goed gevonden te worden en om Google Analytics,
Google Search Console en het Google Bedrijfsprofiel te koppelen. De code is
klaar; de accounts moet je zelf aanmaken (daar hangt je Google-login aan vast).
Elke stap hieronder duurt hooguit een paar minuten.

## Wat er al in de code zit

| Onderdeel | Wat het doet |
|---|---|
| `robots.txt` | Zegt Google welke pagina's mogen: de website en de webshop. Beheer, kassa, keuken en rapporten worden geweerd. |
| `sitemap.xml` | Lijst van de publieke pagina's (met foto's) die je in Search Console indient. De server maakt hem automatisch; er staat ook een statische versie in de repo voor hosting zonder server (Netlify). |
| Structured data (JSON-LD) | Vertelt Google wat je bent (restaurant), adres, uren, telefoon, menu en dat er online besteld kan worden. Daarmee kan Google een "Bestellen"-knop en je uren tonen. |
| Social preview | Deel je de site op Instagram/Facebook/WhatsApp, dan verschijnt de hero-foto met titel en tekst (`og:image`). |
| Webshop-pagina | Eigen titel, omschrijving en canonical (was een kopie van de homepage). |
| Favicon & app-icoon | Het logo in het tabblad en op het startscherm van een telefoon. |
| Snelheid | Het hero-logo ging van 1,3 MB naar 36 KB (WebP), pagina's worden gecomprimeerd (gzip), foto's blijven 7 dagen in de cache. Snelheid telt mee in de Google-ranking. |
| Snelheid (okt 2026) | Alle foto's als WebP, kaartfoto's op 800 px (± 70% kleiner). De hero-video (1,3 MB) laadt pas nadat de pagina klaar is, en niet bij spaarstand of 2G. HTML met `no-cache` i.p.v. `no-store`, zodat de terugknop meteen werkt. Lighthouse mobiel: 4,8 → 2,6 MB, Speed Index 3,6 → 1,9 s. De JPG's blijven bestaan voor social previews en de sitemap. |
| Koppen | De H1 bevat nu "New York pizza · Antwerpen" (homepage en webshop); de webshop-H1 is Nederlands ("Bestel je pizza online"). |
| Interne pagina's | Kassa, keuken, beheer en rapporten krijgen naast `robots.txt` ook de header `X-Robots-Tag: noindex`. |
| Analytics-script | `analytics.js` laadt Google Analytics en Google Tag Manager **pas na toestemming** via een klein cookie-bannertje (verplicht in België/EU). |

Je zet de Google-koppelingen aan met **omgevingsvariabelen** (Railway → je
service → *Variables*). Geen codewijziging nodig.

| Variabele | Wat | Voorbeeld |
|---|---|---|
| `SITE_URL` | Publiek adres van de site, zonder slash | `https://www.lamiapizzeria.be` |
| `GA_MEASUREMENT_ID` | Google Analytics 4 meet-ID. Staat al in de code (`G-KEFEYWN9YG`); enkel invullen om te overschrijven, of `uit` om Analytics uit te zetten | `G-KEFEYWN9YG` |
| `GOOGLE_SITE_VERIFICATION` | Verificatiecode van Search Console (de `content`-waarde van de metatag) | `x7Kq…` |
| `GTM_CONTAINER_ID` | Google Tag Manager container-ID. Standaard staat in `analytics.js`; enkel invullen om te overschrijven, of `uit` om Tag Manager uit te zetten | `GTM-ABC1234` |

Na het toevoegen van een variabele herstart Railway de app automatisch.

> **Hosting (nagekeken 22/09/2026):** `www.lamiapizzeria.be` wijst naar Railway;
> `lamiapizzeria.be` zonder www is een doorverwijzing van one.com naar www; de
> Netlify-site *lamiapizza1* heeft geen domein en is enkel een voorvertoning.
>
> **Draait de website ooit op Netlify (statisch, zonder server)?** Dan werken de
> omgevingsvariabelen niet. De Analytics-ID staat daarom óók vast in
> `analytics.js`, en `robots.txt` en `sitemap.xml` staan als bestanden in de
> repo. De Search Console-verificatie gebeurt dan via DNS of door de metatag
> rechtstreeks in `index.html` te zetten.

## Stap 1 — Google Analytics 4 (bezoekers meten)

1. Ga naar **analytics.google.com** en log in met het Google-account van de zaak.
2. **Beheren** (tandwiel, linksonder) → **Property maken**. Naam: *La Mia Pizzeria*,
   tijdzone *België*, valuta *Euro*.
3. Kies als platform **Web** en vul de site-URL in. Je krijgt een **meet-ID**
   dat begint met `G-`.
4. ✅ Gedaan op 22/09/2026: property *webmakers → lamiapizzeria.be*, meet-ID
   `G-KEFEYWN9YG`, vast in `server.js`. Een andere ID? Zet `GA_MEASUREMENT_ID`
   op Railway.
5. Controle: open de site, klik **Oké** in het cookie-bannertje, en kijk in
   Analytics onder **Rapporten → Realtime**. Je ziet jezelf binnen een minuut.

Wat je meet, naast de standaardcijfers (bezoekers, pagina's, herkomst, toestel):

| Gebeurtenis | Wanneer |
|---|---|
| `bestel_klik` | Iemand klikt op een "Bestel online"-knop |
| `bellen` | Iemand tikt op het telefoonnummer |
| `bestelling_betaald` | Iemand komt terug van een geslaagde online betaling |

Tip: markeer `bestelling_betaald` in Analytics als **conversie**
(Beheren → Gebeurtenissen → schakelaar "Markeren als conversie"). Dan zie je
meteen welke kanalen (Google, Instagram, …) échte bestellingen opleveren.

## Stap 2 — Google Search Console (hoe Google je site ziet)

1. Ga naar **search.google.com/search-console** → **Property toevoegen**.
2. Kies **URL-voorvoegsel** en vul `https://www.lamiapizzeria.be/` in, **mét
   www** (exact het adres uit `SITE_URL`). De site draait op www; het adres
   zonder www is enkel een doorverwijzing bij one.com.
3. ✅ Gedaan op 22/09/2026 via de methode **HTML-bestand**: het bestand
   `google37c42a199dcaa681.html` staat in de repo en wordt door de server
   geserveerd. Klik in Search Console op **Verifiëren** zodra de site
   bijgewerkt is.
   *(Alternatief, mocht dat ooit nodig zijn: kies **HTML-tag**, kopieer de
   waarde bij `content` en zet die op Railway als `GOOGLE_SITE_VERIFICATION`.)*
4. Verificatie mislukt? Open
   `https://www.lamiapizzeria.be/google37c42a199dcaa681.html` in je browser;
   je moet één regel tekst zien. Zie je die niet, dan is de nieuwe versie nog
   niet live.
5. ✅ Gedaan op 24/09/2026: property `https://www.lamiapizzeria.be/`
   geverifieerd en `sitemap.xml` ingediend (status Succesvol, 2 pagina's).
   Twee oudere, niet-geverifieerde properties zonder www staan er nog; die
   doen niets en mogen weg via Instellingen → Property verwijderen.
6. Vraag indexering aan: plak `https://www.lamiapizzeria.be/` in de zoekbalk
   bovenaan → **Indexering aanvragen**. Doe hetzelfde voor `/order.html`.

Na een paar dagen zie je hier op welke zoektermen je verschijnt ("pizza
antwerpen", "pizza kiel", …), welke pagina's klikken krijgen en of Google
problemen ziet. **Verbeteringen → Core Web Vitals** toont de snelheid zoals
Google ze meet.

Analytics en Search Console koppelen: in Analytics → **Beheren → Product-
koppelingen → Search Console** → je property kiezen. Dan zie je zoektermen ook
in Analytics.

## Stap 2b — Google Tag Manager (voor pixels en advertenties)

Tag Manager is een gereedschapskist: één keer op de site gezet, daarna voeg
je via tagmanager.google.com meetscripts toe (Meta-pixel voor Instagram en
Facebook, TikTok-pixel, Google Ads-conversies) zonder de code aan te raken.

1. Ga naar **tagmanager.google.com** → **Account maken**. Accountnaam
   *La Mia Pizzeria*, land *België*. Containernaam `www.lamiapizzeria.be`,
   platform **Web**.
2. ✅ Gedaan op 24/09/2026: container `www.lamiapizzeria.be`, ID
   `GTM-5FHH9C9J`, vast in `analytics.js` (zet `GTM_CONTAINER_ID` op Railway
   om te overschrijven, of `uit` om Tag Manager uit te zetten).
3. Het installatievenster met de twee codefragmenten mag je sluiten: de site
   laadt Tag Manager zelf, mét cookie-toestemming.

**Belangrijk**

- Zet in Tag Manager **géén Google Analytics-tag**. Analytics zit al
  rechtstreeks op de site; met een tweede tag telt elk bezoek dubbel.
- Google-tags (Google Ads, Floodlight) luisteren automatisch naar de
  cookie-toestemming van de site (Consent Mode v2).
- Niet-Google-tags (Meta, TikTok) doen dat niet vanzelf. Geef ze in Tag
  Manager bij **Toestemmingsinstellingen** de vereiste toestemming
  `ad_storage`, of laat ze pas afgaan op de gebeurtenis
  `toestemming_gegeven`.
- Deze gebeurtenissen zijn beschikbaar als trigger (Aangepaste gebeurtenis):
  `bestel_klik`, `bellen`, `bestelling_betaald`, `toestemming_gegeven`,
  `toestemming_geweigerd`.
- Controleren: **Voorbeeld** (Preview) in Tag Manager → site-URL invullen →
  je ziet welke tags afgaan bij welke klik.

## Stap 3 — Google Bedrijfsprofiel (de kaart en het vakje rechts in Google)

Voor een pizzeria is dit de belangrijkste van de drie: hier komen de meeste
"in de buurt"-klanten vandaan.

1. Ga naar **business.google.com** en claim (of open) *La Mia Pizzeria,
   Abdijstraat 226a, 2020 Antwerpen*.
2. Zet de **website** op `https://www.lamiapizzeria.be` en de
   **bestellink** (menu / online bestellen) op `https://www.lamiapizzeria.be/order.html`.
   Zo krijgt je profiel een "Online bestellen"-knop die naar je eigen webshop
   gaat in plaats van naar een bezorgplatform.
3. Controleer dat de **openingsuren** exact overeenkomen met de site
   (ma–vr 11:30–02:00, za–zo 14:00–02:00) en zet feestdaguren als die afwijken.
4. Vul **kenmerken** in: afhalen, levering, halal, betaalmiddelen.
5. Upload regelmatig foto's en beantwoord reviews — dat weegt zwaar in de
   lokale ranking.

Voeg een UTM-code toe aan de website-link in je profiel om in Analytics te
zien wat uit Google Maps komt: `https://www.lamiapizzeria.be/?utm_source=google&utm_medium=bedrijfsprofiel`.

## Stap 4 — controleren

- **Structured data**: plak `https://www.lamiapizzeria.be/` in
  **search.google.com/test/rich-results**. Verwacht: *Restaurant* zonder fouten.
- **Social preview**: **developers.facebook.com/tools/debug** → URL invullen →
  je ziet de hero-foto en de titel.
- **Snelheid**: **pagespeed.web.dev** → URL invullen. Kijk vooral naar de
  mobiele score.
- **robots & sitemap**: open `https://www.lamiapizzeria.be/robots.txt` en
  `https://www.lamiapizzeria.be/sitemap.xml` in de browser.

## Buurtpagina's (okt 2026)

Eén pagina per buurt plus één over halal, zodat Google de zaak toont bij
"pizza + buurt"-zoekopdrachten en niet enkel op de eigen naam:

`/pizza-kiel` · `/pizza-hoboken` · `/pizza-wilrijk` · `/pizza-edegem` ·
`/pizza-berchem` · `/pizza-antwerpen-zuid` · `/halal-pizza-antwerpen`

- Ze worden gemaakt door `tools/buurtpaginas.js`. **Pas de tekst of de feiten
  (korting, minimum, uren) daar aan** en draai `node tools/buurtpaginas.js`;
  bewerk de .html-bestanden niet met de hand.
- Adres, uren en rating in de structured data komen uit `index.html`. Na een
  wijziging daar het script opnieuw draaien.
- De server vindt de pagina's vanzelf: ze krijgen Analytics en komen in
  `/sitemap.xml`. Een nieuwe buurt toevoegen = een blok in `BUURTEN` erbij.
- De homepage linkt naar alle buurten (sectie Bezorgen) en naar de
  halal-pagina (onder het menu).
- **Na de livegang:** in Search Console bij elke nieuwe URL *Indexering
  aanvragen*, en de sitemap opnieuw indienen.
- Wordt de korting van 30% ooit stopgezet, pas `FEIT.korting` aan én de
  zinnen in `BUURTEN` die ze noemen.

## Lokale SEO (okt 2026)

- **Buurtpagina's uniek gemaakt** (was 32–44%, nu 60–67% unieke tekst): per
  buurt een eigen sectie "In de buurt", eigen vragen, en de algemene vragen
  staan enkel nog op de homepage (`/#faq`).
- **"Wat bestel je in …?"**: de server vult dit op elke buurtpagina met de 5
  pizza's die het vaakst geleverd worden naar die postcode(s), de laatste 4
  maanden (`populairHtml()` in server.js; minimum 8 bestellingen, anders vaste
  tekst). Enkel namen, geen aantallen of klantgegevens.
- **Menu-schema** (`Menu` → `MenuSection` → `MenuItem` met prijzen per maat)
  op homepage en webshop, live uit de database (`menuLd()` in server.js).
- **Socials verwijderd** uit footer en structured data: de accounts
  `facebook.com/lamiapizzeria` (Zweedse zaak) en `instagram.com/lamiapizzeria`
  ("La Mia Pizza & Wings") waren niet van de zaak. Echte accounts later
  toevoegen in `sameAs` (index.html + order.html) en in de footer.
- Volledige analyse: `LOCAL-SEO-ANALYSE-lamiapizzeria.be.md` in de map
  boven de repo (C:/Users/m/lamiapizzeria).

## Structured data (schema-check okt 2026)

- Homepage: `Restaurant` + `WebSite` (sitenaam "La Mia Pizzeria") + `FAQPage`.
- Bestelpagina: `Restaurant` (zelfde blok als de homepage; wijzig beide).
- Buurtpagina's: `Restaurant` (overgenomen uit index.html), `WebPage`,
  `BreadcrumbList`, `FAQPage`.
- Geen `aggregateRating`, zie hierboven. FAQ-uitklappers toont Google sinds mei
  2026 niet meer; het FAQ-schema blijft voor AI-assistenten.
- Controle: search.google.com/test/rich-results → "Lokaal bedrijf" en
  "Broodkruimelpaden" zonder fouten.

## AI-zoekmachines (ChatGPT, Perplexity, Gemini) — okt 2026

- **`/llms.txt`**: samenvatting voor AI-assistenten (feiten, uren, bezorgregels,
  pagina's en het volledige menu met prijzen). De server maakt hem live uit de
  database, dus prijzen uit beheer kloppen altijd. Vaste tekst: `llmsTxt()` in
  `server.js`.
- **FAQ op de homepage** (`#faq`) met FAQPage-structured data: halal, soort
  pizza, bezorggebied, kosten, uren, online betalen, vegetarisch.
- **Leverprijs eerlijk vermeld**: pizza en pasta kosten bij levering € 6 meer
  (`PIZZA_SURCHARGE` in `order.html`), daarna 30% korting. Wijzigt dat, pas
  dan ook `FEIT.leverprijs` (tools/buurtpaginas.js), `llmsTxt()` en de
  homepage-FAQ aan.
- Alle AI-crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, …) mogen
  de site lezen.

**Buiten de site (weegt het zwaarst).** AI-antwoorden komen vooral uit gidsen:

| Waar | Wat |
|---|---|
| Bing Webmaster Tools | Site importeren uit Search Console (ChatGPT/Copilot zoeken via Bing) |
| intravel.net | Profiel claimen; omschrijving "100% halal New York style pizza"; drive-thru en buffet weg |
| wanderlog.com | Omschrijving gaat over een La Mia in Great Neck (VS) en link is `/#/`; melden |
| Google Bedrijfsprofiel | ✅ 10/10/2026: uren op 02:00; hoofdcategorie Pizzeria + extra categorieën (pizzabezorging, afhaal, halal, Italiaans) |
| TripAdvisor, Bing Places, Apple Maps | Profiel aanmaken, zelfde naam/adres/uren |
| tablejourney.com (halal Antwerpen) | Vermelding aanvragen |

Zoektest 10/10/2026: La Mia komt niet voor bij "beste pizza Antwerpen",
"halal pizza Antwerpen" of "pizza bezorgen Hoboken". Herhaal maandelijks.

## Volgende stappen (nog niet gedaan)

- **Meer tekst per gerecht/categorie.** De foto's van de deals en secties zijn
  nu CSS-achtergronden; Google ziet ze niet als afbeeldingen. Echte `<img>`-tags
  met alt-tekst zouden ook Google Afbeeldingen voeden.
- **Engelse versie op een eigen URL.** De EN-knop wisselt de taal in de
  browser; Google indexeert enkel het Nederlands. Wil je ook Engelstalige
  bezoekers via Google, dan moet EN een eigen adres krijgen (bv. `/en/`) met
  `hreflang`.
- **Reviews op de site.** De rating 4,7 (260 Google-reviews) staat als
  zichtbare tekst op de homepage; werk die af en toe bij. Bewust **niet** in de
  structured data: Google staat geen ratings toe die van een andere site komen.

## Metingen (elke 1e en 15e van de maand)

Bron: Search Console → Prestaties, en Analytics → Home. Schermfoto's van de
manager; vergelijk telkens met de vorige rij.

| Datum | Periode | Klikken | Vertoningen | Positie | Analytics: gebruikers (7 d) | Opmerkingen |
|---|---|---|---|---|---|---|
| 01/10/2026 | 23–28 sep (7 d) | 10 | 7.350 | 2,4 | 24 | Nulmeting. 6.720 vertoningen op het losse woord "pizza" zonder klik (groot blok, niet bruikbaar). Klikken enkel op de eigen naam. "pizza antwerpen" 30 vertoningen / 0 klikken, "pasta" 102 / 0, "takeaway" 19 / 0, "pizza in hoboken" 1 / 1. Favicon zichtbaar in Google. Bedrijfsprofiel ingevuld. Google Ads nog niet gestart. Actie: bezorggebied-sectie met buurten (PR #79). |
