FROM node:22-alpine
WORKDIR /app
# fonts for on-the-fly OG PNG rasterisation (@resvg/resvg-js, no browser)
RUN apk add --no-cache ttf-dejavu fontconfig
# install the single native dependency first (layer-cached)
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY data ./data
# runtime-writable dir: view counter + cached OG PNGs (bind-mounted in compose)
RUN mkdir -p /app/var
ENV PORT=10117
ENV VAR_DIR=/app/var
EXPOSE 10117
CMD ["node", "server.js"]
