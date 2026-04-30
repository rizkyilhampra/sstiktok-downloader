# Multi-stage build for optimized production image

# Stage 1: Build frontend and compile server TypeScript
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build
RUN npm run build:server

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Copy both frontend and compiled server from builder (both live under dist/)
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "import('http').then(({default:http})=>http.get('http://localhost:3000/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}))"

CMD ["node", "dist/server/index.js"]
