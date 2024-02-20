const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Maze contract", function () {
  let Maze;
  let Resolver;
  let Pricer;
  let PaymentProcessor;
  let owner;
  let addr1;
  let addr2;
  const DOMAIN_NAME = "123";
  const duration = 3;
  const DOMAIN_NUMBER = ethers.toBigInt(
    ethers.keccak256(ethers.toUtf8Bytes(DOMAIN_NAME))
  );
  const REFUND = true;
  const NoREFUND = false;
  const secondsInDay = 86400;
  const daysInMonth = 30;
  const secondsInMonth = secondsInDay * daysInMonth;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    Pricer = await ethers.getContractFactory("Pricer", owner);
    this.pricer = await Pricer.deploy();
    PaymentProcessor = await ethers.getContractFactory(
      "PaymentProcessor",
      owner
    );
    this.payment = await PaymentProcessor.deploy(
      await this.pricer.getAddress()
    );
    Maze = await ethers.getContractFactory("Maze", owner);
    this.maze = await Maze.deploy(
      await this.payment.getAddress(),
      owner.address
    );
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
      expect(await this.maze.payment()).to.equal(
        await this.payment.getAddress()
      );
      expect(await this.maze.treasury()).to.equal(owner.address);
    });
  });

  describe("Check Ownership after Refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("Should be the owner in rent time", async function () {
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });
    it("Should be the owner between ttl and ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("Should not be the owner after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
    });
  });

  describe("Check Ownership after Non-Refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("Should be the owner in rent time", async function () {
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });
    it("Should be the owner between ttl and ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("Should not be the owner after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
    });
  });

  describe("Changing state variables", function () {
    it("Should allow changing the resolver for owner. Revert for others", async function () {
      let newResolver = await ethers.getContractFactory("Resolver", owner);
      let updatedResolver = await newResolver.deploy(
        await this.maze.getAddress()
      );
      await this.maze
        .connect(owner)
        .setResolver(await updatedResolver.getAddress());
      expect(await this.maze.resolver()).to.equal(
        await updatedResolver.getAddress()
      );

      await expect(this.maze.connect(addr1).setResolver(addr1.address)).to.be
        .reverted;
    });

    it("Should allow changing the payment", async function () {
      let newPayment = await ethers.getContractFactory(
        "PaymentProcessor",
        owner
      );
      let updatedPayment = await newPayment.deploy(
        await this.pricer.getAddress()
      );
      await this.maze.setPayment(await updatedPayment.getAddress());
      expect(await this.maze.payment()).to.equal(
        await updatedPayment.getAddress()
      );
      await expect(this.maze.connect(addr1).setPayment(addr1.address)).to.be
        .reverted;
    });

    it("Should allow changing the grace period to a valid duration", async function () {
      await this.maze.changeGracePeriod(20 * 24 * 60 * 60);
      expect(await this.maze.grace_period()).to.equal(20 * 24 * 60 * 60);
      await expect(
        this.maze.connect(addr1).changeGracePeriod(20 * 24 * 60 * 60)
      ).to.be.reverted;
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
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal("");
      expect(isRefund).to.be.equal(false);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(0);
    });

    it("should be able to rent with refund available domain", async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(REFUND);
      expect(value).to.be.equal(this.refundPrice);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
    });

    it("should be able to rent without refund available domain", async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
    });

    it("Should change owner after transfer, but not change values", async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );

      await this.maze
        .connect(addr1)
        .transferFrom(addr1.address, addr2.address, DOMAIN_NUMBER);
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
      const massive1 = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName1 = massive1[0];
      const isRefund1 = massive1[1];
      const value1 = massive1[2];
      const length1 = massive1[3];

      expect(domainName1).to.be.equal(DOMAIN_NAME);
      expect(isRefund1).to.be.equal(NoREFUND);
      expect(value1).to.be.equal(0);
      expect(length1).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr2.address
      );
    });
  });

  describe("Refund domains after rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("User and owner not be able to refund before ttl", async function () {
      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(owner).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("between ttl and grace_period all refund goes to user(user)", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await this.maze.connect(addr1).refund(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
    });

    it("between ttl and grace_period all refund goes to user (owner)", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      const balanceOwnerBefore = await ethers.provider.getBalance(
        owner.address
      );
      await this.maze.connect(owner).refund(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );
      expect(await ethers.provider.getBalance(owner.address)).to.be.lessThan(
        balanceOwnerBefore
      );
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
    });

    it("noone cant refund after refund", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      await this.maze.connect(addr1).refund(DOMAIN_NUMBER);
      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(owner).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User not able to refund full after grace period but able to refundHalf", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      const balanceOwnerBefore = await ethers.provider.getBalance(
        owner.address
      );
      await this.maze.connect(addr1).refund(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );
      expect(await ethers.provider.getBalance(owner.address)).to.be.greaterThan(
        balanceOwnerBefore
      );
      await expect(this.maze.ownerOf(DOMAIN_NUMBER)).to.be.reverted;
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      // NoOne cant refund after refund
      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(owner).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });
  });

  describe("Rent domains after refund", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );
      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("Another User not be able to rent before ttl", async function () {
      await expect(
        this.maze
          .connect(addr2)
          .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User not able to rent between ttl and grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      await expect(
        this.maze
          .connect(addr2)
          .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User able to rent right after refund from domain owner", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await this.maze.connect(addr1).refund(DOMAIN_NUMBER);
      expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(
        balanceBefore
      );

      await this.maze
        .connect(addr2)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr2.address
      );
    });

    it("User able to rent right after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3]);
      await ethers.provider.send("evm_mine");

      const balance1Before = await ethers.provider.getBalance(addr1.address);

      await this.maze
        .connect(addr2)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
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
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("User not be able to refund before ttl", async function () {
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
      await expect(this.maze.connect(addr2).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User not able to refund between ttl and grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");

      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);

      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });

    it("User not able to refund after grace period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 100]);
      await ethers.provider.send("evm_mine");
      await expect(this.maze.connect(addr1).refund(DOMAIN_NUMBER)).to.be
        .reverted;
    });
  });

  describe("Rent domains after non Refund-rent", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("Another User not be able to rent before ttl", async function () {
      await expect(
        this.maze
          .connect(addr2)
          .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("Another User not able to rent between ttl and grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 2 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        this.maze
          .connect(addr2)
          .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
            value: this.refundPrice,
          })
      ).to.be.reverted;
    });

    it("User able to rent right after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3]);
      await ethers.provider.send("evm_mine");

      const balance1Before = await ethers.provider.getBalance(addr1.address);

      await this.maze
        .connect(addr2)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
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
  describe("Renew refund Domain", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, REFUND, {
          value: this.refundPrice,
        });

      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(REFUND);
      expect(value).to.be.equal(this.refundPrice);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("should allow renew with no refund before ttl", async function () {
      await this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, NoREFUND, {
        value: this.nonRefundPrice,
      });
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(REFUND);
      expect(value).to.be.equal(this.refundPrice);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 5]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("should allow renew with refund before ttl + grace_period", async function () {
      await this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, REFUND, {
        value: this.refundPrice,
      });
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      console.log(this.refundPrice, massive[2]);
      expect(massive[1]).equals(true);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 5]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("should no allow renew after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, REFUND, {
          value: this.refundPrice,
        })
      ).to.be.reverted;
    });
  });

  describe("Renew non-refund Domain", function () {
    beforeEach(async function () {
      await this.maze
        .connect(addr1)
        .rent(DOMAIN_NUMBER, duration, DOMAIN_NAME, NoREFUND, {
          value: this.nonRefundPrice,
        });

      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      expect(await this.resolver.getAddr(DOMAIN_NUMBER)).to.be.equal(
        addr1.address
      );

      await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
      await ethers.provider.send("evm_mine");
    });

    it("should allow renew with no refund before ttl", async function () {
      await this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, NoREFUND, {
        value: this.nonRefundPrice,
      });
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      const domainName = massive[0];
      const isRefund = massive[1];
      const value = massive[2];
      const length = massive[3];

      expect(domainName).to.be.equal(DOMAIN_NAME);
      expect(isRefund).to.be.equal(NoREFUND);
      expect(value).to.be.equal(0);
      expect(length).to.be.equal(DOMAIN_NAME.length);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 5]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("should allow renew with refund before ttl + grace_period", async function () {
      await this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, REFUND, {
        value: this.refundPrice,
      });
      const massive = await this.maze.getDomainInformaton(DOMAIN_NUMBER);
      expect(massive[1]).equal(true);
      expect(massive[2]).equal(this.refundPrice);
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 5]);
      await ethers.provider.send("evm_mine");
      expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    });

    it("should no allow renew after ttl + grace_period", async function () {
      await ethers.provider.send("evm_increaseTime", [secondsInMonth * 3 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        this.maze.connect(addr1).renew(DOMAIN_NUMBER, duration, REFUND, {
          value: this.refundPrice,
        })
      ).to.be.reverted;
    });
  });
});
