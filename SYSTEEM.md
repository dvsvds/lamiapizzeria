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
| Keukenscherm | http://localhost:3000/keuken.html |
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
  met de volledige kaart (139 producten, 12 categorieën, incl. ijs).
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
- **Online bestellingen live in de kassa.** De knop **🌐 Online** toont
  binnenkomende websitebestellingen (live, met melding + geluid). Personeel kan
  ze met één tik **in de kassa laden** om af te rekenen, of afvinken. Deze
  functie activeert met de PIN; de kern van de kassa blijft zonder login en
  offline werken.

### Fase 4 — keukenscherm ✅

- **`keuken.html`**: een live keukenscherm met drie kolommen —
  **Nieuw → In bereiding → Klaar**. Elke bestelling (web én kassa) is een
  kaartje met de artikelen, opmerkingen, type/tafel en tijd-sinds-binnenkomst.
- **Live, vanzelf** via Server-Sent Events (`GET /api/events`): nieuwe
  bestellingen verschijnen direct, met een geluidssignaal en een korte
  knippering. Statuswijzigingen zijn meteen op elk keukenscherm zichtbaar.
- Eén tik zet een bon een stap verder (`PATCH /api/admin/orders/:id`);
  "Meegegeven" haalt hem van het bord.
- **Betaling ≠ keukenstatus.** Kassabonnen zijn al betaald (staat in het
  `pay`-veld); ze doorlopen de keuken toch als `nieuw` want ze moeten nog
  gemaakt worden.
- Draait op **elk toestel** met een browser (tablet, telefoon, laptop, of een
  tweede tab op de kassa). Optioneel — zonder keukenscherm werkt de rest gewoon.

### Fase 5 — rapporten & boekhouding ✅

- **`rapporten.html`**: omzetoverzicht over **web én kassa samen**, voor een
  periode (vandaag / gisteren / deze week / deze maand / een eigen datumbereik).
- Toont **omzet, aantal bestellingen, gemiddelde bon**, en uitsplitsingen per
  **betaalmethode** (cash/kaart/nog te betalen), **bron** (web/kassa),
  **type** (afhalen/leveren/ter plaatse), **categorie**, en **BTW per tarief**
  (6/12/21%).
- **BTW wordt bij elke bestelling berekend en opgeslagen** (categorie afgeleid
  uit de productnaam), zodat de cijfers altijd kloppen en snel op te tellen zijn.
- **CSV-export** (`/api/admin/export`) — één regel per bestelling met alle
  bedragen en BTW, klaar voor Excel of je boekhouder.

### API

- `GET /api/menu` — het menu (enkel beschikbare producten) — publiek
- `POST /api/orders` — bestelling plaatsen — publiek
- `POST /api/login` · `POST /api/logout` · `GET /api/session`
- `GET/POST/PUT/DELETE /api/admin/products`
- `GET/POST/PUT/DELETE /api/admin/categories`
- `GET /api/admin/orders` (voeg `?active=1` toe voor het keukenscherm) ·
  `PATCH /api/admin/orders/:id` (status)
- `GET /api/events` — live updates (Server-Sent Events) voor het keukenscherm
- `POST /api/admin/pin`

De database is de **bron van waarheid**. `lib/catalogue.js` wordt enkel gebruikt
om de database de allereerste keer te vullen.

## Roadmap (volgende fases)

- **Fase 5 — Rapporten & boekhouding.** Omzet, BTW, per betaalmethode; centraal
  bewaard en exporteerbaar — over web én kassa heen.
- **Optioneel — keukenticket printen.** In plaats van (of naast) het
  keukenscherm elke bestelling automatisch op de bonprinter laten uitkomen.

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
