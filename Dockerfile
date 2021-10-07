FROM node:16.6-alpine

WORKDIR /code

COPY package*.json ./

RUN apk add --no-cache python2 ffmpeg

# https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-on-alpine
# Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm install --quiet

COPY . .
