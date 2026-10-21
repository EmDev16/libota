FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install only what the server needs (the lockfile makes this reproducible)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The server reads and writes photos in /uploads (one level above the app folder)
RUN mkdir -p /uploads && chown node:node /uploads

USER node
EXPOSE 5001
CMD ["node", "server.js"]