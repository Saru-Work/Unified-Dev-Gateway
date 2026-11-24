# Production image: builds the app, then runs Next's standalone server.
# For development, run `npm run dev` outside Docker (see the README).

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci installs exactly what the lockfile says. The extra retries let a slow
# or flaky connection recover instead of failing the whole image build.
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
