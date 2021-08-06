FROM node:16.6-alpine

WORKDIR /code

COPY package*.json ./

RUN apk update && apk upgrade && \
    apk add --no-cache git

RUN npm install --quiet

COPY . .
