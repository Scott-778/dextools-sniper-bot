# dextools-trending-sniper-bot
This bot buys BSC tokens that are number 1 trending on dextools automatically. Use at your own risk. Investing in cryptocurrency is risky. This is not financial advice. There is a small 0.7% buying fee per buy. This is to help me buy a cup of coffee and support for this project. 
## Getting Started
First, if you don't have node.js installed go to nodejs.org and install the lastest LTS version.
Then go to my.telegram.org and create an app to get apiID and apiHash.
Then subscribe to this channel on Telegram https://t.me/dextoolstrendingalerts
Then Use the following commands either in VScode or command prompt 
```
git clone https://github.com/Scott-778/dextools-sniperbot.git
```
```
cd dextools-sniperbot
```
```
npm install
```
Then edit .env file with your bsc wallet address, mnemonic, apiId and apiHash in your code editor and save file.
Then put in the tokens that you do not want to buy in dextoolsBot.js

To start bot run this command
```
node dextoolsBot.js
```
