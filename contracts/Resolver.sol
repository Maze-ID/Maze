pragma solidity ^0.8.19;

import {Maze} from "./Maze.sol";

contract Resolver {
    Maze public maze;
    address public owner;
    mapping(bytes32 => address) store;

    constructor(address payable _maze) {
        maze = Maze(_maze);
        owner = msg.sender;
    }

    function changeMaze(address payable newMaze) public {
        require(msg.sender == owner);
        maze = Maze(newMaze);
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