FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

# npm ci installs exactly what the lockfile says. The extra retries let a slow
# or flaky connection recover instead of failing the whole image build.
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000

COPY . .

CMD ["npm", "run", "dev"]
