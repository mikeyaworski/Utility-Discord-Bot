#!/bin/bash
tag=${1:-$(git rev-parse --short HEAD)}
imageName="mikeyaworski/utility-discord-bot:$tag"

docker build -t $imageName .
docker push $imageName
