# Hosting it on a Digital Ocean Droplet

These instructions describe a process for manually hosting the bot on a Digital Ocean Droplet. This will not have automated deployments.

## Startup

1. Follow the [general instructions](./General-Instructions.md) to create your bot and collect your environment variables that will be needed later.

1. Create a PostgreSQL database somewhere (probably Supabase) and collect your database URL. You can find instructions on how to create a PostgreSQL database on Supabase [here](./Supabase-Instructions.md).

1. If you plan to use Cloudflare to expose the API to the internet (as a reverse proxy), follow the [Cloudflare Tunnel instructions](./Cloudflare-Tunnel-Instructions.md) to create your tunnel configuration and get your tunnel token (which you can put into the `.env` file).

1. Choose a Linux distrubution, e.g. Ubuntu. The supported platforms are `linux/amd64`, `linux/arm64`, and `linux/arm/v7`. The rest of the instructions assume you chose **Ubuntu**.

1. For the cheapest viable option, choose a shared CPU (Basic), with the cheaper processor and no volumes. Choose whatever datacenter you want, leave the VPC network to default, and preferrably use SSH keys for authentication (follow their instructions). You won't need to manually SSH into the droplet, so adding authentication is optional.

1. Click on your droplet, go to Access and then click "Launch Droplet Console" to connect your droplet on the web. You can SSH into your droplet manually if you want, but this is unnecessary work.

1. Assuming you chose Ubuntu for your distribution, Git will already be installed and you will have access to `apt`. If you use another distribution, you may need to install this software in different ways (e.g. your distribution may not have APT). At the end of the day, you need to have Docker installed and running. NPM and Git are optional, but they allow you to conveniently run scripts from the Git repo. So we will make sure all three are installed.
   ```
   apt install docker.io npm docker-compose
   ```

1. As previously mentioned, this is optional, but useful. If you skip this step, you must replace `npm run ...` in all future steps with whatever that script actually does.
    ```
    git clone https://github.com/mikeyaworski/utility-discord-bot.git
    cd utility-discord-bot
    ```

1. Pull the latest Docker image.
    ```
    cd ~/utility-discord-bot
    npm run docker-pull
    ```
    Or, if you want to use a specific Docker image (other than `latest`), find the tag from https://hub.docker.com/repository/docker/mikeyaworski/utility-discord-bot and use this command, where `...` is the tag you want to use:
    ```
    docker pull mikeyaworski/utility-discord-bot:...
    ```
    If you are wanting to use a specific tag, you will also need to update the `start:docker` script to use that tag.

