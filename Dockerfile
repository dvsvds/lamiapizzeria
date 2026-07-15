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

# De database (data/lamia.db) leeft hier — mount dit als volume zodat hij
# bewaard blijft bij een herstart of nieuwe versie.
VOLUME ["/app/data"]

CMD ["node", "server.js"]
