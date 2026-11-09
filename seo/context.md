# Context — La Mia Pizzeria (voor de SEO-autopilot)

Elk feit met zijn bron. Bij twijfel wint de code/de webshop, nooit dit bestand.

## Wat het is
- Pizzeria in Antwerpen-Zuid (Kiel), **Abdijstraat 226a, 2020 Antwerpen**, tel. +32 3 644 23 31 (index.html, JSON-LD Restaurant).
- New York style pizza met huisgemaakt deeg, in small/medium/large; daarnaast pasta, burgers, kapsalon, wings, snacks, desserts (index.html #menu; lib/catalogue.js).
- **Al het vlees is 100% halal**, ook pepperoni, salami, ham en spek; geen alcohol (index.html FAQ; halal-pizza-antwerpen.html).
- Ter plaatse eten kan, binnen of op het terras (index.html #bezoek, tags "Terras").

## Wie koopt
- Buurtbewoners van Kiel/Hoboken/Wilrijk/Antwerpen-Zuid die 's avonds en 's nachts pizza willen, afhalen of bezorgd (Search Console 4–31 okt 2026: 141 van 148 klikken op de homepage; zoektermen vooral de merknaam, daarna "pizza antwerpen", "pizza hoboken").
- Halal-publiek (FAQ, reviews op Google noemen halal).
- Groepen: afhaaldeals voor 2–4 personen (order.html, categorie promo).

## Prijzen en regels (bron: order.html en server.js, nov 2026)
- Pizza's vanaf € 8 (Margherita small; lib/catalogue.js). Pepperoni/Soprano/Godfather medium € 12,50.
- Afhaaldeals, enkel bij afhaal: Duo Large € 21, Duo Medium € 21, Solo Large € 21, Duo Deluxe € 26, Pasta Deal € 26, Familiedeal € 40, Trio + Wings € 45, Small Party € 50 (order.html PROMOS; tools/buurtpaginas.js AFHAALDEALS).
- Levering: geen aparte bezorgkosten; pizza en pasta kosten bij levering € 6 meer (order.html PIZZA_SURCHARGE), daarna **10% korting** op de hele online bestelling (order.html DISCOUNT). Minimum **€ 20** na korting (server.js MIN_ORDER). Bezorgstraal **8 km** rond de zaak (server.js DELIVERY_RADIUS_KM).
- Betalen: online met Bancontact of kaart (Mollie, server.js); in de zaak cash of kaart (llms.txt in server.js).
- Openingsuren (Google Bedrijfsprofiel, overgenomen 18/10/2026): ma–do 15:00–02:00, vr 14:30–02:00, za 14:00–02:00, zo 14:00–01:30 (index.html, server.js isOpenNow).

## Conversie
- Doel: online bestelling betaald = Analytics-event `bestelling_betaald` (analytics.js). Hulpdoelen: `bestel_klik`, `bellen`.
- 4–31 okt 2026: 150 sessies, 109× bestel_klik, 8× bestelling_betaald, 5× bellen (GA4 via Windsor, meting 01/11 in SEO.md).

## Hoe de site werkt
- Zero-dependency Node-server (server.js) + statische HTML. Publieke pagina's: `/`, `/order.html`, en de gegenereerde pagina's uit `tools/buurtpaginas.js` (6 buurten, halal, take away). **Nieuwe pagina's maak je in die generator**, niet met de hand.
- Titels/meta/canonical staan in de HTML zelf; sitemap en robots komen uit server.js (`sitemapXml`, `robotsTxt`); structured data (Restaurant, FAQPage, WebPage, BreadcrumbList) in de HTML; `llms.txt` uit server.js.
- Analytics: GA4 G-KEFEYWN9YG + GTM via analytics.js met toestemmingsbanner (consent mode).
- Deploy: Railway via Dockerfile; merge op main = live. Ship mode: **PR for review** (de eigenaar/manager zegt "merge hem").

## Concurrenten (bron: OpenSEO Maps-SERP 18/10/2026 vanaf de zaak; rank grid 18/10; organische SERP 02/11/2026)
- Maps "pizza antwerpen" vanaf de zaak: La Mia #1 (4,7 ★, 271 reviews), **Pizza Service Abdijstraat** #2, **Pitza Service Kiel** #8.
- Winnaars per buurt in het kaartblok (rank grid 3 km): **Il Carro** (noordwest en zuidoost), **Pizza Lesta** (west/Hoboken), **Péti'do** (noord, zuidwest), Pizza 2018 (noordoost), Pitazza (oost/Berchem), Pizza Sara (zuid/Wilrijk).
- Organisch (niet-lokaal, BE): lijstjes-sites winnen: visit.antwerpen.be, tripadvisor.be, ubereats.com, takeaway.com, somsookheimwee.be, antwerppizza.com; eigen pizzeria-sites zelden in de top 20.

## Wat we NIET kunnen vanuit de agent-omgeving
- De live site, Google en concurrentensites zijn vanuit de cloud-sessie niet bereikbaar (netwerkbeperking). Controles gebeuren op een lokale kopie van dezelfde code. Posities komen uit Search Console (OpenSEO-koppeling, gratis) en OpenSEO-SERP-checks (credits).
