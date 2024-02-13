const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pricer Contract", function () {
  let pricer;
  let owner;
  let addr1;

  beforeEach(async function () {
    // Deploy the contract before each test
    [owner, addr1] = await ethers.getSigners();
    const Pricer = await ethers.getContractFactory("Pricer", owner);
    this.pricer = await Pricer.deploy();
  });

  describe("Ownership", function () {
    it("Should set the right owner", async function () {
      expect(await this.pricer.owner()).to.equal(owner.address);
    });
  });

  describe("Setting prices and multipliers", function () {
    it("Should allow the owner to set length multipliers", async function () {
      await this.pricer.setLengthMultiplier(6, 105);
      expect(await this.pricer.lengthMultipliers(6)).to.equal(105);
    });

    it("Should prevent non-owners from setting length multipliers", async function () {
      await expect(this.pricer.connect(addr1).setLengthMultiplier(6, 105)).to.be.revertedWith("Only the owner can call this.");
    });

    it("Should allow the owner to set prices", async function () {
      await this.pricer.setPrices(ethers.parseEther("0.002"), ethers.parseEther("0.004"));
      const prices = await this.pricer.prices();
      expect(prices.noRefundPricePerMonth).to.equal(ethers.parseEther("0.002"));
      expect(prices.refundPricePerMonth).to.equal(ethers.parseEther("0.004"));
    });

    it("Should prevent non-owners from setting prices", async function () {
      await expect(this.pricer.connect(addr1).setPrices(ethers.parseEther("0.002"), ethers.parseEther("0.004"))).to.be.revertedWith("Only the owner can call this.");
    });
  });

  describe("Calculating domain prices", function () {
    beforeEach(async function () {
      // Set up some default multipliers and prices for the tests
      await this.pricer.setLengthMultiplier(3, 125);
      await this.pricer.setLengthMultiplier(4, 115);
      await this.pricer.setPrices(ethers.parseEther("0.001"), ethers.parseEther("0.003"));
    });

    it("Should calculate the correct price for a domain", async function () {
      const price = await this.pricer.calculatePrice(3, true, 3); // 3 months, refund option, 3 characters
      expect(price).to.equal(ethers.parseEther("0.01125")); // (0.003 ether * 3 months) * 125%
    });

    it("Should default to a 100% multiplier if the length is not set", async function () {
      const price = await this.pricer.calculatePrice(6, false, 7); // 6 months, no refund option, 7 characters (no specific multiplier)
      expect(price).to.equal(ethers.parseEther("0.006")); // (0.001 ether * 6 months) * 100%
    });
  });
});
