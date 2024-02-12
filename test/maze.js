const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Maze contract", function () {
  let Maze;
  let Resolver;
  let owner;
  let addr1;
  let addr2;
  const DOMAIN_NAME = "123";
  const DOMAIN_HASH = ethers.keccak256(ethers.toUtf8Bytes(DOMAIN_NAME));
  const DOMAIN_NUMBER = ethers.toBigInt(
    ethers.keccak256(ethers.toUtf8Bytes(DOMAIN_NAME))
  );

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    Maze = await ethers.getContractFactory("Maze", owner);
    this.maze = await Maze.deploy();
    Resolver = await ethers.getContractFactory("Resolver", owner);
    this.resolver = await Resolver.deploy(await this.maze.getAddress());
    await this.maze.setResolver(await this.resolver.getAddress());
  });

  it("Should deploy with correct initial values", async function () {
    expect(await this.maze.grace_period()).to.equal(15 * 24 * 60 * 60); // 15 days in seconds
    expect(await this.maze.priceForMonthWithRefund()).to.equal(
      ethers.parseEther("0.004")
    ); // 0.004 ether in wei
    expect(await this.maze.priceForMonthWithoutRefund()).to.equal(
      ethers.parseEther("0.002")
    ); // 0.002 ether in wei
    expect(await this.maze.owner()).to.equal(owner.address);
  });

  it("Should allow changing the grace period", async function () {
    await this.maze.changeGracePeriod(10 * 24 * 60 * 60); // 10 days in seconds
    expect(await this.maze.grace_period()).to.equal(10 * 24 * 60 * 60);
  });

  it("Should allow changing the price for a month with refund", async function () {
    await this.maze.connect(owner).setPriceForMonth(ethers.parseEther("0.005"));
    expect(await this.maze.priceForMonthWithRefund()).to.equal(
      ethers.parseEther("0.005")
    );
  });

  it("Should allow changing the price for a month without refund", async function () {
    await this.maze
      .connect(owner)
      .setPriceForMonthWithoutRefund(ethers.parseEther("0.003")); // 0.003 ether in wei
    expect(await this.maze.priceForMonthWithoutRefund()).to.equal(
      ethers.parseEther("0.003")
    );
  });

  it("should be able to rent with refund available domain", async function () {
    await this.maze
      .connect(addr1)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    console.log(await this.maze.isDomainRefund(DOMAIN_HASH))
    expect(await this.maze.isDomainRefund(DOMAIN_HASH)).to.be.equal(true);
  });

  it("should be able to rent without refund available domain", async function () {
    await this.maze
      .connect(addr1)
      .rentWithoutRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.006") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
  });

  it("user not be able to rent with refund not available domain", async function () {
    await this.maze
      .connect(addr1)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);

    const secondsInDay = 86400; // количество секунд в одном дне (60 секунд * 60 минут * 24 часа)
    const daysInMonth = 30; // количество дней в месяце
    const secondsInMonth = secondsInDay * daysInMonth * 2;

    await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    await expect(this.maze
      .connect(addr2)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") })).to.be.reverted;
  });

  it("user not be able to rent without refund available domain", async function () {
    await this.maze
      .connect(addr1)
      .rentWithoutRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.006") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);

    const secondsInDay = 86400; // количество секунд в одном дне (60 секунд * 60 минут * 24 часа)
    const daysInMonth = 30; // количество дней в месяце
    const secondsInMonth = secondsInDay * daysInMonth * 2;

    await ethers.provider.send("evm_increaseTime", [secondsInMonth]);
    await expect(this.maze
      .connect(addr2)
      .rentWithoutRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.006") })).to.be.reverted;
  });

  it("user should be able to refund in grace period after rent if he rent with refund", async function(){
    await this.maze
      .connect(addr1)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    await expect(this.maze.connect(addr1).refundFull(DOMAIN_HASH)).to.be.revertedWith("You cant refund all funds");
    const secondsInDay = 86400;
    const daysInMonth = 30;
    const secondsInMonth = secondsInDay * daysInMonth * 3;

    const balanceBefore = await ethers.provider.getBalance(addr1.address);
    await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);
    await this.maze.connect(addr1).refundFull(DOMAIN_HASH);
    expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(balanceBefore);

  })
  
  it("owner or domain owner should be able to refund after grace period after rent if he rent with refund", async function(){
    await this.maze
      .connect(addr1)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    await expect(this.maze.connect(addr1).refundFull(DOMAIN_HASH)).to.be.revertedWith("You cant refund all funds");
    const secondsInDay = 86400;
    const daysInMonth = 30;
    const secondsInMonth = secondsInDay * daysInMonth * 4;

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    const user1BalanceBefore = await ethers.provider.getBalance(addr1.address);
    const user2BalanceBefore = await ethers.provider.getBalance(addr2.address);


    await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);
    await this.maze.connect(owner).refundHalf(DOMAIN_HASH);
    expect(await ethers.provider.getBalance(owner.address)).to.be.greaterThan(ownerBalanceBefore);
    expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(user1BalanceBefore);
  })

  it("anyone can rent domain after rent + grace_period", async function() {
    await this.maze
      .connect(addr1)
      .rentWithRefund(DOMAIN_HASH, 3, { value: ethers.parseEther("0.012") });
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr1.address);
    const secondsInDay = 86400;
    const daysInMonth = 30;
    const secondsInMonth = secondsInDay * daysInMonth * 4;

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    const user1BalanceBefore = await ethers.provider.getBalance(addr1.address);


    await ethers.provider.send("evm_increaseTime", [secondsInMonth + 1]);
    await this.maze.connect(addr2).rentWithRefund(DOMAIN_HASH, 3, {value: ethers.parseEther("0.012")});
    expect(await ethers.provider.getBalance(owner.address)).to.be.greaterThan(ownerBalanceBefore);
    expect(await ethers.provider.getBalance(addr1.address)).to.be.greaterThan(user1BalanceBefore);
    expect(await this.maze.ownerOf(DOMAIN_NUMBER)).to.be.equal(addr2.address);
    expect(await this.resolver.getAddr(DOMAIN_HASH)).to.be.equal(addr2.address);
  }) 

  // Add more tests for other functions as needed
});
