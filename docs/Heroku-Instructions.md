# Hosting it on Heroku

1. Create an application on the Discord Developer Portal and add a bot to that application: https://discord.com/developers/applications. Make sure to enable the `PRESENCE INTENT` and `SERVER MEMBERS INTENT` in the bot settings.

1. Take note of your application client ID (Application ID) and bot token. The client ID will let you form an invite:
    ```
    https://discord.com/api/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&permissions=536320928976&scope=applications.commands%20bot
    ```
    The bot token and client ID will need to be used as the `DISCORD_BOT_TOKEN` and `DISCORD_BOT_CLIENT_ID` environment variable on both Heroku and in your `.env` file (see the [Environment Variables section](../README.md#environment-variables)).

1. Go to https://heroku.com and create an app (free version is fine). This bot will actually ping itself every 20 minutes so that the bot does not sleep automatically. When configuring the dyno, you can use `web npm start`.

1. Add the Postgres add-on to your Heroku app: https://elements.heroku.com/addons/heroku-postgresql. This add-on will automatically add a `DATABASE_URL` config variable to your app, which the code uses to connect to your database. Easy!

1. Add the following buildpacks to your Heroku app (in Settings):
    - (Not required if using the latest version) `https://github.com/jontewks/puppeteer-heroku-buildpack.git`
    - `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`
    - `heroku/python`

    Note that these should be ordered before your `heroku/nodejs` buildpack (which would be there by default).

1. [Optional] Go to https://console.cloud.google.com, create a project and API key for the `YouTube Data API v3`.

1. [Optional] Go to https://developer.spotify.com/dashboard/applications, create a project and note your client ID & client secret.

1. Go to Settings for your Heroku app and start adding Config Vars.
    - `DISCORD_BOT_CLIENT_ID` and the value is from step 2.
    - `DISCORD_BOT_TOKEN` and the value is from step 2.
    - `ENVIRONMENT` = `production`
    - `NPM_CONFIG_PRODUCTION` = `false`
    - [Optional] `YOUTUBE_API_KEY` and the value is from step 6.
    - [Optional] `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` with values from step 7.
    - [Optional] Finally, `PING_HOST`, which is a link to your Heroku app web URL. It will be:
    
        ```
        https://<HEROKU_APP_NAME>.herokuapp.com
        ```
1. Now you have everything in place to deploy the code! There are multiple ways to deploy the code. You could clone this repo and then use the Heroku CLI to login to your Heroku account and deploy it manually from the command line. Do that if you're comfortable.

    Otherwise, I recommend forking this repository so that you have your own version of the code on your GitHub profile. Then go to the Deploy tab on your Heroku app and connect your GitHub. Find the repository and enable automatic deploys for the repo! You should choose the `master` branch for the automatic deployment. And you can leave `Wait for CI to pass before deploy` disabled.

    You can also click the `Deploy Branch` button at the bottom of the page under `Manual deploy` to manually deploy. You may want to do this the first time.

1. If you have made a fork of this repo, you can now periodically pull in changes that I make into your own fork's `master` branch and then this app will automatically deploy the changes for you (if you set that up in the previous step). Otherwise, pull in changes and manually deploy it again.

1. You can click the `More` button at the top right of your Heroku app and select `View logs` to see if your app is successfully building / deploying. You can view the specific build logs by going to `Activity` on your Heroku app and selecting `View build log` for a specific build.

1. If you just want to use the bot on your server, you're done! Just invite it with the link I provided in step 2. Otherwise, continue reading the next steps.

