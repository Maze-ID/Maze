require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("solidity-coverage");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  etherscan: {
    apiKey: {
      blast_sepolia: "blast_sepolia", // apiKey is not required, just set a placeholder
    },
    customChains: [
      {
        network: "blast_sepolia",
        chainId: 168587773,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/168587773/etherscan",
          browserURL: "https://testnet.blastscan.io"
        }
      }
    ]
  },
  networks: {
    // for mainnet
    "blast-mainnet": {
      url: "coming end of February",
      accounts: [process.env.MAINNET_PRIVATE_KEY],
    },
    // for Sepolia testnet
    "blast_sepolia": {
      url: "https://sepolia.blast.io",
      accounts: [process.env.TESTNET_PRIVATE_KEY],
    },
    // for local dev environment
    "blast-local": {
      url: "http://localhost:8545",
      blockGasLimit: 40000000,
      accounts: [
        "8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      ], // hardhat keys
    },
  },
  defaultNetwork: "blast-local",
};
