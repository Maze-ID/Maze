pragma solidity ^0.8.19;

import {Maze} from "./Maze.sol";

contract Resolver {
    Maze public maze;
    address public owner;
    mapping(uint256 => address) public store;
    mapping(address => string) private reverseStore;

    constructor(address payable _maze) {
        maze = Maze(_maze);
        owner = msg.sender;
    }

    function changeMaze(address payable newMaze) public {
        require(msg.sender == owner);
        maze = Maze(newMaze);
    }

    function getAddr(uint256 domain) external view returns(address) {
        return store[domain];
    }

    function getDomain(uint256 domain) external view returns(string memory) {
        return reverseStore[store[domain]];
    }

    function setAddr(uint256 domain, address _address, string memory str) external returns(bool) {
        require(msg.sender == address(maze) || msg.sender == maze.ownerOf(uint256(domain)));
        store[domain] = _address;
        reverseStore[_address] = str;
        return true;
    }
}