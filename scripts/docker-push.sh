#!/bin/bash
tag=${1:-$(git rev-parse --short HEAD)}
imageName="mikeyaworski/utility-discord-bot:$tag"

# You may need to run: docker buildx create --use
# if this is your first time using buildx
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t $imageName --push .

# If you don't care to support multiple platform architectures,
# then use these commands instead of buildx:
# docker build -t $imageName .
# docker push $imageName
