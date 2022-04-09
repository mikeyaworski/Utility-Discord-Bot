# Create Docker Images

To run the bot on your server, you are free to use the docker images that I create on my Docker Hub repository: https://hub.docker.com/repository/docker/mikeyaworski/utility-discord-bot

This is a public repository, so you may pull the docker image and run it on your server. You will have to provide your own environment variables to connect to your own database, etc. But the image is there to run the bot.

If you have forked this repository and made changes to the code, and therefore want to create your own Docker image that you can run on your server, follow the instructions below.

## Starting from scratch

1. Create an account on https://hub.docker.com
2. Create a repository
1. Open the desktop Docker app on your computer and sign in
2. Make sure there are no unstaged changes in your local code. i.e. `git status` shouldn't show any unstaged files. If there are, then these files will be included in the Docker image, which is probably not what you want.
3. Open `docker-push.sh` and change the content in `imageName` from my repository (`mikeyaworski/utility-discord-bot`) to yours.
4. Open `package.json` and do the same - update any scripts which contain my repository name (`mikeyaworski/utility-discord-bot`) to yours.
5. Run the commands
   ```
   npm run docker-push
   npm run docker-push:latest
   ```

## Push a new image

1. Make sure there are no unstaged changes in your local code. i.e. `git status` shouldn't show any unstaged files. If there are, then these files will be included in the Docker image, which is probably not what you want.
1. Run the commands
   ```
   npm run docker-push
   npm run docker-push:latest
   ```
  You can omit `npm run docker-push:latest` if you don't want to update the `latest` image. You can omit `npm run docker-push` if you *only* want to update the `latest` image.
