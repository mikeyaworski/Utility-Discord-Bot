# Hosting it on a Google Compute Engine instance

These instructions describe a process for manually hosting the bot on GCE. This will not have automated deployments.

Note: These instructions were written before Docker images were created for this project. Check the [AWS instructions](./AWS-Instructions.md) to get a general idea of how to run a Docker container instead.

## Startup

1. Follow the [general instructions](./General-Instructions.md) to create your bot and collect your environment variables that will be needed later.

1. Create a PostgreSQL database somewhere (probably Supabase) and collect your database URL. You can find instructions on how to create a PostgreSQL database on Supabase [here](./Supabase-Instructions.md).

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
    npm ci
    ```

1. Create a `.env` file with all of the environment variables filled in. This means your secrets are written to the instance's disk. If this is a security concern for you, then there are alternative ways to define secrets, but are more effort.

    You can see the structure of the `.env` file [here](../README.md#environment-variables). Make sure to replace the `DATABASE_URL` value with whatever your hosted database URL is (probably Supabase from the instructions linked in step 2). The example environment variables show values for local development, so several of them will need to be changed for the deployment.

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

1. Rewrite this documentation to use Docker.
