# Hosting it on a Google Compute Engine instance

These instructions describe a process for manually hosting the bot on GCE. This will not have automated deployments.

Note: These instructions were written before Docker images were created for this project. Check the [AWS instructions](./AWS-Instructions.md) to get a general idea of how to run a Docker container instead.

These instructions do not mention how to gather your environment variables. You can see the structure of the `.env` file [here](../README.md#environment-variables) and instructions on how to gather them in the [Heroku instructions](./Heroku-Instructions.md).

These instructions also assume you have created a PostgreSQL database on Heroku, as instructed in the [Heroku instructions](./Heroku-Instructions.md). Even if you do not want to host the bot on Heroku, you probably want to utilize Heroku's free PostgreSQL database. It's recommended to go through the Heroku instructions, create your Heroku app with the database, then disable the dyno and proceed to host the bot on the VM described here.

## Startup

1. Create a VM instance under the Google Compute Engine.
1. Use an `e2-micro` instance in a free region if you want to remain in the free tier. For example, the `us-central1` region.
1. (Optional) Choose an Ubuntu machine (latest version).
1. SSH into the instance.
1. 
   ```
   sudo apt update
   ```
1. 
   ```
   sudo apt install python ffmpeg
   ```
1. 
   ```
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo bash -
   ```
1. 
   ```
   sudo apt install -y nodejs
   ```
1.  
    ```
    git clone https://github.com/mikeyaworski/Utility-Discord-Bot.git
    ```
1. 
    ```
    cd ~/Utility-Discord-Bot
    ```
1. 
    ```
    npm ci`
1. Retrieve your `DATABASE_URL` environment variable with:
    ```
    heroku config:get DATABASE_URL -a miky-utility-discord-bot
    ```
    Where `miky-utility-discord-bot` is replaced to whatever your Heroku app is named. Note that this value is subject to change. When/if it changes, you will need to update the environment variable and restart the app.

    As previously mentioned, these instructions assume you have gone through the [Heroku instructions](./Heroku-Instructions.md) to create a Heroku app with a free PostgreSQL database.
1. Create a `.env` file with all of the environment variables filled in. This means your secrets are written to the instance's disk. If this is a security concern for you, then there are alternative ways to define secrets, but are more effort.

    You can see the structure of the `.env` file [here](../README.md#environment-variables) and instructions on how to gather the environment variables in the [Heroku instructions](./Heroku-Instructions.md).

    If unfamiliar with the command line, here are instructions to create the `.env` file using vim:

    1. Create it on your local computer and copy the contents of the file.
    1. In your SSH session, run `vi .env` (make sure you are inside the `Utility-Discord-Bot` folder).
    1. Press `i` to enter Insert mode
    1. Paste. This pastes the content of the `.env` file. If on Windows WSL, you may need to right click your WSL bar, click Properties and check "Use Ctrl+Shift+C/V as Copy/Paste" first. And then use `Ctrl + Shift + V` to paste.
    1. Type `:x` to save and quit.

    You can use something like nano instead of vim if you struggle with the instructions above.
1. 
    ```
    npm run start:nohup
    ```

## Restarting

```
cd ~/Utility-Discord-Bot
npm run stop:nohup
npm run start:nohup
```

## Updating

```
cd ~/Utility-Discord-Bot
git pull
```

If there are dependency changes, then you will need to stop the app, update the dependencies, and run it again.

```
npm run stop:nohup
npm ci
npm run start:nohup
```

## Stopping

```
cd ~/Utility-Discord-Bot
npm run stop:nohup
```

Or find the node process and kill it (using its PID).

```
ps -ef | grep "[b]in/ts-node"
kill -9 ...
```

## Reading Logs

```
cd ~/Utility-Discord-Bot
cat log
```

# TODOs

1. Build this VM from an image.
