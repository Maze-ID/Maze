pragma solidity ^0.8.19;

import {Maze} from "./Maze.sol";

contract Resolver {
    Maze public maze;
    address public owner;
    mapping(uint256 => address) private store;
    mapping(address => string) private reverseStore;
    address claim_owner = address(0);

    // События для логирования
    event MazeChanged(address indexed previousMaze, address indexed newMaze);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipClaimed(address indexed newOwner);
    event AddrSet(uint256 indexed domain, address indexed addr);
    event ReverseStoreSet(address indexed addr, string str);

    constructor(address payable _maze) {
        maze = Maze(_maze);
        owner = msg.sender;
    }

    function changeMaze(address payable newMaze) public {
        require(msg.sender == owner, "Caller is not the owner");
        emit MazeChanged(address(maze), newMaze);  // Логируем смену Maze
        maze = Maze(newMaze);
    }

    function transferOwnership(address new_owner) public {
        require(msg.sender == owner, "Caller is not the owner");
        emit OwnershipTransferred(owner, new_owner);  // Логируем передачу прав
        claim_owner = new_owner;
    }

    function claim_ownership() public {
        require(msg.sender == claim_owner, "Caller is not the claim owner");
        emit OwnershipClaimed(claim_owner);  // Логируем претензию на владение
        owner = claim_owner;
        claim_owner = address(0);
    }

    function getAddr(uint256 domain) external view returns(address) {
        return store[domain];
    }

    function getDomainById(uint256 domain) external view returns(string memory) {
        return reverseStore[store[domain]];
    }

    function getDomainByAddress(address addr) external view returns(string memory) {
        return reverseStore[addr];
    }

    function setAddr(uint256 domain, address _address, string memory str) external {
        require(msg.sender == address(maze) || msg.sender == maze.ownerOf(uint256(domain)), "Unauthorized caller");
        store[domain] = _address;
        reverseStore[_address] = str;
        emit AddrSet(domain, _address);  // Логируем установку адреса
        emit ReverseStoreSet(_address, str);  // Логируем установку строки
    }
}
