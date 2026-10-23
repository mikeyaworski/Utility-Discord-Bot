# Pinned to Alpine 3.23 (musl 1.2.5) because @discordjs/opus@0.10.0 only publishes
# prebuilt binaries up to Node 22 (ABI v127) and for musl 1.2.5. Any other combination
# falls back to a source build, which fails on arm64.
FROM node:22.23.4-alpine3.23

WORKDIR /code

RUN apk add --no-cache python3 ffmpeg alpine-sdk autoconf automake g++ libtool

COPY package*.json ./

# https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-on-alpine
# Puppeteer
# "puppeteer": "^10.4.0",
# "puppeteer-cluster": "^0.22.0",
# RUN apk add --no-cache \
#       chromium \
#       nss \
#       freetype \
#       harfbuzz \
#       ca-certificates \
#       ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm ci --quiet

COPY . .

CMD ["npm", "start"]
