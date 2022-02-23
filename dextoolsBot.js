/*
Dextools Trending bot

join this channel https://t.me/dextoolstrendingalerts 

This channels sends out a lot of notifications you can mute the channel in your telegram app.

This bot buys the number 1 trending BSC token on dextools automatically and will sell automatically when profit target reached or stop loss reached. 

if the number 1 trending token changes it will automatically buy the new number 1 token if it is between your custom liquidity range. 
it wont buy the same token twice.


Go to my.telegram.org and create App to get api_id and api_hash.
*/
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const { NewMessage } = require('telegram/events');
const ethers = require('ethers');
const open = require('open');
require('dotenv').config();
const fs = require('fs');

const addresses = {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    pancakeRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    BUSD: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    buyContract: '0xDC56800e179964C3C00a73f73198976397389d26',
    recipient: process.env.recipient
}
const mnemonic = process.env.mnemonic;
const apiId = parseInt(process.env.apiId);
const apiHash = process.env.apiHash;
const stringSession = new StringSession(process.env.stringSession);

/*-----------Default Settings-----------*/

var numberOfTokensToBuy = 10; // number of tokens you want to buy

const autoSell = true;  // If you want to auto sell or not 
const myGasPriceForApproval = ethers.utils.parseUnits('6', 'gwei');
const myGasLimit = 1500000;


/* buy Settings */

var trendingToken = 1;   // only 1 or 15 for right now. 1 is #1 trending token, 15 is #15 trending token.

const buyAllTokensStrategy = {

    investmentAmount: '0.1', // Amount to invest per token in BNB
    gasPrice: ethers.utils.parseUnits('6', 'gwei'),
    profitPercent: 100,      // 100% profit
    stopLossPercent: 10,  // 10% loss
    percentOfTokensToSellProfit: 75, // sell 75% when profit is reached
    percentOfTokensToSellLoss: 100, // sell 100% when stoploss is reached 
    trailingStopLossPercent: 15, // 15% trailing stoploss
    maxLiquidity: 400,	        // max Liquidity BNB
    minLiquidity: 100 	  	// min Liquidity BNB
}

//put token addresses that you dont want to buy here


/*-----------End Settings-----------*/

const node = 'https://bsc-dataseed.binance.org/';
const wallet = new ethers.Wallet.fromMnemonic(mnemonic);
const provider = new ethers.providers.JsonRpcProvider(node);
const account = wallet.connect(provider);
const pancakeAbi = [
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
    'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)'
];
const pancakeRouter = new ethers.Contract(addresses.pancakeRouter, pancakeAbi, account);
let tokenAbi = [
    'function approve(address spender, uint amount) public returns(bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint amount)',
    'function name() view returns (string)',
    'function buyTokens(address tokenAddress, address to) payable',
    'function decimals() external view returns (uint8)'
];
let pairAbi = ['function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'];

let token = [];
var sellCount = 0;
var buyCount = 0;
const buyContract = new ethers.Contract(addresses.buyContract, tokenAbi, account);
const dextoolsChannel = 1656790615;
var dontBuyTheseTokens;
/**
 * 
 * Buy tokens
 * 
 * */
async function buy() {
    if (buyCount < numberOfTokensToBuy) {
        const value = ethers.utils.parseUnits(token[buyCount].investmentAmount, 'ether').toString();
        const tx = await buyContract.buyTokens(token[buyCount].tokenAddress, addresses.recipient,
            {
                value: value,
                gasPrice: token[buyCount].gasPrice,
                gasLimit: myGasLimit

            });
        const receipt = await tx.wait();
        console.log("Buy transaction hash: ", receipt.transactionHash);
        token[buyCount].didBuy = true;
        const dextoolsURL = new URL(token[buyCount].pairAddress, 'https://www.dextools.io/app/bsc/pair-explorer/');
        open(dextoolsURL.href);
        buyCount++;
        fs.readFile('tokensBought.json', 'utf8', function readFileCallback(err, data) {
            if (err) {

            } else {
                var obj = JSON.parse(data);
                obj.tokens.push({ address: token[buyCount-1].tokenAddress });
                json = JSON.stringify(obj, null, 4);
                fs.writeFile('tokensBought.json', json, 'utf8', function (err) {
                    if (err) throw err;

                });


            }
        });
       
        approve();
    }

}
/**
 * 
 * Approve tokens
 * 
 * */
