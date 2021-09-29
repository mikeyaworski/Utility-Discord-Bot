FROM node:16.6-alpine

WORKDIR /code

COPY package*.json ./

RUN apk update && apk upgrade && \
    apk add --no-cache git && \
    apk add --no-cache python2 && \
    apk add --no-cache ffmpeg

RUN npm install --quiet

COPY . .
