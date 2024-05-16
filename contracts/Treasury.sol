pragma solidity ^0.8.19;

contract Treasury {
    address private owner;
    constructor() {
        owner = msg.sender;
    }
    function withdraw() external {
        require(msg.sender == owner);
        (bool success, ) = payable(owner).call{value: address(this).balance}("");
        require(success);
    }

    function changeOwner(address newOwner) external {
        require(msg.sender == owner);
        owner = newOwner;
    }
    receive() external payable {}
}