FROM node:20 AS base

# Create app directory
WORKDIR /usr/src/app

# PDF extraction support for uploaded training manuals, including OCR fallback.
RUN apt-get update && apt-get install -y poppler-utils tesseract-ocr && rm -rf /var/lib/apt/lists/*

# Install deps first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci

# Copy source once for all targets.
COPY . .

EXPOSE 4000

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm run build && npm prune --omit=dev

FROM node:20 AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y poppler-utils tesseract-ocr && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 4000
CMD ["npm", "run", "start"]
