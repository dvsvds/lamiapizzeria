# La Mia Pizzeria — eigen bestel- & kassasysteem

Dit is de start van ons **eigen systeem**, dat stap voor stap OrderBuddy vervangt
voor alles rond bestellen, menu, keuken en rapporten. Alles draait in je eigen
repo, zonder externe abonnementen.

> **Belangrijk (fiscaal).** In België is een **geregistreerde kassa (GKS) met
> blackbox/FDM** verplicht boven €25.000 horeca-omzet. Dit systeem is (nog) niet
> gecertificeerd en mag de officiële kassa dus **niet** vervangen voor het
> wettelijke aanslaan. Gebruik het naast je gecertificeerde kassa; we ontwerpen
> het "blackbox-ready" zodat een certificering later gekoppeld kan worden.

## Snel starten

Vereist: **Node.js 22.5 of nieuwer** (bevat de ingebouwde database — geen
`npm install` nodig).

```bash
node server.js
```

Dan openen:

| Onderdeel | Adres |
|---|---|
| Beheer (menu & prijzen) | http://localhost:3000/beheer.html |
| Webshop (klant) | http://localhost:3000/order.html |
| Kassa (personeel) | http://localhost:3000/pos.html |
| Website | http://localhost:3000/ |

Andere poort of PIN:

```bash
PORT=8080 ADMIN_PIN=4321 node server.js
```

De beheer-PIN is standaard **1234** (wijzig 'm meteen via de knop **🔑 PIN** in
het beheerscherm).

## Wat er nu werkt

### Fase 1 — centraal menu & prijzen ✅

- **Database** (`data/lamia.db`, SQLite). Bij de eerste start automatisch gevuld
  met de volledige kaart (115 producten, 11 categorieën).
- **Beheerscherm** `beheer.html`: producten en prijzen bewerken, toevoegen en
  verwijderen, maten voor pizza's, een product tijdelijk op **onbeschikbaar**
  zetten ("uitverkocht"), labels (Populair/Aanrader), afbeelding kiezen, en
  categorieën beheren.

### Fase 2 — webshop gekoppeld ✅

- **`order.html`** haalt het menu nu **live uit de database** (`/api/menu`). Pas
  je in het beheerscherm een prijs aan of zet je iets op onbeschikbaar, dan zie
  je dat meteen in de webshop. (Zonder server valt de pagina terug op de
  ingebakken kaart, zodat ze altijd blijft werken.)
- Bestellingen worden via **`POST /api/orders`** in de database opgeslagen met
  een bestelnummer (bv. `LM-0007`), klantgegevens, artikelen en totalen.
  Leveringskosten worden serverzijde toegevoegd.

### Fase 3 — kassa gekoppeld ✅

- **`pos.html`** gebruikt nu **hetzelfde live menu** uit de database als de
  webshop (met dezelfde fallback op de ingebakken kaart).
- Elke afgerekende bon wordt naar de **centrale bestellijst** gestuurd
  (`source = pos`, nummer `K-0007`), inclusief korting en betaalwijze
  (cash/kaart/split). Zo staan balie- én online-bestellingen in dezelfde lijst
  (`GET /api/admin/orders`) — de basis voor het keukenscherm.
- De kassa blijft volledig werken als de server even wegvalt: alles staat ook
  lokaal (localStorage) en het versturen gebeurt "best effort".

### API

- `GET /api/menu` — het menu (enkel beschikbare producten) — publiek
- `POST /api/orders` — bestelling plaatsen — publiek
- `POST /api/login` · `POST /api/logout` · `GET /api/session`
- `GET/POST/PUT/DELETE /api/admin/products`
- `GET/POST/PUT/DELETE /api/admin/categories`
- `GET /api/admin/orders` · `PATCH /api/admin/orders/:id` (status)
- `POST /api/admin/pin`

De database is de **bron van waarheid**. `lib/catalogue.js` wordt enkel gebruikt
om de database de allereerste keer te vullen.

## Roadmap (volgende fases)

- **Fase 4 — Keukenscherm.** Nieuwe bestellingen (web + kassa) verschijnen live
  in de keuken. De `orders`-tabel en `/api/admin/orders` liggen hiervoor al
  klaar.
- **Fase 5 — Rapporten & boekhouding.** Omzet, BTW, per betaalmethode; centraal
  bewaard en exporteerbaar — over web én kassa heen.

> Let op — promoties (deals) worden in de webshop nu als één artikel toegevoegd;
> de keuze van welke pizza's in een deal zitten bespreek je bij de
> bevestiging. Een pizza-kiezer per deal kan later terugkomen als we
> deal-samenstelling in de database opnemen.

## Mappen

```
server.js         Backend (Node, ingebouwde http + sqlite) — geen dependencies
lib/catalogue.js  Canonieke kaart (enkel voor de eerste seed)
beheer.html       Beheerscherm menu & prijzen
order.html        Webshop (klant)          — wordt in fase 2 gekoppeld
pos.html          Kassa (personeel)        — wordt in fase 3 gekoppeld
index.html        Publieke website
images/           Foto's
data/             Database + sessiesleutel (staat in .gitignore, hoort niet in git)
```
