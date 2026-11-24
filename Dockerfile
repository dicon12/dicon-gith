# DICON GITH Production Dockerfile
# The app has no npm dependencies (server.js uses only Node built-ins), so there is nothing to install;
# `npm ci` would fail here anyway because package-lock.json is not committed.
FROM node:22-alpine

WORKDIR /usr/src/app

COPY . .

ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server.js"]
