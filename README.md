# Architecture Overview

The architecture of the decentralized domain name management system, as delineated through the `Maze`, `Resolver`, and `Pricer` contracts, presents a comprehensive and cohesive framework designed to facilitate the registration, management, and resolution of domain names within the Ethereum blockchain. This system not only offers a novel approach to domain name management in a decentralized context but also incorporates flexibility, security, and user-centric features to enhance the overall utility and adoption of blockchain-based domain names.

## High-Level Overview

- **Maze Contract**: At the core of the architecture, the `Maze` contract acts as the primary interface for users wishing to rent domain names. It leverages the ERC721 standard to treat domain names as non-fungible tokens (NFTs), thereby ensuring clear ownership and transferability. The contract integrates mechanisms for domain registration, renewal, and transfer, alongside innovative features like refundable rentals based on specific conditions. The integration with the `Resolver` and `Pricer` contracts allows for dynamic domain name resolution and pricing, respectively.

- **Resolver Contract**: This contract is essential for mapping domain names to Ethereum addresses and vice versa, facilitating a crucial functionality that allows human-readable domain names to be associated with blockchain addresses. Such functionality is pivotal for enhancing user experience and accessibility within the decentralized web, making it easier for users to interact with blockchain applications and services.

- **Pricer Contract**: The `Pricer` contract introduces a dynamic and flexible pricing model for domain name rentals. It calculates rental prices based on several factors, including the rental duration, the domain name's length, and the option for refunds. This contract ensures that the pricing strategy can adapt to market demands and domain value, maintaining economic balance and fairness.


# Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a script that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.js
```
