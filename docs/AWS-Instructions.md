# Hosting it on an AWS EC2 instance

These instructions describe a process for manually hosting the bot on GCE. This will not have automated deployments.

These instructions do not mention how to gather your environment variables. You can see the structure of the `.env` file [here](../README.md#environment-variables) and instructions on how to gather them in the [Heroku instructions](./Heroku-Instructions.md).

These instructions also assume you have created a PostgreSQL database on Heroku, as instructed in the [Heroku instructions](./Heroku-Instructions.md). Even if you do not want to host the bot on Heroku, you probably want to utilize Heroku's free PostgreSQL database. It's recommended to go through the Heroku instructions, create your Heroku app with the database, then disable the dyno and proceed to host the bot on the VM described here.

## Startup

1. Navigate to the EC2 section of the dashboard in your preferred region, and launch an instance.
1. Choose `Amazon Linux 2 AMI (HVM) - Kernel 5.10` for the AMI (or a new version) and select `Arm` for the processor.
1. Choose a `t4g.micro` or `t4g.nano` for the instance type (not free), or `t2.micro`/`t3.micro` if you are looking to stay in the free tier. Opt for the `t4g` if not staying in the free tier, since they are cheaper (weird). Obviously, you can choose a totally different one depending on your needs, but all of the aforementioned instance types work well for small server usage.
1. Create a security group called "connect" (or whatever you want) and use it for your instance. The security group will let you SSH into your instance, which is not something that the default security group would let you do.
   1. Create two inbound rules. Both types are `SSH`.
   1. Change the source on one of them to be `Anywhere-IPv4` and the other to be `Anywhere-IPv6`.
1. Everything else can be left default. Finish launching the instance and create your key pair that allows you to SSH into your new instance. Either key pair type is fine (RSA or ED25519). Download the private key as it describes.
1. Click on your instance, then click Connect. Connect to the instance with your SSH client (instructions will be listed and you will need to use your private key). For example, on a Windows machine in WSL:
   ```
   ssh -i "/mnt/myDriveLetter/.../utility-discord-bot.pem" ec2-user@ec2-...compute.amazonaws.com
   ```
   If you are trying to SSH from a Windows WSL, you will probably run into permission errors since `chmod 400 ...` doesn't work by default on WSL. If on Windows, I recommend using Git Bash instead. The command will be something like:
   ```
   ssh -i "/myDriveLetter/.../utility-discord-bot.pem ec2-user@ec2-...compute.amazonaws.com
   ```
1. Install Node, Git and Docker. Node and Git are optional, but the benefit is that you may run scripts from `package.json` from the Git repository.
   ```
   curl -sL https://rpm.nodesource.com/setup_10.x | sudo bash -
   sudo yum install nodejs docker git
   ```
1.  As previously mentioned, this is optional, but useful. If you skip this step, you must replace `npm run ...` in all future steps with whatever that script actually does.
    ```
    git clone https://github.com/mikeyaworski/Utility-Discord-Bot.git
    cd Utility-Discord-Bot
    ```
1. Start Docker and give yourself (`ec2-user`) permission to run Docker commands. If you skip the command `sudo usermod -a -G docker ec2-user`, then you need to run `sudo docker ...` every time (you would also need to update `package.json`).
    ```
    sudo service docker start
    sudo usermod -a -G docker ec2-user
    ``` 
1. Exit the ssh session and reconnect, so that user permissions get updated. Otherwise, you will need to use `sudo` for every `docker` command.
1. Pull the latest Docker image.
    ```
    cd ~/Utility-Discord-Bot
    npm run docker-pull
    ```
    Or, if you want to use a specific Docker image (other than `latest`), find the tag from https://hub.docker.com/repository/docker/mikeyaworski/utility-discord-bot and use this command, where `...` is the tag you want to use:
    ```
    docker pull mikeyaworski/utility-discord-bot:...
    ```
    If you are wanting to use a specific tag, you will also need to update the `start:docker` script to use that tag.
1.  Retrieve your `DATABASE_URL` environment variable with:
    ```
    heroku config:get DATABASE_URL -a miky-utility-discord-bot
    ```
    Where `miky-utility-discord-bot` is replaced to whatever your Heroku app is named. Note that this value is subject to change. When/if it changes, you will need to update the environment variable and restart the app.

    As previously mentioned, these instructions assume you have gone through the [Heroku instructions](./Heroku-Instructions.md) to create a Heroku app with a free PostgreSQL database.
1.  Create a `.env` file with all of the environment variables filled in. This means your secrets are written to the instance's disk. If this is a security concern for you, then there are alternative ways to define secrets, but are more effort.

    If unfamiliar with the command line, here are instructions to create the `.env` file using vim:

    1. Create it on your local computer and copy the contents of the file.
    1. In your SSH session, run `vi .env` (make sure you are inside the `Utility-Discord-Bot` folder).
    1. Press `i` to enter Insert mode
    1. Paste. This pastes the content of the `.env` file. If on Windows WSL, you may need to right click your WSL bar, click Properties and check "Use Ctrl+Shift+C/V as Copy/Paste" first. And then use `Ctrl + Shift + V` to paste.
    1. Type `:x` to save and quit.

    You can use something like nano instead of vim if you struggle with the instructions above.
1.  Start the bot:
    ```
    npm run start:docker
    ```
1. View logs to see if everything is successful:
   ```
   npm run logs:bot
   ```
   Use `Ctrl + C` to get out of the logs.

## Restarting

```
cd ~/Utility-Discord-Bot
npm run restart:docker
```

## Updating

```
cd ~/Utility-Discord-Bot
npm run docker-pull
npm run restart:docker
```

## Stopping

```
cd ~/Utility-Discord-Bot
npm run stop:docker
```

## Reading Logs

```
cd ~/Utility-Discord-Bot
npm run logs:bot
```
Use `Ctrl + C` to get out of the logs.
