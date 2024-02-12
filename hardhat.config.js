require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();
require('solidity-coverage')


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    // for mainnet
    "blast-mainnet": {
      url: "coming end of February",
      accounts: [process.env.PRIVATE_KEY],
    },
    // for Sepolia testnet
    "blast-sepolia": {
      url: "https://sepolia.blast.io",
      accounts: [process.env.PRIVATE_KEY, "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"],
    },
    // for local dev environment
    "blast-local": {
      url: "http://localhost:8545",
    },
  },
  defaultNetwork: "blast-local",
 
};
