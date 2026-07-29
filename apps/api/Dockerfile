FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
# Sources are not in the image yet, so workspace build hooks run later.
RUN npm ci --ignore-scripts

FROM deps AS dev
COPY . .
RUN npm run build -w @travel-crm/sdk \
  && npx prisma generate --schema apps/api/prisma/schema.prisma
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run db:seed -w @travel-crm/api && npm run dev -w @travel-crm/api"]
