# Online zetten — La Mia Pizzeria systeem

Zo krijg je het systeem live, bereikbaar vanaf je kassa in de zaak en vanaf
klant-telefoons. Het is een kleine Node-app met een SQLite-database — je hebt
dus een host nodig die **Node draait** én de database **bewaart** (persistente
schijf/volume).

> Wat ik (Claude) wél en niet kan: ik heb de code volledig deploy-klaar gemaakt
> (Docker + instellingen). De laatste stap — een hostingaccount aanmaken en op
> "deploy" klikken — moet jij doen met je eigen account, want daar hangen login
> en (kleine) kosten aan vast. Hieronder staat precies wat te doen. Zeg welke
> optie je kiest, dan loods ik je er stap voor stap doorheen.

## Wat je nodig hebt

- Een **domein** (bv. `bestel.lamiapizzeria.be`) — heb je waarschijnlijk al.
- Een **host** met persistente opslag. Drie realistische opties hieronder.
- **HTTPS** (slotje) — alle opties hieronder regelen dat automatisch.

## Belangrijk vóór je live gaat

1. **Wijzig de PIN.** Standaard is die `1234`. Zet `ADMIN_PIN` op iets eigen,
   of wijzig 'm in het beheerscherm (🔑 PIN).
2. **De map `data/` moet bewaard blijven.** Daar zit je database in. Zorg dat
   die op een volume/persistente schijf staat (zie per optie).
3. **Back-up.** Kopieer `data/lamia.db` regelmatig (bv. dagelijks) naar een
   veilige plek.

## Instellingen (omgevingsvariabelen)

| Variabele | Betekenis | Standaard |
|---|---|---|
| `PORT` | Poort waarop de app luistert | `3000` |
| `ADMIN_PIN` | Beheer-PIN | `1234` |
| `DELIVERY_FEE` | Leveringskosten in euro | `3.00` |

---

## Optie A — Railway (eenvoudigst, aanrader om te starten)

1. Maak een account op **railway.app** en klik **New Project → Deploy from
   GitHub repo** → kies `dvsvds/lamiapizzeria`.
2. Railway detecteert de `Dockerfile` en bouwt automatisch.
3. Voeg een **Volume** toe en koppel het aan het pad **`/app/data`**
   (zo blijft de database bewaard).
4. Zet bij **Variables**: `ADMIN_PIN` = je eigen pin.
5. Onder **Settings → Networking**: genereer een domein, of koppel je eigen
   `bestel.lamiapizzeria.be`.
6. Klaar — open `https://<jouw-domein>/beheer.html`.

## Optie B — Render

1. Account op **render.com** → **New → Web Service** → koppel de GitHub-repo.
2. Runtime: **Docker**. Render leest de `Dockerfile`.
3. Voeg een **Disk** toe, mountpad **`/app/data`** (bv. 1 GB).
4. **Environment**: `ADMIN_PIN` = je eigen pin.
5. Deploy → je krijgt een `https://…onrender.com`-adres; eigen domein kan erbij.

## Optie C — Eigen server (VPS, bv. Hetzner ± €4/mnd) met Docker

```bash
# op de server, in de map met de code:
docker build -t lamia .
docker run -d --name lamia --restart unless-stopped \
  -p 3000:3000 \
  -v /srv/lamia-data:/app/data \
  -e ADMIN_PIN=JOUWPIN \
  lamia
```

Zet er een reverse proxy (Caddy of Nginx) voor die HTTPS regelt voor je domein.
Met **Caddy** is dat één regel in een `Caddyfile`:

```
bestel.lamiapizzeria.be {
    reverse_proxy localhost:3000
}
```

## Zonder Docker (rechtstreeks Node)

Werkt overal met **Node.js 22.5+**:

```bash
ADMIN_PIN=JOUWPIN PORT=3000 node server.js
```

Gebruik dan een procesmanager (bv. `pm2`) zodat het blijft draaien en
herstart na een reboot.

---

## Na het live gaan

- Kassa in de zaak: open `https://<domein>/pos.html` (of zet 'm in kioskmodus).
- Keuken: `https://<domein>/keuken.html` op een tablet/telefoon/tweede tab.
- Beheer/rapporten: `https://<domein>/beheer.html`.
- De publieke webshop: `https://<domein>/order.html` — link die vanaf je site
  en social media.

> Fiscale herinnering: dit systeem is (nog) geen gecertificeerde kassa (GKS/
> blackbox). Gebruik het naast je gecertificeerde kassa voor het wettelijke
> aanslaan. Zie `SYSTEEM.md`.
