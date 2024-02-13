// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Resolver} from "./Resolver.sol";
import "hardhat/console.sol";
import {Pricer} from "./Pricer.sol";

interface IBlast {
     function configureClaimableYield() external;

     function configureGovernor(address _governor) external;
}

contract Maze is ERC721, Ownable, ReentrancyGuard {
    struct Domain {
        bool isRefund;
        uint256 value;
        uint256 length;
    }
    mapping(bytes32 => Domain) private domainInformation;
    mapping(uint256 => uint256) private expiries;
    uint256 public grace_period = 15 days;
    Resolver public resolver;
    Pricer public pricer;

    event DomainRented(bytes32 indexed domain, address indexed owner, uint256 duration, bool isRefund, uint256 value);
    event DomainRenewed(bytes32 indexed domain, uint256 duration, bool isRefund);
    event FullDomainRefunded(bytes32 indexed domain, uint256 value);
    event HalfDomainRefunded(bytes32 indexed domain, uint256 fullRefundValue);


    modifier isDomainFree(bytes32 domain) {
        uint256 id = uint256(domain);
        require(
            _ownerOf(id) == address(0) ||
                (
                    (_ownerOf(id) != address(0) &&
                        expiries[id] + grace_period < block.timestamp)
                ),
            "Domain is not available"
        );
        _;
    }


    constructor(address _pricer) ERC721("MazeID", "MAZE") Ownable(msg.sender) {
        IBlast(0x4300000000000000000000000000000000000002).configureClaimableYield();
        IBlast(0x4300000000000000000000000000000000000002).configureGovernor(msg.sender);
        pricer = Pricer(_pricer);
    }

    // function to change pricer
    function changePricer(address newPricer) public onlyOwner {
        pricer = Pricer(newPricer);
    }

    // Function to change the grace period
    function changeGracePeriod(uint256 newGracePeriod) public onlyOwner {
        require(newGracePeriod > 5 days, "Invalid duration, need to be more than 5 days");
        grace_period = newGracePeriod;
    }

    // Function to set the resolver
    function setResolver(address _resolver) public onlyOwner {
        resolver = Resolver(_resolver);
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        require(
            expiries[tokenId] + grace_period > block.timestamp,
            "Domain rent failed"
        );
        return super.ownerOf(tokenId);
    }

    // Function for renting a domain
    function rentWithRefund(
        bytes32 domain,
        uint8 duration,
        string memory domainName
    )
        public
        payable
        isDomainFree(domain)
        nonReentrant
    {
        require(duration > 0 && duration < 13, "Incorrect duration");
        bytes memory domainBytes = bytes(domainName);
        require(validateDomain(domainBytes), "Domain is in incorrect form" );
        uint256 price = pricer.calculatePrice(duration, true, domainBytes.length);
        require(msg.value == price, "Insufficient ether");

        uint256 id = uint256(domain);
        uint256 valueToRefund;
        address previousOwner = _ownerOf(id);
        if (domainInformation[domain].isRefund) {
            valueToRefund = domainInformation[domain].value;
        }
        domainInformation[domain].value = price;
        domainInformation[domain].length = domainBytes.length;
        expiries[id] = block.timestamp + duration * 30 * (1 days);
        mint(previousOwner, id);

        if (domainInformation[domain].isRefund) {
            refundPartFromThirdFace(previousOwner, valueToRefund);
        } else {
            domainInformation[domain].isRefund = true;
        }

        bool success1 = resolver.setAddr(domain, msg.sender);
        require(success1, "transaction failed");
        emit DomainRented(domain, msg.sender, duration, true, price); // Вызов события аренды

    }

    function mint(address previousOwner, uint256 id) private {
        if (previousOwner == address(0)) {
            _mint(msg.sender, id);
        } else {
            _transfer(previousOwner, msg.sender, id);
        }
    }

    // Function to buy Domain
    function rentWithoutRefund(
        bytes32 domain,
        uint8 duration,
        string memory domainName
    ) public payable isDomainFree(domain) nonReentrant {
        require(duration > 0 && duration < 13, "Incorrect duration");
        bytes memory domainBytes = bytes(domainName);
        require(validateDomain(domainBytes), "Domain is in incorrect form" );
        uint256 price = pricer.calculatePrice(duration, false, domainBytes.length);
        require(msg.value == price, "Insufficient ether");


        uint256 id = uint256(domain);
        uint256 valueToRefund;
        address previousOwner = _ownerOf(id);
        if (domainInformation[domain].isRefund) {
            valueToRefund = domainInformation[domain].value;
        }
        domainInformation[domain].value = price;
        domainInformation[domain].length = domainBytes.length;
        expiries[id] = block.timestamp + duration * 30 * (1 days);
        if (previousOwner == address(0)) {
            _mint(msg.sender, id);
        } else {
            _transfer(previousOwner, msg.sender, id);
        }
        if (domainInformation[domain].isRefund) {
            domainInformation[domain].isRefund = false;
            refundPartFromThirdFace(previousOwner, valueToRefund);
        }
        bool success1 = resolver.setAddr(domain, msg.sender);
        (bool success2, ) = payable(owner()).call{value: msg.value}("");
        require(success1 && success2, "transaction failed");
        emit DomainRented(domain, msg.sender, duration, true, price);

    }

    function renew(bytes32 domain, uint8 duration, bool isRefund) external payable nonReentrant() {
        uint256 id = uint256(domain);
        require(duration > 0 && duration < 13, "Incorrect duration");
        require(msg.sender == ownerOf(id), "You are not owner");
        require(pricer.calculatePrice(duration, isRefund, domainInformation[domain].length) == msg.value, "Insuffient eth amount");
        if (isRefund) {
            domainInformation[domain].value += msg.value;
            expiries[id] += duration * 30 * (1 days);
        } else {
            expiries[id] += duration * 30 * (1 days);
            (bool success, ) = payable(owner()).call{value:msg.value}("");
            require(success);
        }
        emit DomainRenewed(domain, duration, isRefund); // Вызов события продления аренды

    }

    // Function to get domain value
    function getDomainValue(bytes32 domain) public view returns (uint256) {
        return domainInformation[domain].value;
    }

    // Function to check if domain is permanent
    function isDomainRefund(bytes32 domain) public view returns (bool) {
        return domainInformation[domain].isRefund;
    }

    // Function to get domain TTL
    function getDomainTTL(bytes32 domain) public view returns (uint256) {
        return expiries[uint256(domain)];
    }

    function changeStoredAddress(bytes32 domain, address _address) private {
        resolver.setAddr(domain, _address);
    }

    function refundFull(bytes32 domain) external nonReentrant {
        uint256 id = uint256(domain);
        address domainOwner = _ownerOf(id);
        require(
            domainOwner != address(0) && domainOwner == msg.sender,
            "Only owner can refund full price in refund period"
        );
        require(
            domainInformation[domain].isRefund == true,
            "Domain is not available for refund"
        );
        require(
            expiries[id] < block.timestamp &&
                expiries[id] + grace_period >= block.timestamp,
            "You cant refund all funds"
        );
        bool success1 = resolver.setAddr(domain, address(0));
        require(success1);
        uint256 refundValue = domainInformation[domain].value;
        domainInformation[domain].value = 0;
        domainInformation[domain].isRefund = false;
        expiries[id] = 0;
        (bool success, ) = payable(domainOwner).call{
            value: refundValue
        }("");
        require(success, "Transaction Failed");
        emit FullDomainRefunded(domain, refundValue);

    }

    function validateDomain(bytes memory domainBytes) pure private returns (bool) {
        if (domainBytes.length == 0 || domainBytes.length > 16) {
            return false; // Проверка длины
        }
        for (uint i = 0; i < domainBytes.length; i++) {
            // Проверка на допустимые символы: латинские буквы, цифры и дефис
            bytes1 char = domainBytes[i];
            if (!((char >= 0x30 && char <= 0x39) || (char >= 0x61 && char <= 0x7A))) {
                return false;
            }
        }
        return true;
    }

    function refundPartFromThirdFace(
        address previousOwner,
        uint256 value
    ) private {
        require(
            previousOwner != address(0),
            "Domain is free and not available for refund"
        );
        (bool success1, ) = payable(previousOwner).call{value: value / 2}("");
        (bool success2, ) = payable(msg.sender).call{value: value / 4}("");
        (bool success3, ) = payable(owner()).call{value: value / 4}("");

        require(success1 && success2 && success3, "Refund Failed");
    }

    function refundHalf(bytes32 domain) external nonReentrant {
        uint256 id = uint256(domain);
        address domainOwner = _ownerOf(id);
        require(
            msg.sender == domainOwner || msg.sender == owner(),
            "Not eligible to refund"
        );
        require(
            domainOwner != address(0),
            "Domain is free and not available for refund"
        );
        require(
            domainInformation[domain].isRefund == true,
            "Domain is not available for refund"
        );
        require(
            expiries[id] + grace_period < block.timestamp,
            "You cant refund part funds"
        );
        bool success3 = resolver.setAddr(domain, address(0));
        require(success3);
        uint256 fullRefundValue = domainInformation[domain].value;
        domainInformation[domain].value = 0;
        domainInformation[domain].isRefund = false;
        expiries[id] = 0;
        (bool success1, ) = payable(domainOwner).call{
            value: fullRefundValue / 2
        }("");
        (bool success2, ) = payable(owner()).call{value: fullRefundValue / 2}(
            ""
        );


        require(success1 && success2, "Refund Failed");
        emit HalfDomainRefunded(domain, fullRefundValue); // Вызов события возврата средств
    }
    function _baseURI() internal pure override returns(string memory) {
        return "ipfs://QmREqDUAYtvoURZw1rKK2mSYyNban7GzxqqCju7SVvRkod";
    }
    function tokenURI(uint256 tokenId) public pure override returns(string memory) {
        return _baseURI();
    }
    receive() external payable {}
}
