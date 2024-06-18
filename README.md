# Utility Discord Bot

## Adding it to your server

This is a private bot. To get this bot in your server, please host this yourself. It is very easy to do so and there are instructions on how to do so. The easiest approach is to host it on Heroku. The best approach would be to host it on a cloud VM.

### Hosting it on Cloud VMs

- [AWS instructions](/docs/AWS-Instructions.md)
- [Google Cloud Engine (GCE) instructions](/docs/GCE-Instructions.md)
- [Digital Ocean Droplet instructions](/docs/DO-Instructions.md)

### Hosting it on Heroku

Note: Heroku no longer has a free tier, so hosting on Heroku is no longer recommended. More details are provided on the Heroku instructions page, but it's recommended to choose an alternative free platform, or use the cheaper (and better) option of hosting on a cloud VM.

[How to host on Heroku](/docs/Heroku-Instructions.md)

## Environment Variables
Create a `.env` file in the root of your project folder. You can use `.env.example` as a starting point.

Fill in your own `DISCORD_BOT_CLIENT_ID`, `DISCORD_BOT_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` for development / your bot deployment.

Optional variables:
- `SLASH_COMMANDS_GUILD_ID`, which will only be used in development environments for easier slash command testing.
- `WEBHOOK_SECRET`, which will only be used for the `/webhooks` API route. By default, this route is unused and is generally only useful if you would like a third party (e.g. IFTTT) to send messages via webhooks.
- `YOUTUBE_API_KEY`, which is used to fetch playlist videos for the player commands.
- `YOUTUBE_COOKIES`, which is used to authenticate yourself when the player tries to play audio from YouTube.
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, which are used to fetch playlist tracks for the player commands.
- `OPENAI_SECRET_KEY`, `CHATGPT_USER_LIMIT`, `CHATGPT_WHITELIST_USER_LIMIT`, `CHATGPT_WHITELIST_USER_IDS`, `CHATGPT_GUILD_LIMIT` and `CHATGPT_CONVERSATION_TIME_LIMIT` are used to fetch queries from ChatGPT.

```
# Use "production" when deploying
ENVIRONMENT=development

PORT=3000

# Replace with your hosted database URL when deploying
DATABASE_URL=postgres://user:password@utility-discord-bot-db:5432/utility-discord-bot-db

DISCORD_BOT_CLIENT_ID=...
DISCORD_BOT_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...

YOUTUBE_API_KEY=...
YOUTUBE_COOKIES="..."

SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# ChatGPT
OPENAI_SECRET_KEY=...
# 2 requests every 60 seconds
CHATGPT_USER_LIMIT=2,60
CHATGPT_WHITELIST_USER_LIMIT=5,30
# Comma-separated
CHATGPT_WHITELIST_USER_IDS=
CHATGPT_GUILD_LIMIT=10,60
# in seconds
CHATGPT_CONVERSATION_TIME_LIMIT=10

# Player
# 1 request every 2 seconds
PLAYER_USER_LIMIT=1,2
# 1 request per second
PLAYER_GUILD_LIMIT=1,1

# Create your own webhook secret if you intend to use the webhook API routes and want them protected
WEBHOOK_SECRET=...

# Slash Commands in development. Remove this during deployment.
SLASH_COMMANDS_GUILD_ID=...

UI_ROOT=http://localhost:8080
```

If you are creating these environment variables for a cloud VM, make sure to change `ENVIRONMENT` to `production`, and replace `DATABASE_URL` with your production database URL (either the one from Heroku, or another service that you have set up).

## Player Cookies

Cookies are messy. Right now, there are three possible libraries used for the player (each can fail, so there are fallbacks):
- `play-dl`
- `youtube-dl-exec`
- `ytdl-core`

As a result, there are 3 different places to insert cookies, depending on which library you want to feed cookies to. It is possible to consolidate this into one place, but since each library accepts cookies in a different format and you may want to use different cookies for each library, it was convenient to just leave it as is (messy).

- play-dl
  - Create a `.data/youtube.data` file in the root of wherever you run the bot. This `.data` directory is mounted as a volume on the server (if you use the provided `deploy/docker-compose.yaml` file). This file can be created manually or automatically. The format is
    ```
    {
      "cookie": {
        "name1": "value1",
        "name2": "value2",
        ...
      }
    }
    ```
    where each key-value-pair is a cookie name to its value. This is a bad format, but it's what the library requires. To do this automatically, open your terminal wherever `play-dl` is installed as a dependency (this will be wherever you've run `npm install` for Utility-Discord-Bot), run `node`, and then `require('play-dl').authorization()`. This will prompt you to create the `.data/youtube.data` file, which you can then copy to a server.
- youtube-dl-exec
  - Use a browser extension to export cookies from youtube.com, and then create `.data/cookies.txt` file in the root of wherever you run the bot. This file will be passed directly to `yt-dlp` via the `youtube-dl-exec` library. This `.data` directory is mounted as a volume on the server (if you use the provided `deploy/docker-compose.yaml` file).
- ytdl-core
  - From the request headers in any network request on youtube.com, copy the value for the "cookie" header. The value should be pasted to the `YOUTUBE_COOKIES` environment variable (in your `.env` file). Wrap the value with quotes since it will contain special characters.

## Contributing to the code

1. If you want to contribute to the code, you will need to create a `.env` file in the root of the repository and use the template listed below.

1. You will probably want to create two discord bots on the Discord Developer Portal (development and production) following steps 1 and 2 of previous section.

    Use the development bot token for your local `.env` file an the production bot token in your Heroku config var. That way, your production bot won't collide with your development bot (listening/responding to events/commands). You may then want to create a test discord server and invite only your development bot into it. Any other servers can have the production bot invited to them.

1. You can replace `DATABASE_URL` in your `.env` file with your Heroku database URL (look up your database credentials on the Heroku platform), but if you do this, make sure to also change `ENVIRONMENT` to `production` (required to connect to database with the required SSL).

1. Install Docker and run `docker-compose up` to run the bot. That's it.

1. You can opt to not use Docker and instead run `npm run dev`. By doing this, Docker will no longer deploy Postgres for you, so you will have errors connecting to a database. To solve this, you can easily use your production database instead by following step 3.

## Public Docker Images

The best way to run this bot on a VM (like an EC2 instance or GCE instance) is to run a docker container. This is not necessary for Heroku. Instructions for how to do this on AWS are in the [AWS instructions](/docs/AWS-Instructions.md).

If you would like to make your own code changes and build your own Docker images, instructions are [here](/docs/Create-Docker-Images.md).

The platform architectures supported for Docker are: `linux/amd64`, `linux/arm64`, and `linux/arm/v7`.

## [Private Access] Invites

This repository is linked to a Heroku app which automatically deploys updates to the privately hosted bot when commits are made to `master`. The following invites will only work for myself and whitelisted members.

### Production
https://discord.com/api/oauth2/authorize?client_id=783752800138952744&permissions=536320928976&scope=applications.commands%20bot

### Development
https://discord.com/api/oauth2/authorize?client_id=785782124577685525&permissions=536320928976&scope=applications.commands%20bot
