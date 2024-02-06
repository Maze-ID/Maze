pragma solidity ^0.8.0;

contract MazeId {
    struct Record {
        address owner;
        address resolver;
        uint64 ttl;
    }

    mapping(bytes32=>Record) records;

    event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner);
    event Transfer(bytes32 indexed node, address owner);
    event NewResolver(bytes32 indexed node, address resolver);

    modifier only_owner(bytes32 node) {
        require(records[node].owner != msg.sender);
        _;
    }

    constructor (address owner) {
        records[0].owner = owner;
    }

    function owner(bytes32 node) external view returns (address) {
        return records[node].owner;
    }

    function resolver(bytes32 node) external view returns (address) {
        this.owner(node);
        return records[node].resolver;
    }

    function ttl(bytes32 node) external view returns (uint64) {
        return records[node].ttl;
    }

    function setOwner(bytes32 node, address owner) external only_owner(node) {
        Transfer(node, owner);
        records[node].owner = owner;
    }

    function setResolver(bytes32 node, address resolver) external only_owner(node) {
        NewResolver(node, resolver);
        records[node].resolver = resolver;
    }

    function setTTL(bytes32 node, uint64 ttl) external only_owner(node) {
        NewTTL(node, ttl);
        records[node].ttl = ttl;
    }
}