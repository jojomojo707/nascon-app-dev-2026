# Backend API and worker image. node:20-alpine is the runtime from the organizers' pre-pulled bundle.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
EXPOSE 8080
CMD ["node", "src/server.js"]
