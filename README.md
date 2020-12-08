# Invites

### Production
https://discord.com/api/oauth2/authorize?client_id=783752800138952744&permissions=1573383287&scope=bot

### Development
https://discord.com/api/oauth2/authorize?client_id=785782124577685525&permissions=1573383287&scope=bot

# Contributing / Adding this bot to your server
This repository is linked to a Heroku app which automatically deploys updates to the bot when commits are made to `master`.

However, this is a private bot. This bot does not have measures in place to handle scaling properly, since that would require expensive servers. To get this bot in your server, please host this yourself. It is very easy to do so - you just need to deploy this repository code to your own Heroku app!

## Using the bot in your server

1. Create an application on the Discord Developer Portal and add a bot to that application: https://discord.com/developers/applications

1. Take note of your application client ID and bot token. The client ID will let you form an invite:
    ```
    https://discord.com/api/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&permissions=1573383287&scope=bot
    ```
    And the bot token will need to be used as the `DISCORD_BOT_TOKEN` environment variable on both Heroku and in your `.env` file (see the section below).

1. Go to https://heroku.com and create an app (free version is fine). This bot will actually ping itself every 20 minutes so that the bot does not sleep automatically. When configuring the dyno, you can use `web npm start`.

1. Add the Postgres add-on to your Heroku app: https://elements.heroku.com/addons/heroku-postgresql. This add-on will automatically add a `DATABASE_URL` config variable to your app, which the code uses to connect to your database. Easy!

1. Go to Settings for your Heroku app and start adding Config Vars.
    - Add one with the name `DISCORD_BOT_TOKEN` and the value with the value that I asked you to copy in step 2.
    - Add another for `ENVIRONMENT` = `production`
    - Add another for `NPM_CONFIG_PRODUCTION` = `false`
    - Add another for `OWNER_ID` which is the ID of your Discord account.
    - Finally, add one for `PING_HOST` which is a link to your Heroku app web URL. It will be:
    
        ```
        https://<HEROKU_APP_NAME>.herokuapp.com
        ```
1. Now you have everything in place to deploy the code! There are multiple ways to deploy the code. You could clone this repo and then use the Heroku CLI to login to your Heroku account and deploy it manually from the command line. Do that if you're comfortable.

    Otherwise, I recommend forking this repository so that you have your own version of the code on your GitHub profile. Then go to the Deploy tab on your Heroku app and connect your GitHub. Find the repository and enable automatic deploys for the repo! You should choose the `master` branch for the automatic deployment. And you can enable `Wait for CI to pass before deploy`.

    You can also click the `Deploy Branch` button at the bottom of the page under `Manual deploy` to manually deploy. You may want to do this the first time.

1. If you have made a fork of this repo, you can now periodically pull in changes that I make into your own fork's `master` branch and then this app will automatically deploy the changes for you (if you set that up in the previous step). Otherwise, pull in changes and manually deploy it again.

1. You can click the `More` button at the top right of your Heroku app and select `View logs` to see if your app is successfully building / deploying. You can view the specific build logs by going to `Activity` on your Heroku app and selecting `View build log` for a specific build.

1. If you just want to use the bot on your server, you're done! Just invite it with the link I provided in step 2. Otherwise, continue reading the next steps.

## Contributing to the code

1. If you want to contribute to the code, you will need to create a `.env` file in the root of the repository and use the template listed below.

1. You will probably want to create two discord bots on the Discord Developer Portal (development and production) following steps 1 and 2 of previous section.

    Use the development bot token for your local `.env` file an the production bot token in your Heroku config var. That way, your production bot won't collide with your development bot (listening/responding to events/commands). You may then want to create a test discord server and invite only your development bot into it. Any other servers can have the production bot invited to them.

1. You can replace `DATABASE_URL` in your `.env` file with your Heroku database URL (look up your database credentials on the Heroku platform), but if you do this, make sure to also change `ENVIRONMENT` to `production` (required to connect to database with the required SSL).

1. Install Docker and run `docker-compose up` to run the bot. That's it.

1. You can opt to not use Docker and instead run `npm run dev`. By doing this, Docker will no longer deploy Postgres for you, so you will have errors connecting to a database. To solve this, you can easily use your production database instead by following step 3.

# Environment Variables
Fill in your own `DISCORD_BOT_TOKEN` and `OWNER_ID` for development / your bot deployment.

```
ENVIRONMENT='development'

DISCORD_BOT_TOKEN=...
DATABASE_URL=postgres://user:password@utility_discord_bot_db:5432/utility_discord_bot_db

OWNER_ID=...
PORT=8080
PING_HOST=http://localhost:8080
```
