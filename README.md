# Utility Discord Bot

## Adding it to your server

This is a private bot. To get this bot in your server, please host this yourself. It is very easy to do so and there are instructions on how to do so. The easiest approach is to host it on Heroku. The best approach would be to host it on a cloud VM.

### Hosting it on Heroku

[How to host on Heroku](/docs/Heroku-Instructions.md)

### Hosting it on Cloud VMs

- [AWS instructions](/docs/AWS-Instructions.md)
- [Google Cloud Engine (GCE) instructions](/docs/GCE-Instructions.md)
- [Digital Ocean Droplet instructions](/docs/DO-Instructions.md)

1. Make sure you are using Node v14 or above, since some of our dependencies require this.

## Environment Variables
Create a `.env` file in the root of your project folder. You can use `.env.example` as a starting point.

Fill in your own `DISCORD_BOT_CLIENT_ID` and `DISCORD_BOT_TOKEN` for development / your bot deployment.

Optional variables:
- `SLASH_COMMANDS_GUILD_ID`, which will only be used in development environments for easier slash command testing.
- `YOUTUBE_API_KEY`, which is used to fetch playlist videos for the player commands.
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, which are used to fetch playlist tracks for the player commands.

```
ENVIRONMENT=development
PORT=3000

DISCORD_BOT_CLIENT_ID=...
DISCORD_BOT_TOKEN=...
DATABASE_URL=postgres://user:password@utility-discord-bot-db:5432/utility-discord-bot-db
YOUTUBE_API_KEY=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Slash Commands in Development
SLASH_COMMANDS_GUILD_ID=...
```

If you are creating these environment variables for a cloud VM, make sure to change `ENVIRONMENT` to `production`, and replace `DATABASE_URL` with your production database URL (either the one from Heroku, or another service that you have set up).

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
