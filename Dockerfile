# La Mia Pizzeria — systeem (zero-dependency Node app)
# Bouwen:  docker build -t lamia .
# Draaien: docker run -d -p 3000:3000 -v lamia-data:/app/data -e ADMIN_PIN=1234 lamia
FROM node:22-alpine

WORKDIR /app
COPY . .

# Geen 'npm install' nodig: de app draait volledig op ingebouwde Node-modules.

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# De database leeft in /app/data. De app maakt die map zelf aan.
# Om ze te bewaren bij een herstart/nieuwe versie: koppel een volume op /app/data.
#   - Railway: voeg een "Volume" toe met mount-pad /app/data (geen VOLUME-regel hier;
#     Railway weigert de Docker VOLUME-instructie).
#   - Docker lokaal/VPS: draai met  -v lamia-data:/app/data

CMD ["node", "server.js"]