1. Create a `.env` file with all of the environment variables filled in. This means your secrets are written to the instance's disk. If this is a security concern for you, then there are alternative ways to define secrets, but are more effort.

    You can see the structure of the `.env` file [here](../README.md#environment-variables). Make sure to replace the `DATABASE_URL` value with whatever your hosted database URL is (probably Supabase from the instructions linked in step 2). The example environment variables show values for local development, so several of them will need to be changed for the deployment.

    If unfamiliar with the command line, here are instructions to create the `.env` file using vim:

    1. Create it on your local computer and copy the contents of the file.
    1. In your SSH session, run `vi .env` (make sure you are inside the `utility-discord-bot` folder).
    1. Press `i` to enter Insert mode
    1. Paste. This pastes the content of the `.env` file. If on Windows WSL, you may need to right click your WSL bar, click Properties and check "Use Ctrl+Shift+C/V as Copy/Paste" first. And then use `Ctrl + Shift + V` to paste.
    1. Type `:x` to save and quit.

    You can use something like nano instead of vim if you struggle with the instructions above.

1. (Optional) If you are using text-to-speech or otherwise using Google Applications, create a service account and place the JSON file here:

    ```
    .data/google-application-service-account.json
    ```
1. (Optional) If you want to expose your app to the outside world over HTTPS and a custom domain, then either generate an SSL certificate and run the nginx server, or use Cloudflare as a reverse proxy (recommended)
   - Cloudflare: Follow the [Cloudflare Tunnel instructions](./Cloudflare-Tunnel-Instructions.md)
   - Nginx:
      1. Create a DNS A Record for your domain, and point it to the public IP address of your Digital Ocean Droplet.
      1. `npm run dhparam`
      1. Update `deploy/nginx-conf-http/nginx.conf` and `deploy/nginx-conf-https/nginx.conf` by replacing the server name `api.utilitydiscordbot.com` (and possibly port number) with your own.
      1. Update `deploy/docker-compose.yml` by replacing `api.utilitydiscordbot.com` and `michael@mikeyaworski.com` with your own.
1. Start the bot:
    ```
    npm run start:docker
    ```
    Or, if you are running one of the reverse proxy servers mentioned in the previous step, instead start the bot with:
    ```
    npm run start:with-cloudflare
    ```
    or
    ```
    npm run start:with-nginx
    ```

1. View logs to see if everything is successful:
   ```
   npm run logs:bot
   ```
   Use `Ctrl + C` to get out of the logs.

   If you are running the Cloudflare tunnel, then you may also want to view the logs of the tunnel:
   ```
   npm run logs:cloudflare
   ```

   If you are running the nginx server with HTTPS, then you may also want to view the logs of your nginx servers or certbots. You can do that with:
   ```
   npm run logs:cert
   npm run logs:http
   npm run logs:https
   ```

1. (Optional) If you enabled HTTPS with nginx, then you should also create a cronjob to run the `deploy/renew-ssl.sh` script. This will both renew the SSL certificate and restart the https nginx server, so that the server will use the new certificate.
   1. Type `pwd` and observe the result.
   1. Ensure that in `deploy/renew-ssl.sh`, the `cd` command uses the same path as your output from `pwd`.
   1. Type `crontab -e` and choose whichever option you want to open a text editor.
   1. Add this to the bottom of the file (replace `your_pwd_path`):
      ```
      0 12 * * * /your_pwd_path/deploy/renew-ssl.sh >> /var/log/cron.log 2>&1
      ```
      This runs the renewal script on a daily basis. If all previous instructions were followed precisely, then this should be the line put at the bottom of the file:
      ```
      0 12 * * * /root/utility-discord-bot/deploy/renew-ssl.sh >> /var/log/cron.log 2>&1
      ```

## Restarting

Without HTTPS:

```
cd ~/utility-discord-bot
npm run restart:docker
```

With Cloudflare:

```
cd ~/utility-discord-bot
npm run restart:with-cloudflare
```

With nginx:

```
cd ~/utility-discord-bot
npm run restart:with-nginx
```

## Updating

Without HTTPS:

```
cd ~/utility-discord-bot
npm run docker-pull
npm run restart:docker
```

With Cloudflare:

```
cd ~/utility-discord-bot
npm run docker-pull
npm run restart:with-cloudflare
```

With nginx:

```
cd ~/utility-discord-bot
npm run docker-pull
npm run restart:with-nginx
```

## Stopping

Without HTTPS:

```
cd ~/utility-discord-bot
npm run stop:docker
```

With Cloudflare:

```
cd ~/utility-discord-bot
npm run stop:with-cloudflare
```

With nginx:

```
cd ~/utility-discord-bot
npm run stop:with-nginx
```

## Reading Logs

```
cd ~/utility-discord-bot
npm run logs:bot
```
Use `Ctrl + C` to get out of the logs.

If you are running the Cloudflare tunnel, then you may also want to view the logs of the tunnel:
```
npm run logs:cloudflare
```

If you are running the nginx server with HTTPS, then you may also want to view the logs of your nginx servers or certbots. You can do that with:
```
npm run logs:cert
npm run logs:http
npm run logs:https
```

You may also want to read the cronjob logs for renewing your SSL certificate. You can do that with:
```
npm run logs:cron
```
