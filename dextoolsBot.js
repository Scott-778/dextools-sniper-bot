/*
Dextools Trending bot

join this channel https://t.me/dextoolstrendingalerts

This bot buys the number 1 trending BSC token on dextools automatically and will sell automatically when profit target reached or stop loss reached. 

first time around it will buy the number 1 trending token on dextools, if the number 1 trending token changes it will automatically buy the new number 1 token. 
it wont buy the same token twice while it is running.   


Go to my.telegram.org and create App to get api_id and api_hash.
*/
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const { NewMessage } = require('telegram/events');
const ethers = require('ethers');
const open = require('open');
require('dotenv').config();

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
const buyAllTokensStrategy = {

    investmentAmount: '0.1', // Amount to invest per token in BNB
    gasPrice: ethers.utils.parseUnits('6', 'gwei'),
    profitPercent: 100,      // 100% profit
    stopLossPercent: 10,  // 10% loss
    percentOfTokensToSellProfit: 75, // sell 75% when profit is reached
    percentOfTokensToSellLoss: 100, // sell 100% when stoploss is reached 
    trailingStopLossPercent: 15 // 15% trailing stoploss
}

//put token addresses that you dont want to buy here
const dontBuyTheseTokens = [
'0xe9e7cea3dedca5984780bafc599bd69add087d56',
'',
'',

];

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
let pairAbi = ['function token0() external view returns (address)'];

let token = [];
var sellCount = 0;
var buyCount = 0;
const buyContract = new ethers.Contract(addresses.buyContract, tokenAbi, account);
const dextoolsChannel = 1656790615;

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

    const choices = ['Default', 'Enter Settings']

    await input.select('Welcome, please choose a buying strategy', choices).then(async function (answers) {
        if (answers == 'Enter Settings') {
            numberOfTokensToBuy = parseInt(await input.text("Enter how many different tokens you want to buy"));
            buyAllTokensStrategy.investmentAmount = await input.text("Enter Investment Amount in BNB");
            buyAllTokensStrategy.gasPrice = ethers.utils.parseUnits(await input.text("Enter Gas Price"), 'gwei');
            buyAllTokensStrategy.profitPercent = parseFloat(await input.text("Enter profit percent you want"));
            buyAllTokensStrategy.stopLossPercent = parseFloat(await input.text("Enter max loss percent"));
            buyAllTokensStrategy.trailingStopLossPercent = parseFloat(await input.text("Enter trailing stop loss percent"));
            buyAllTokensStrategy.percentOfTokensToSellProfit = parseFloat(await input.text("Enter percent of tokens to sell when profit reached"));
            buyAllTokensStrategy.percentOfTokensToSellLoss = parseFloat(await input.text("Enter percent of tokens to sell when stop loss reached"));

        }


    });

    client.addEventHandler(onNewMessage, new NewMessage({}));
    console.log('\n', "Waiting for telegram notification to buy...");
   

})();

/**
 * 
 * Check Strategies
 * 
 * */
function didNotBuy(address) {
    for (var i = 0; i < token.length; i++) {
        if (address == token[i].tokenAddress) {
            return false;
        } else {
            return true;
        }
    }
    for(var j = 0; j<dontBuyTheseTokens.length; j++){
        if(address == dontBuyTheseTokens[j]){
            return false;
        }else{
            return true;
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
        for (var i = 0; i < msg.length; i++) {
            if (msg[i] == 'BSC') {
                let timeStamp = new Date().toLocaleString();
                console.log(timeStamp);
                address = message.entities[2].url.replace("https://www.bscscan.com/token/","");
                pair = message.entities[1].url.replace("https://www.dextools.io/app/bsc/pair-explorer/","");
                var pairContract = new ethers.Contract(pair, pairAbi, account);
                var liquidityToken = await pairContract.token0();
            }
        }
        if (didNotBuy(address) && liquidityToken == addresses.WBNB) {
            console.log('<<< Attention new trending token found! Buying token now! >>> Contract:', address);
            token.push({
                tokenAddress: address,
                pairAddress: pair,
                didBuy: false,
                hasSold: false,
                tokenSellTax: 10,
                tokenLiquidityType: 'BNB',
                tokenLiquidityAmount: 0,
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
        } else {
            
        }
        
    }
}