async function approve() {
    let contract = token[buyCount - 1].contract;
    const valueToApprove = ethers.constants.MaxUint256;
    const tx = await contract.approve(
        pancakeRouter.address,
        valueToApprove, {
        gasPrice: myGasPriceForApproval,
        gasLimit: 210000
    }
    );
    const receipt = await tx.wait();
    console.log("Approve transaction hash: ", receipt.transactionHash);
    if (autoSell) {
        token[buyCount - 1].checkProfit();
    } else {
        if (buyCount == numberOfTokensToBuy) {
            process.exit();
        }
    }

}

/**
 * 
 * Check for profit
 * 
 * */
async function getCurrentValue(token) {
    let bal = await token.contract.balanceOf(addresses.recipient);
    const amount = await pancakeRouter.getAmountsOut(bal, token.sellPath);
    let currentValue = amount[1];
    return currentValue;
}
async function setStopLoss(token) {
    token.intitialValue = await getCurrentValue(token);
    token.stopLoss = ethers.utils.parseUnits((parseFloat(ethers.utils.formatUnits(await getCurrentValue(token))) - parseFloat(ethers.utils.formatUnits(await getCurrentValue(token))) * (token.stopLossPercent / 100)).toFixed(18).toString());
}
function setStopLossTrailing(token, stopLossTrailing) {
    token.trailingStopLossPercent += token.initialTrailingStopLossPercent;
    token.stopLoss = stopLossTrailing;
}

async function checkForProfit(token) {
    var sellAttempts = 0;
    await setStopLoss(token);
    token.contract.on("Transfer", async (from, to, value, event) => {
        const tokenName = await token.contract.name();
        let currentValue = await getCurrentValue(token);
        const takeProfit = (parseFloat(ethers.utils.formatUnits(token.intitialValue)) * (token.profitPercent + token.tokenSellTax) / 100 + parseFloat(ethers.utils.formatUnits(token.intitialValue))).toFixed(18).toString();
        const profitDesired = ethers.utils.parseUnits(takeProfit);
        let stopLossTrailing = ethers.utils.parseUnits((parseFloat(ethers.utils.formatUnits(token.intitialValue)) * (token.trailingStopLossPercent / 100 - token.tokenSellTax / 100) + parseFloat(ethers.utils.formatUnits(token.intitialValue))).toFixed(18).toString());
        let stopLoss = token.stopLoss;

        if (currentValue.gt(stopLossTrailing) && token.trailingStopLossPercent > 0) {
            setStopLossTrailing(token, stopLossTrailing);
        }
        let timeStamp = new Date().toLocaleString();
        const enc = (s) => new TextEncoder().encode(s);
        //process.stdout.write(enc(`${timeStamp} --- ${tokenName} --- Current Value in BNB: ${ethers.utils.formatUnits(currentValue)} --- Profit At: ${ethers.utils.formatUnits(profitDesired)} --- Stop Loss At: ${ethers.utils.formatUnits(stopLoss)} \r`));
        console.log(`${timeStamp} --- ${tokenName} --- Current Value in BNB: ${ethers.utils.formatUnits(currentValue)} --- Profit At: ${ethers.utils.formatUnits(profitDesired)} --- Stop Loss At: ${ethers.utils.formatUnits(token.stopLoss)}`);
        if (currentValue.gte(profitDesired)) {
            if (buyCount <= numberOfTokensToBuy && !token.didSell && token.didBuy && sellAttempts == 0) {
                sellAttempts++;
                console.log("Selling", tokenName, "now profit target reached", "\n");
                sell(token, true);
                token.contract.removeAllListeners();
            }
        }

        if (currentValue.lte(stopLoss)) {
            console.log("less than");
            if (buyCount <= numberOfTokensToBuy && !token.didSell && token.didBuy && sellAttempts == 0) {
                sellAttempts++;
                console.log("Selling", tokenName, "now stoploss reached", "\n");
                sell(token, false);
                token.contract.removeAllListeners();
            }
        }
    });
}

