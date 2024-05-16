// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Pricer {
    address public owner;

    // Structure to hold prices
    struct Prices {
        uint256 noRefundPricePerMonth;
        uint256 refundPricePerMonth;
    }

    // Multipliers for prices based on domain length
    mapping(uint => uint256) public lengthMultipliers;

    // Monthly prices for different sale types
    Prices public prices;

    constructor() {
        owner = msg.sender;
        // Initialize default values
        lengthMultipliers[3] = 125;
        lengthMultipliers[4] = 115;
        lengthMultipliers[5] = 110;
        prices.noRefundPricePerMonth = 0.0005 ether;
        prices.refundPricePerMonth = 0.001 ether;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this.");
        _;
    }

    // Function to change length multipliers
    function setLengthMultiplier(uint length, uint256 multiplier) public onlyOwner {
        lengthMultipliers[length] = multiplier;
    }

    // Function to change prices
    function setPrices(uint256 _noRefundPricePerMonth, uint256 _refundPricePerMonth) public onlyOwner {
        prices.noRefundPricePerMonth = _noRefundPricePerMonth;
        prices.refundPricePerMonth = _refundPricePerMonth;
    }

    // Calculate the price of a domain based on duration, refund option, and length
    function calculatePrice(uint8 duration, bool refund, uint256 length) public view returns (uint256) {
        uint256 basePricePerMonth = refund ? prices.refundPricePerMonth : prices.noRefundPricePerMonth;
        uint256 multiplier = lengthMultipliers[length] == 0 ? 100 : lengthMultipliers[length];
        uint256 price;

        // Determine the price based on the duration
        if (duration <= 3) {
            price = basePricePerMonth * 3;
        } else if (duration <= 6) {
            price = basePricePerMonth * 6;
        } else {
            price = basePricePerMonth * 9;
        }

        // Apply length multiplier
        return price * multiplier / 100;
    }
}

