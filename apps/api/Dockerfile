FROM node:20

# Create app directory
WORKDIR /usr/src/app

# PDF extraction support for uploaded training manuals.
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

# Install deps first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci

# Copy source (in dev we still bind mount, but this allows running without it)
COPY . .

EXPOSE 4000
CMD ["npm", "run", "dev"]