/**
 * 
 * Sell tokens
 * 
 * */
async function sell(tokenObj, isProfit) {
    try {
        const bal = await tokenObj.contract.balanceOf(addresses.recipient);
        const decimals = await tokenObj.contract.decimals();
        var balanceString;
        if (isProfit) {
            balanceString = (parseFloat(ethers.utils.formatUnits(bal.toString(), decimals)) * (tokenObj.percentOfTokensToSellProfit / 100)).toFixed(decimals).toString();
        } else {
            balanceString = (parseFloat(ethers.utils.formatUnits(bal.toString(), decimals)) * (tokenObj.percentOfTokensToSellLoss / 100)).toFixed(decimals).toString();
        }
        const balanceToSell = ethers.utils.parseUnits(balanceString, decimals);
        const sellAmount = await pancakeRouter.getAmountsOut(balanceToSell, tokenObj.sellPath);
        const sellAmountsOutMin = sellAmount[1].sub(sellAmount[1].div(2));

        const tx = await pancakeRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            sellAmount[0].toString(),
            0,
            tokenObj.sellPath,
            addresses.recipient,
            Math.floor(Date.now() / 1000) + 60 * 3, {
            gasPrice: myGasPriceForApproval,
            gasLimit: myGasLimit,

        }
        );
        const receipt = await tx.wait();
        console.log("Sell transaction hash: ", receipt.transactionHash);
        sellCount++;
        token[tokenObj.index].didSell = true;

        if (sellCount == numberOfTokensToBuy) {
            console.log("All tokens sold");
            process.exit();
        }

    } catch (e) {
    }
}

/**
 * 
 * Configure Strategies User Input
 * 
 * */
(async () => {
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    await client.start({
        phoneNumber: async () => await input.text("number?"),
        password: async () => await input.text("password?"),
        phoneCode: async () => await input.text("Code?"),
        onError: (err) => console.log(err),
    });
    console.log("You should now be connected to Telegram");
    console.log("String session:", client.session.save(), '\n');

    const choices = ['Default', 'Enter Settings'];
    const choices2 = ['Trending #1', 'Trending #15'];
    /**
     * 
     * Dont change code below
     * 
     * */
    await input.select('Welcome, please choose a buying strategy', choices).then(async function (answers) {
        if (answers == 'Enter Settings') {
            numberOfTokensToBuy = parseInt(await input.text("Enter how many different tokens you want to buy"));
            buyAllTokensStrategy.investmentAmount = await input.text("Enter Investment Amount in BNB");
            buyAllTokensStrategy.minLiquidity = parseFloat(await input.text("Enter minimum liquidity"));
            buyAllTokensStrategy.maxLiquidity = parseFloat(await input.text("Enter maximum liquidity"));
            buyAllTokensStrategy.gasPrice = ethers.utils.parseUnits(await input.text("Enter Gas Price"), 'gwei');
            buyAllTokensStrategy.profitPercent = parseFloat(await input.text("Enter profit percent you want"));
            buyAllTokensStrategy.stopLossPercent = parseFloat(await input.text("Enter max loss percent"));
            buyAllTokensStrategy.trailingStopLossPercent = parseFloat(await input.text("Enter trailing stop loss percent"));
            buyAllTokensStrategy.percentOfTokensToSellProfit = parseFloat(await input.text("Enter percent of tokens to sell when profit reached"));
            buyAllTokensStrategy.percentOfTokensToSellLoss = parseFloat(await input.text("Enter percent of tokens to sell when stop loss reached"));
            await input.select('Choose  #1 trending token or #15 trending token', choices2).then(async function (answers2) {
                if (answers2 == "Trending #1") {
                    trendingToken = 1;
                }
                else {
                    trendingToken = 15;
                }
            });
        }


    });

    let raw = await readFile('tokensBought.json'); 
    let tokensBought = JSON.parse(raw);
    dontBuyTheseTokens = tokensBought.tokens;
    client.addEventHandler(onNewMessage, new NewMessage({}));
    console.log('\n', `Waiting to buy new dextools #${trendingToken} trending token with liquidity between ${buyAllTokensStrategy.minLiquidity} and ${buyAllTokensStrategy.maxLiquidity} BNB...`);

   
})();

