pragma solidity ^0.8.19;

import {Maze} from "./Maze.sol";

contract Resolver {
    Maze maze;
    mapping(bytes32 => address) store;

    constructor(address payable _maze) {
        maze = Maze(_maze);
    }

    function getAddr(bytes32 domain) external view returns(address) {
        return store[domain];
    }

    function setAddr(bytes32 domain, address _address) external returns(bool) {
        require(msg.sender == address(maze) || msg.sender == maze.ownerOf(uint256(domain)));
        store[domain] = _address;
        return true;
    }
}