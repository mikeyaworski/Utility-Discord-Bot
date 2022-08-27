# Hosting it on Heroku

## No Longer Free

Heroku no longer has free tier, so I don't recommend hosting there. Instead, host it on another free platform and create a managed database at Supabase. If you already have a database on Heroku and would like to migrate it to Supabase, you can find instructions for how to do so [here](./Supabase-Instructions.md). You can also host the bot on Heroku, but host the database on Supabase. To do that, follow the [Supabase instructions](./Supabase-Instructions.md) and use the database URL as an environment variable in your Heroku app (`DATABASE_URL`), and then skip step 4 in the instructions below.

I don't have a specific recommendation for another free hosting platform, but there are probably a few of them out there. Note that you cannot use Vercel or any other other serverless deployment, since this bot requires a constant connection to Discord in order to function (a server is required).

AWS and GCP give you some amount of free credits to use, so if you would like to host it on AWS, GCP, or Digital Ocean, there are instructions to do so here:

- [AWS instructions](/docs/AWS-Instructions.md)
- [Google Cloud Engine (GCE) instructions](/docs/GCE-Instructions.md)
- [Digital Ocean Droplet instructions](/docs/DO-Instructions.md)

Regardless, instructions for how to host on Heroku are left below. And other platforms may operate similarly to Heroku, so these instructions can be used as a point of reference.

## Heroku Instructions

1. Follow the [general instructions](./General-Instructions.md) to create your bot and collect your environment variables that will be needed later.

1. Go to https://heroku.com and create an app (cheapest version is fine). This bot will actually ping itself every 20 minutes so that the bot does not sleep automatically. When configuring the dyno, you can use `web npm start`.

1. Add the Postgres add-on to your Heroku app: https://elements.heroku.com/addons/heroku-postgresql. This add-on will automatically add a `DATABASE_URL` config variable to your app, which the code uses to connect to your database. Easy!

1. Add the following buildpacks to your Heroku app (in Settings):
    - (No longer required) `https://github.com/jontewks/puppeteer-heroku-buildpack.git`
    - `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`
    - `heroku/python`

    Note that these should be ordered before your `heroku/nodejs` buildpack (which would be there by default).

1. Go to Settings for your Heroku app and start adding Config Vars.
    - `DISCORD_BOT_CLIENT_ID` and the value is from step 2 of the [general instructions](./General-Instructions.md).
    - `DISCORD_BOT_TOKEN` and the value is from step 2 of the [general instructions](./General-Instructions.md).
    - `ENVIRONMENT` = `production`
    - `NPM_CONFIG_PRODUCTION` = `false`
    - [Optional] `YOUTUBE_API_KEY` and the value is from step 3 of the [general instructions](./General-Instructions.md).
    - [Optional] `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` with values from step 4 of the [general instructions](./General-Instructions.md).
    - [Optional] Finally, `PING_HOST`, which is a link to your Heroku app web URL. It will be:
    
        ```
        https://<HEROKU_APP_NAME>.herokuapp.com
        ```
1. Now you have everything in place to deploy the code! There are multiple ways to deploy. I recommend forking this repository so that you have your own version of the code on your GitHub profile. Then go to the Deploy tab on your Heroku app and connect your GitHub. Find the repository and enable automatic deploys for the repo. You should choose the `master` branch for the automatic deployment. And you can leave `Wait for CI to pass before deploy` disabled.

    You can also click the `Deploy Branch` button at the bottom of the page under `Manual deploy` to manually deploy. You may need to do this the first time.

1. If you have made a fork of this repo, you can now periodically pull in changes that I make into your own fork's `master` branch and then this app will automatically deploy the changes for you (if you set that up in the previous step). Otherwise, pull in changes and manually deploy it again.

1. You can click the `More` button at the top right of your Heroku app and select `View logs` to see if your app is successfully building / deploying. You can view the specific build logs by going to `Activity` on your Heroku app and selecting `View build log` for a specific build.

1. If you just want to use the bot on your server, you're done! Just invite it with the link I provided in step 2 of the [general instructions](./General-Instructions.md).