async function readFile(path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) {
          reject(err);
        }
        resolve(data);
      });
    });
  }

/**
 * 
 * Check Strategies
 * 
 * */
function didNotBuy(address) {
    for (var j = 0; j < dontBuyTheseTokens.length; j++) {
        if (address == dontBuyTheseTokens[j].address) {
            return false;
        }
    }
    return true;
}


/**
 * 
 * Recieved new Telegram message
 * 
 * */
async function onNewMessage(event) {
    const message = event.message;
    if (message.peerId.channelId == dextoolsChannel) {
        const msg = message.message.replace(/\n/g, " ").split(" ");
        var address = '';
        var pair = '';
        var symbol = '';
        for (var i = 0; i < msg.length; i++) {
            if (msg[i] == 'BSC') {
                try {

                    if (trendingToken == 1) {
                        symbol = msg[5];
                        address = message.entities[2].url.replace("https://www.bscscan.com/token/", "");
                        pair = message.entities[1].url.replace("https://www.dextools.io/app/bsc/pair-explorer/", "");
                    } else if (trendingToken == 15) {
                        symbol = msg[89];
                        address = message.entities[44].url.replace("https://www.bscscan.com/token/", "");
                        pair = message.entities[43].url.replace("https://www.dextools.io/app/bsc/pair-explorer/", "");
                    }
                    var pairContract = new ethers.Contract(pair, pairAbi, account);
                    var token0 = await pairContract.token0();
                    var token1 = await pairContract.token1();
                    var reserves = await pairContract.getReserves();
                    var liquidityBNB;

                    if (token0 == addresses.WBNB) {
                        liquidityBNB = reserves.reserve0;

                    } else if (token1 == addresses.WBNB) {
                        liquidityBNB = reserves.reserve1;
                    }
                    var liquidity = parseInt(ethers.utils.formatUnits(liquidityBNB));

                    if (didNotBuy(address) && liquidity >= buyAllTokensStrategy.minLiquidity && liquidity <= buyAllTokensStrategy.maxLiquidity) {
                        let timeStamp = new Date().toLocaleString();
                        console.log(timeStamp);
                        console.log(symbol);
                        console.log(`<<< Attention new trending token found! Buying ${symbol} now! >>> Contract: ${address}`);
                        token.push({
                            tokenAddress: address,
                            pairAddress: pair,
                            didBuy: false,
                            hasSold: false,
                            tokenSellTax: 10,
                            tokenLiquidityType: 'BNB',
                            tokenLiquidityAmount: liquidity,
                            buyPath: [addresses.WBNB, address],
                            sellPath: [address, addresses.WBNB],
                            contract: new ethers.Contract(address, tokenAbi, account),
                            index: buyCount,
                            investmentAmount: buyAllTokensStrategy.investmentAmount,
                            profitPercent: buyAllTokensStrategy.profitPercent,
                            stopLossPercent: buyAllTokensStrategy.stopLossPercent,
                            gasPrice: buyAllTokensStrategy.gasPrice,
                            checkProfit: function () { checkForProfit(this); },
                            percentOfTokensToSellProfit: buyAllTokensStrategy.percentOfTokensToSellProfit,
                            percentOfTokensToSellLoss: buyAllTokensStrategy.percentOfTokensToSellLoss,
                            initialTrailingStopLossPercent: buyAllTokensStrategy.trailingStopLossPercent,
                            trailingStopLossPercent: buyAllTokensStrategy.trailingStopLossPercent,
                            stopLoss: 0,
                            intitialValue: 0
                        });
                        buy();
                    }
                } catch (e) {


                }

            }

        }

    }
}
