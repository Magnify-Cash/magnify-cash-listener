#!/bin/bash

# Set up safe defaults
set -e

# Trust GitHub as an SSH host
mkdir -p ~/.ssh
ssh-keyscan github.com >> ~/.ssh/known_hosts

# Setup env vars for pnpm and pm2
export PNPM_HOME=$HOME/magnify-cash-listener/.pnpm
export PM2_HOME=$HOME/magnify-cash-listener/.pm2
export PATH=$PNPM_HOME:$PATH

# Fix git ownership safety
git config --global --add safe.directory /home/deploy/magnify-cash-listener

# Go to app folder and deploy
cd /home/deploy/magnify-cash-listener
git pull origin main
pnpm install --frozen-lockfile || pnpm install
pm2 restart magnify-cash-listener || pm2 start index.js --name magnify-cash-listener
