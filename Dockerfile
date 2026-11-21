FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/scene/package.json packages/scene/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY apps/desktop/package.json apps/desktop/package.json
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY . .
RUN npm run build
FROM nginx:1.28-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
