FROM node:20

# Create app directory
WORKDIR /usr/src/app

# Install deps first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci

# Copy source (in dev we still bind mount, but this allows running without it)
COPY . .

EXPOSE 4000
CMD ["npm", "run", "dev"]
