import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers],
  paths: {
    sources: "./contracts/src",
    tests: "./tests",
    cache: "./cache/hardhat",
    artifacts: "./artifacts/hardhat",
  },
  solidity: {
    version: "0.8.36",
    path: "./node_modules/solc/soljson.js",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
});

