# Create Docker Images

To run the bot on your server, you are free to use the docker images that I create on my Docker Hub repository: https://hub.docker.com/repository/docker/mikeyaworski/utility-discord-bot

This is a public repository, so you may pull the docker image and run it on your server. You will have to provide your own environment variables to connect to your own database, etc. But the image is there to run the bot.

If you have forked this repository and made changes to the code, and therefore want to create your own Docker image that you can run on your server, follow the instructions below.

## Starting from scratch

1. Create an account on https://hub.docker.com
1. Create a repository
1. Open the desktop Docker app on your computer and sign in
1. Make sure there are no unstaged changes in your local code. i.e. `git status` shouldn't show any unstaged files. If there are, then these files will be included in the Docker image, which is probably not what you want.
1. Open `docker-push.sh` and change the content in `imageName` from my repository (`mikeyaworski/utility-discord-bot`) to yours.
1. Open `package.json` and do the same - update any scripts which contain my repository name (`mikeyaworski/utility-discord-bot`) to yours.
1. Run the commands:
   ```
   npm run docker-push
   npm run docker-push:latest
   ```

   If these commands fail with the message:
   ```
   error: multiple platforms feature is currently not supported for docker driver. Please switch to a different driver (eg. "docker buildx create --use")
   ```
   Then you will need to make sure you're on an up-to-date version of Docker (to support `buildx`) and run:
   ```
   docker buildx create --use
   ```
   This only needs to be done for your first time using `buildx`.

## Push a new image

1. Make sure there are no unstaged changes in your local code. i.e. `git status` shouldn't show any unstaged files. If there are, then these files will be included in the Docker image, which is probably not what you want.
1. Run the commands
   ```
   npm run docker-push
   npm run docker-push:latest
   ```

   You can omit `npm run docker-push:latest` if you don't want to update the `latest` image. You can omit `npm run docker-push` if you *only* want to update the `latest` image.

   If these commands fail with the message:
   ```
   error: multiple platforms feature is currently not supported for docker driver. Please switch to a different driver (eg. "docker buildx create --use")
   ```
   Then you will need to make sure you're on an up-to-date version of Docker (to support `buildx`) and run:
   ```
   docker buildx create --use
   ```
   This only needs to be done for your first time using `buildx`.
