pragma solidity ^0.8.19;
import {Pricer} from "./Pricer.sol";

contract PaymentProcessor {
    Pricer private pricer;

    constructor(address _pricer) {
        pricer = Pricer(_pricer);
    }

    function payForDomain(uint8 duration, uint256 length, bool isRefund, uint256 value) payable external returns(bool) {
        uint256 price = pricer.calculatePrice(duration, isRefund, length);
        require(value == price, "Insufficient ether");
        return true;
    }

}