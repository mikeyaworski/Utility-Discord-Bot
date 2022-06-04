#!/bin/bash

# This path will need to be changed if your repository is located elsewhere
cd /root/utility-discord-bot
docker-compose -f deploy/docker-compose.yml run certbot renew && docker-compose -f deploy/docker-compose.yml kill -s SIGHUP https-server
