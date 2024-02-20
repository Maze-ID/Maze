const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...\n");

  const pricer = await ethers.getContractFactory("Pricer");
  const deployedPricer = await pricer.deploy();
  await deployedPricer.waitForDeployment();
  console.log(`🚀 Pricer was deployed to: ${deployedPricer.target}`);
  console.log(`👤 Pricer owner: ${await deployedPricer.owner()}\n`);


  const payment = await ethers.getContractFactory("PaymentProcessor");
  const deployedPayment = await payment.deploy(deployedPricer.target);
  await deployedPayment.waitForDeployment();
  console.log(`🚀 Payment was deployed to: ${deployedPayment.target}`);


  const maze = await ethers.getContractFactory("Maze");
  const deployedMaze = await maze.deploy(deployedPayment.target);
  await deployedMaze.waitForDeployment();

  console.log(`🚀 Maze was deployed to: ${deployedMaze.target}`);
  console.log(`👤 Maze owner: ${await deployedMaze.owner()}`);
  console.log(`🔗 Maze pricer is set to: ${await deployedMaze.pricer()}\n`);

  const resolver = await ethers.getContractFactory("Resolver");
  const deployedResolver = await resolver.deploy(deployedMaze.target);
  await deployedResolver.waitForDeployment();
  console.log(`🚀 Resolver was deployed to: ${deployedResolver.target}`);
  console.log(`👤 Resolver owner: ${await deployedResolver.owner()}`);
  console.log(`🔗 Resolver maze is set to: ${await deployedResolver.maze()}\n`);

  await deployedMaze.setResolver(deployedResolver.target);
  console.log(`🔄 Maze resolver is updated to: ${await deployedMaze.resolver()}\n`);

  console.log("Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed with error:", error);
    process.exit(1);
  });

