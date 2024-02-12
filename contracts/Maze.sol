pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "contracts/interfaces/IBlast.sol";
import {Resolver} from "./Resolver.sol";
import "hardhat/console.sol";

contract Maze is ERC721, Ownable, ReentrancyGuard {
    struct Domain {
        bool isRefund;
        uint256 value;
    }

    mapping (bytes32 => Domain) domainInformation;
    mapping (uint256 => uint256) expiries;

    uint256 public priceForMonthWithRefund = 0.004 ether;
    uint256 public priceForMonthWithoutRefund = 0.002 ether;
    uint256 public grace_period = 15 days;
    Resolver public resolver;

    modifier isDomainFree(bytes32 domain) {
        uint256 id = uint256(domain);
        require(_ownerOf(id) == address(0) 
        || ((_ownerOf(id) != address(0) 
        && expiries[id] + grace_period < block.timestamp)), "Domain is not available");
        _;
    }

    constructor() ERC721("MazeID", "MAZE") Ownable(msg.sender) {
        //IBlast(0x4300000000000000000000000000000000000002).configureClaimableYield();
        //IBlast(0x4300000000000000000000000000000000000002).configureGovernor(msg.sender)
    }

    // Function to change the grace period
    function changeGracePeriod(uint256 newGracePeriod) public onlyOwner {
        grace_period = newGracePeriod;
    }


    // Set function for priceForMonth
    function setPriceForMonth(uint256 _priceForMonth) public onlyOwner {
        priceForMonthWithRefund = _priceForMonth;
    }

    function setPriceForMonthWithoutRefund(uint256 _priceForMonth) public onlyOwner {
        priceForMonthWithoutRefund = _priceForMonth;
    }

    // Function to set the resolver
    function setResolver(address _resolver) public onlyOwner {
        resolver = Resolver(_resolver);
    }

    // Function to calculate the rental price for a domain for a given number of months
    function calculatePrice(uint8 duration, bool refund) view private returns (uint256) {
        // Check conditions to determine the price based on the duration
        if (duration  <= 3) {
            if (refund) {
                return priceForMonthWithRefund * 3;
            } else {
                 return priceForMonthWithoutRefund * 3;
            }
        } else if (duration <= 6) {
            if (refund) {
                return priceForMonthWithRefund * 6;
            } else {
                 return priceForMonthWithoutRefund * 6;
            }
        }
        if (refund) {
                return priceForMonthWithRefund * 9;
        } else {
                 return priceForMonthWithoutRefund * 9;
        }
    }

    function ownerOf(
        uint256 tokenId
    ) public view override returns (address) {
        require(expiries[tokenId] + grace_period > block.timestamp, "Domain rent failed");
        return super.ownerOf(tokenId);
    }


    // Function for renting a domain
    function rentWithRefund(bytes32 domain, uint8 duration) payable public isDomainFree(domain) nonReentrant() {
        require(duration > 0 && duration < 13, "Incorrect duration");
        uint256 price = calculatePrice(duration, true);
        require(msg.value == price, "Insufficient ether");
        uint256 id = uint256(domain);
        uint256 valueToRefund;
        address previousOwner = _ownerOf(id);
        if (domainInformation[domain].isRefund) {
            valueToRefund = domainInformation[domain].value;
        }
        domainInformation[domain].value = price;
        expiries[id] = block.timestamp + duration * 30 * (1 days);
        mint(previousOwner, id);

        if (domainInformation[domain].isRefund) {
            refundPartFromThirdFace(previousOwner, valueToRefund);
        } else {
            domainInformation[domain].isRefund = true;
        }

        bool success1 = resolver.setAddr(domain, msg.sender);
        require(success1, "transaction failed");
    }

    function mint(address previousOwner, uint256 id) private {
        if (previousOwner == address(0)) {
            _mint(msg.sender, id);
        } else {
            _transfer(previousOwner, msg.sender, id);
        }
    }

    // Function to buy Domain
    function rentWithoutRefund(bytes32 domain, uint8 duration) payable public isDomainFree(domain) nonReentrant() {
        require(duration > 0 && duration < 13, "Incorrect duration");
        uint256 price = calculatePrice(duration, false);
        require(msg.value == price, "Insufficient ether");
        uint256 id = uint256(domain);
        uint256 valueToRefund;
        address previousOwner = _ownerOf(id);
        if (domainInformation[domain].isRefund) {
            valueToRefund = domainInformation[domain].value;
        }
        domainInformation[domain].value = price;
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
    }

    // Function to get domain value
    function getDomainValue(bytes32 domain) view public returns (uint256) {
        return domainInformation[domain].value;
    }

    // Function to check if domain is permanent
    function isDomainRefund(bytes32 domain) view public returns (bool) {
        return domainInformation[domain].isRefund;
    }

    // Function to get domain TTL
    function getDomainTTL(bytes32 domain) view public returns (uint256) {
        return expiries[uint256(domain)];
    }

    function changeStoredAddress(bytes32 domain, address _address) private {
        resolver.setAddr(domain, _address);
    }

    function refundFull(bytes32 domain) external nonReentrant() {
        uint256 id = uint256(domain);
        address domainOwner = _ownerOf(id);
        require(domainOwner != address(0) && domainOwner == msg.sender, "Only owner can refund full price in refund period");
        require(domainInformation[domain].isRefund == true, "Domain is not available for refund");
        require(expiries[id] < block.timestamp && expiries[id] + grace_period >= block.timestamp, "You cant refund all funds");
        (bool success, ) = payable(domainOwner).call{value: domainInformation[domain].value}("");
        require(success);
    }

    function refundPartFromThirdFace(address previousOwner, uint256 value) private {
        require(previousOwner != address(0), "Domain is free and not available for refund");
        (bool success1, ) = payable(previousOwner).call{value: value / 2 }("");
        (bool success2, ) = payable(msg.sender).call{value: value / 4 }("");
        (bool success3, ) = payable(owner()).call{value: value / 4 }("");

        require(success1 && success2 && success3, "Refund Failed");
    }

    function refundHalf(bytes32 domain) external nonReentrant() {
        uint256 id = uint256(domain);
        address domainOwner = _ownerOf(id);
        require(msg.sender == domainOwner || msg.sender == owner(), "Not eligible to refund");
        require(domainOwner != address(0), "Domain is free and not available for refund");
        require(expiries[id] + grace_period < block.timestamp, "You cant refund part funds");
        uint256 fullRefundValue = domainInformation[domain].value;

        (bool success1, ) = payable(domainOwner).call{value: fullRefundValue / 2 }("");
        (bool success2, ) = payable(owner()).call{value: fullRefundValue / 2 }("");

        require(success1 && success2, "Refund Failed");
    }

    receive() payable external {

    }
}