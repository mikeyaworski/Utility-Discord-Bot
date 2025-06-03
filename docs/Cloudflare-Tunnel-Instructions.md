# Cloudflare Tunnel Instructions

## Overview

The goal is to use Cloudflare as a reverse proxy for the API server. This means that external requests go through Cloudflare, and then Cloudflare routes them to the API server. To do that, we need to instantiate a Cloudflare tunnel on the server, so that requests to Cloudflare can get tunneled into our server.

The API server is the API to interact with the Utility Discord Bot outside of Discord itself (e.g. on the website).

The benefit of using Cloudflare as a reverse proxy is that if you decide to run the bot on a private server (e.g. your home), you don't have to expose your public IP address to anyone except Cloudflare. This gives you a strong layer of protection against general attacks.

## Prerequisites

1. You have a domain

## Instructions

1. Create a Cloudflare account: https://www.cloudflare.com/
1. If not already done, add the root domain (e.g. `utilitydiscordbot.com`) to your account.
   - I am not providing general instructions for this. It is worth understanding the architecture if you are at this point.
   - If your domain is registered from another domain registrar, you will need to go to your domain registrar and change the nameservers to point to Cloudflare's nameservers. This is documented by Cloudflare. And then you can create your DNS records on Cloudflare (e.g. A record to your `api` subdomain).
1. Create tunnel by going to "Zero Trust" in Cloudflare's dashboard:
    - https://dash.cloudflare.com/
    - https://one.dash.cloudflare.com
1. Go to "Networks" and then "Manage Tunnels"
    - At this point, you may need to set up payment information, even if you choose the free plan.
    - URL will be something like
      ```
      https://one.dash.cloudflare.com/{YOUR_ACCOUNT_ID}/networks/tunnels
      ```
1. Create a tunnel
   1. Select Cloudflared
   1. Name your tunnel
   1. Choose "Docker" as your connector, copy the command.
   1. From that copied command on your clipboard, you have your tunnel token. Extract that and put it in your `.env` file under the variable `CLOUDFLARE_TUNNEL_TOKEN`.
   1.  Configure your "Route tunnel". Example:
      - Hostname:
        - Subdomain: `api` (Note: Do not use nested subdomains like `api.dev`, since that is not covered by the TLS wildcard rule that Cloudflare creates for you. Use `dev-api` instead, or create custom certificate rules to handle your nested subdomain).
        - Domain: `utilitydiscordbot.com`
        - Path: empty
        - Service: `HTTP`
        - URL: `utility-discord-bot:3000` (Note: This is the name of the Docker service that runs via docker-compose)
   1. Enable "Always Use HTTPS"
       1. Navigate back to the main Cloudflare dashboard
       1. Go to your domain
       1. Go to the SSL/TLS section
       1. Go to Edge Certificates. The URL will be something like
          ```
          https://dash.cloudflare.com/{YOUR_ACCOUNT_ID}/utilitydiscordbot.com/ssl-tls/edge-certificates
          ```
       1. Enable "Always Use HTTPS"
