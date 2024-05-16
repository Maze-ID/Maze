// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Resolver} from "./Resolver.sol";
import {PaymentProcessor} from "./PaymentProcessor.sol";
import "hardhat/console.sol";

interface IBlast {
    function configureClaimableYield() external;

    function configureGovernor(address _governor) external;
}

contract Maze is ERC721, Ownable, ReentrancyGuard {
    struct Domain {
        string domainName;
        bool isRefund;
        uint256 value;
        uint256 length;
        uint256 expiries;
        address resolver;
    }

    mapping(uint256 => Domain) private domainInformation;
    uint256 public grace_period = 15 days;
    Resolver public resolver;
    PaymentProcessor public payment;
    address payable public treasury;

    event DomainRented(
        uint256 indexed domain,
        address indexed owner,
        string indexed domainName,
        uint256 duration,
        bool isRefund,
        uint256 value
    );
    event DomainRenewed(
        uint256 indexed domain,
        uint256 duration,
        bool isRefund
    );
    event DomainRefunded(
        uint256 indexed domain,
        uint256 value,
        address receiver
    );
    event ThirdFaceRefunded(uint256 value, address indexed thirdFace);

    modifier isDomainFree(uint256 domain) {
        require(
            _ownerOf(domain) == address(0) ||
                (
                    (_ownerOf(domain) != address(0) &&
                        domainInformation[domain].expiries + grace_period <
                        block.timestamp)
                ),
            "Domain is not available"
        );
        _;
    }

    modifier checkCorrectData(uint8 duration, string memory domainName) {
        require(duration > 0 && duration < 13, "Incorrect duration");
        bytes memory domainBytes = bytes(domainName);
        require(validateDomain(domainBytes), "Domain is in incorrect form");
        _;
    }

    constructor(
        address _payment
    ) ERC721("MazeID", "MAZE") Ownable(msg.sender) {
        // IBlast(0x4300000000000000000000000000000000000002)
        //     .configureClaimableYield();
        // IBlast(0x4300000000000000000000000000000000000002).configureGovernor(
        //     msg.sender
        // );
        payment = PaymentProcessor(_payment);
        treasury = payable(msg.sender);
    }

    // Function to change the grace period
    function changeGracePeriod(uint256 newGracePeriod) public onlyOwner {
        require(
            newGracePeriod > 5 days,
            "Invalid duration, need to be more than 5 days"
        );
        grace_period = newGracePeriod;
    }

    // Function to set the resolver
    function setResolver(address _resolver) public onlyOwner {
        resolver = Resolver(_resolver);
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        require(
            _ownerOf(tokenId) == address(0) ||
                (_ownerOf(tokenId) != address(0) &&
                    domainInformation[tokenId].expiries + grace_period >
                    block.timestamp),
            "Your rent is over"
        );
        return super.ownerOf(tokenId);
    }

    function setPayment(address _payment) public onlyOwner {
        payment = PaymentProcessor(_payment);
    }

    function setTreasury(address payable _treasury) public onlyOwner {
        treasury = _treasury;
    }

    // Function for renting a domain
    function rent(
        uint256 id,
        uint8 duration,
        string memory domainName,
        bool isRefund
    )
        public
        payable
        checkCorrectData(duration, domainName)
        isDomainFree(id)
        nonReentrant
    {
        require(
            payment.payForDomain(
                duration,
                bytes(domainName).length,
                isRefund,
                msg.value
            ),
            "Payment Failed"
        );

        uint256 valueToRefund;
        address previousOwner = _ownerOf(id);
        if (domainInformation[id].isRefund) {
            valueToRefund = domainInformation[id].value;
        }

        setDomainValues(id, duration, domainName, isRefund ? msg.value : 0);

        mint(previousOwner, id);

        if (domainInformation[id].isRefund) {
            refundAfterRent(previousOwner, valueToRefund);
        }
        domainInformation[id].isRefund = isRefund;
        if (!isRefund) {
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Transaction failed");
        }
        require(
            resolver.setAddr(id, msg.sender, domainName),
            "transaction failed"
        );
        emit DomainRented(
            id,
            msg.sender,
            domainName,
            duration,
            true,
            msg.value
        );
    }

    function renew(
        uint256 id,
        uint8 duration,
        bool isRefund
    ) external payable nonReentrant {
        require(duration > 0 && duration < 13, "Incorrect duration");
        require(msg.sender == ownerOf(id), "You are not a domain owner");
        require(
            payment.payForDomain(
                duration,
                domainInformation[id].length,
                isRefund,
                msg.value
            ),
            "Payment Failed"
        );

        if (isRefund) {
            if (domainInformation[id].isRefund) {
                domainInformation[id].value += msg.value;
            } else {
                domainInformation[id].value = msg.value;
                domainInformation[id].isRefund = true;
            }
            domainInformation[id].expiries += duration * 30 * (1 days);
        } else {
            domainInformation[id].expiries += duration * 30 * (1 days);
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success);
        }
        emit DomainRenewed(id, duration, isRefund);
    }

    function setDomainResolver(uint256 id, address _resolver) external {
        require(msg.sender == ownerOf(id));
        domainInformation[id].resolver = _resolver;
    }

    function getDomainInformaton(
        uint256 id
    ) external view returns (string memory, bool, uint256, uint256, uint256) {
        Domain memory d = domainInformation[id];
        return (d.domainName, d.isRefund, d.value, d.length, d.expiries);
    }

    function refund(uint256 id) external nonReentrant {
        address domainOwner = _ownerOf(id);
        require(
            domainInformation[id].expiries < block.timestamp,
            "You cant refund funds in this timestamp"
        );
        require(
            domainOwner != address(0) &&
                (domainOwner == msg.sender || msg.sender == owner()),
            "Only owner can refund full price in refund period"
        );
        require(
            domainInformation[id].isRefund == true,
            "Domain is not available for refund"
        );
        bool success1 = resolver.setAddr(
            id,
            address(0),
            domainInformation[id].domainName
        );
        require(success1);
        uint256 refundValue = domainInformation[id].value;
        if (domainInformation[id].expiries + grace_period < block.timestamp) {
            refundValue = domainInformation[id].value / 2;
            (bool success2, ) = treasury.call{value: refundValue / 2}("");
            require(success2, "transaction failed");
        }
        resetDomain(id);
        (bool success, ) = payable(domainOwner).call{value: refundValue}("");
        require(success, "Transaction Failed");
        emit DomainRefunded(id, refundValue, msg.sender);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        super.transferFrom(from, to, tokenId);
        require(
            resolver.setAddr(
                tokenId,
                to,
                domainInformation[tokenId].domainName
            ),
            "transaction failed"
        );
    }

    function refundAfterRent(address previousOwner, uint256 value) private {
        require(
            previousOwner != address(0),
            "Domain is free and not available for refund"
        );
        (bool success1, ) = payable(previousOwner).call{value: value / 2}("");
        (bool success2, ) = payable(msg.sender).call{value: value / 4}("");
        (bool success3, ) = treasury.call{value: value / 4}("");

        require(success1 && success2 && success3, "Refund Failed");
        emit ThirdFaceRefunded(value, msg.sender);
    }

    function resetDomain(uint256 domain) private {
        domainInformation[domain].value = 0;
        domainInformation[domain].isRefund = false;
        domainInformation[domain].expiries = 0;
    }

    function setDomainValues(
        uint256 id,
        uint8 duration,
        string memory domainName,
        uint256 value
    ) private {
        domainInformation[id].value = value;
        domainInformation[id].length = bytes(domainName).length;
        domainInformation[id].domainName = domainName;
        domainInformation[id].expiries =
            block.timestamp +
            duration *
            30 *
            (1 days);
    }

    function mint(address previousOwner, uint256 id) private {
        if (previousOwner == address(0)) {
            _mint(msg.sender, id);
        } else {
            _transfer(previousOwner, msg.sender, id);
        }
    }

    function validateDomain(
        bytes memory domainBytes
    ) private pure returns (bool) {
        if (domainBytes.length == 0 || domainBytes.length > 16) {
            return false;
        }
        for (uint i = 0; i < domainBytes.length; i++) {
            bytes1 char = domainBytes[i];
            if (
                !((char >= 0x30 && char <= 0x39) ||
                    (char >= 0x61 && char <= 0x7A))
            ) {
                return false;
            }
        }
        return true;
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://QmREqDUAYtvoURZw1rKK2mSYyNban7GzxqqCju7SVvRkod";
    }

    function tokenURI(
        uint256 tokenId
    ) public pure override returns (string memory) {
        return _baseURI();
    }

    receive() external payable {}
}
