const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Maze contract", function () {
  let Maze;
  let Resolver;
  let Pricer;
  let owner;
  let addr1;
  let addr2;
  const DOMAIN_NAME = "123";
  const duration = 3;
  const DOMAIN_NUMBER = ethers.toBigInt(
    ethers.keccak256(ethers.toUtf8Bytes(DOMAIN_NAME))
  );

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    Pricer = await ethers.getContractFactory("Pricer", owner);
    this.pricer = await Pricer.deploy();
    Maze = await ethers.getContractFactory("Maze", owner);
    this.maze = await Maze.deploy(await this.pricer.getAddress());
    Resolver = await ethers.getContractFactory("Resolver", owner);
    this.resolver = await Resolver.deploy(await this.maze.getAddress());
    await this.maze.setResolver(await this.resolver.getAddress());
    this.refundPrice = await this.pricer.calculatePrice(
      duration,
      true,
      DOMAIN_NAME.length
    );

    this.nonRefundPrice = await this.pricer.calculatePrice(
      duration,
      false,
      DOMAIN_NAME.length
    );
  });
  describe("Deploying", function () {
    it("Should deploy with correct initial values", async function () {
      expect(await this.maze.grace_period()).to.equal(15 * 24 * 60 * 60); // 15 days in seconds
      expect(await this.maze.owner()).to.equal(owner.address);
      expect(await this.maze.resolver()).to.equal(
        await this.resolver.getAddress()
      );
      expect(await this.maze.pricer()).to.equal(await this.pricer.getAddress());
    });
  });

  describe("Changing state variables", function () {
    it("Should allow changing the resolver", async function () {
      let newResolver = await ethers.getContractFactory("Resolver", owner);
      let updatedResolver = await newResolver.deploy(
        await this.maze.getAddress()
      );
      await this.maze.setResolver(await updatedResolver.getAddress());
      expect(await this.maze.resolver()).to.equal(
        await updatedResolver.getAddress()
      );
    });

    it("Should allow changing the pricer", async function () {
      let newPricer = await ethers.getContractFactory("Pricer", owner);
      let updatedPricer = await newPricer.deploy();
      await this.maze.changePricer(await updatedPricer.getAddress());
      expect(await this.maze.pricer()).to.equal(
        await updatedPricer.getAddress()
      );
    });

    it("Should prevent non-owners from changing the pricer", async function () {
      let newPricer = await ethers.getContractFactory("Pricer", addr1);
      let updatedPricer = await newPricer.deploy();
      await expect(
        this.maze.connect(addr1).changePricer(await updatedPricer.getAddress())
      ).to.be.reverted;
    });

    it("Should allow changing the grace period to a valid duration", async function () {
      await this.maze.changeGracePeriod(20 * 24 * 60 * 60); // 20 days in seconds
      expect(await this.maze.grace_period()).to.equal(20 * 24 * 60 * 60);
    });

    it("Should prevent changing the grace period to an invalid duration", async function () {
      await expect(
        this.maze.changeGracePeriod(3 * 24 * 60 * 60)
      ).to.be.revertedWith("Invalid duration, need to be more than 5 days");
    });
  });

  describe("Renting domains from address(0)", function () {
    beforeEach(async function () {
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.equal(0);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.equal(false);
    });

    it("should be able to rent with refund available domain", async function () {
      await this.maze
        .connect(addr1)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(true);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.refundPrice
      );
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
    });

    it("should be able to rent without refund available domain", async function () {
      await this.maze
        .connect(addr1)
        .rentWithoutRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(false);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.nonRefundPrice
      );
    });
  });

  describe("Refund domains after refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(true);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.refundPrice
      );
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth * 2;

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    });

    it("User not be able to refund before ttl", async function () {
      await expect(this.maze.connect(addr1).refundFull(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User be able to refund between ttl and grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await expect(this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER)).to.be
        .reverted;
      await this.maze.connect(addr1).refundFull(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );

      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.equal(0);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.equal(false);
      expect(await this.maze.getDomainTTL(DOMAIN_NUMBER)).to.equal(0);
    });

    it("User not able to refund full after grace period but able to refundHalf", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2]);

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await expect(this.maze.connect(addr1).refundFull(DOMAIN_NUMBER)).to.be
        .reverted;
      await this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.equal(0);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.equal(false);
      expect(await this.maze.getDomainTTL(DOMAIN_NUMBER)).to.equal(0);
    });
  });

  describe("Rent domains after refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(true);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.refundPrice
      );
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth * 2;

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    });

    it("Another User not be able to rent before ttl", async function () {
      await expect(
        this.maze
          .connect(addr2)
          .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User not able to rent between ttl and grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);
      await expect(
        this.maze
          .connect(addr2)
          .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User able to rent right after refund from domain owner", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await this.maze.connect(addr1).refundFull(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );

      await this.maze
        .connect(addr2)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr2.address
      );
    });

    it("User able to rent right after ttl + grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2]);

      const balance1Before = await ethers.provider.getBalance(addr1.address);

      await this.maze
        .connect(addr2)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });

      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr2.address
      );
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balance1Before
      );
    });
  });

  describe("Refund after non-refund rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rentWithoutRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(false);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.nonRefundPrice
      );

      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth * 2;

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    });

    it("User not be able to refund before ttl", async function () {
      await expect(this.maze.connect(addr1).refundFull(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User not able to refund between ttl and grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);

      await expect(this.maze.connect(addr1).refundFull(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User not able to refund full after grace period and not able to refundHalf", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2]);

      await expect(this.maze.connect(addr1).refundFull(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(addr1).refundHalf(DOMAIN_NUMBER)).to.be
        .reverted;
    });
  });

  describe("Rent domains after non Refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rentWithoutRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(false);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.nonRefundPrice
      );
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth * 2;

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    });

    it("Another User not be able to rent before ttl", async function () {
      await expect(
        this.maze
          .connect(addr2)
          .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("Another User not able to rent between ttl and grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);
      await expect(
        this.maze
          .connect(addr2)
          .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User able to rent right after ttl + grace_period", async function () {
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth;
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2]);

      const balance1Before = await ethers.provider.getBalance(addr1.address);

      await this.maze
        .connect(addr2)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });

      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr2.address
      );
      expect(await ethers.provider.getBalance(addr1.address)).to.be.equal(
        balance1Before
      );
    });
  });

  describe("Check Metadata", function () {
    it("Should return correct metadata", async function () {
      expect(await this.maze.tokenURI(1)).to.be.equal(
        "ipfs://QmREqDUAYtvoURZw1rKK2mSYyNban7GzxqqCju7SVvRkod"
      );
    });
  });
  // TO-DO
  describe("Renew refund Domain", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rentWithRefund(DOMAIN_NUMBER, duration, DOMAIN_NAME, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.maze.isDomainRefund(DOMAIN_NUMBER)).to.be.equal(true);
      expect(await this.maze.getDomainValue(DOMAIN_NUMBER)).to.be.equal(
        this.refundPrice
      );
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
      const secondsInDay = 86400;
      const daysInMonth = 30;
      const secondsInMonth = secondsInDay * daysInMonth * 2;

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    });
  });
});
