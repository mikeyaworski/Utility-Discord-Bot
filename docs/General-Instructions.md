# Create your Discord bot

1. Create an application on the Discord Developer Portal and add a bot to that application: https://discord.com/developers/applications. Make sure to enable the `PRESENCE INTENT`, `SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT` in the bot settings.

1. Take note of your application client ID (Application ID), client secret and bot token. The client secret is under the OAuth2 settings. The client ID will let you form an invite:
    ```
    https://discord.com/api/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&permissions=536320928976&scope=applications.commands%20bot
    ```
    The bot token, client secret and client ID will need to be used as the `DISCORD_BOT_TOKEN`, `DISCORD_BOT_CLIENT_SECRET` and `DISCORD_BOT_CLIENT_ID` environment variables.

1. [Optional] Go to https://console.cloud.google.com, create a project and API key for the `YouTube Data API v3`. This is used to fetch YouTube playlist information with the Player commands.

1. [Optional] Go to https://developer.spotify.com/dashboard/applications, create a project and note your client ID & client secret. This is used to fetch Spotify playlist information with the Player commands.

1. [Optional] Go to https://platform.openai.com/account/api-keys and create a secret key. This is used for the `OPENAI_SECRET_KEY` environment variable, and is necessary to use the `/chatgpt` command.

At this point, you should have all of the environment variables needed to deploy the bot, except for the database URL.
