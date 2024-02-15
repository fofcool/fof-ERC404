const {
    loadFixture
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const configs = require("../deploy/configs.json");

describe("Fof", () => {
    async function deployFof() {
        const signers = await ethers.getSigners();
        const factory = await ethers.getContractFactory("Fof");

        const name = configs.name;
        const symbol = configs.symbol;
        const decimals = configs.decimals;
        const units = 10n ** ethers.toBigInt(decimals);
        const initialOwner = signers[0];
        const initialMintRecipient = signers[1];

        const contract = await factory.deploy(
            name,
            symbol,
            decimals,
            initialOwner.address,
            initialMintRecipient.address
        );
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();

        return {
            contract,
            contractAddress,
            signers,
            deployConfig: {
                name,
                symbol,
                decimals,
                units,
                initialOwner,
                initialMintRecipient,
            }
        };
    }

    describe("#name", () => {
        it("Name should be 'Fof: ERC404 - The Story'", async () => {
            const fof = await loadFixture(deployFof);
            expect(await fof.contract.name()).to.be.equal("Fof: ERC404 - The Story");
        })
    })

    describe("#symbol", () => {
        it("Symbol should be 'Fof'", async () => {
            const fof = await loadFixture(deployFof);
            expect(await fof.contract.symbol()).to.be.equal("Fof");
        })
    })

    describe("#decimals", () => {
        it("Decimals should be '18'", async () => {
            const fof = await loadFixture(deployFof);
            expect(await fof.contract.decimals()).to.be.equal(18n);
        })
    })

    describe("#owner", () => {
        it("initializes owner correctly", async () => {
            const fof = await loadFixture(deployFof);
            expect(await fof.contract.owner()).to.be.equal(fof.deployConfig.initialOwner.address);
        })
    })

    describe("#initial mint", () => {
        it("correctly mints initial tokens to the recipient", async () => {
            const fof = await loadFixture(deployFof);
            expect(
                await fof.contract.balanceOf(fof.deployConfig.initialMintRecipient.address)
            ).to.be.equal(36_000n * 10n ** 18n);
        })
    })

    describe("#public mint", () => {
        it("should initially set public minting to false", async () => {
            const fof = await loadFixture(deployFof);
            expect(await fof.contract.isPublicMint()).to.be.equal(false)
        })

        it("should allow only the owner to start public minting", async () => {
            const fof = await loadFixture(deployFof);
            await expect(fof.contract.connect(fof.signers[1]).startPublicMint(true))
                .to.be.revertedWithCustomError(fof.contract, "OwnableUnauthorizedAccount")
                .withArgs(fof.signers[1].address);
            await expect(fof.contract.connect(fof.signers[0]).startPublicMint(true))
                .not.to.be.reverted;
        });

        it("should revert when the requested mint amount exceeds the per-transaction maximum limit", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            const mintPrice = await fof.contract.getPublicMintPrice();
            await expect(fof.contract.connect(fof.signers[1]).publicMint(11, {value: mintPrice * 11n}))
                    .to.be.revertedWithCustomError(fof.contract, "ExceedsMaxSizeAtOneTime")
                    .withArgs(11, 10);
        });

        it("should revert if public mint not active", async () => {
            const fof = await loadFixture(deployFof);
            const mintPrice = await fof.contract.getPublicMintPrice();
            await expect(fof.contract.connect(fof.signers[2]).publicMint(1, {value: mintPrice * 1n}))
                    .to.be.revertedWithCustomError(fof.contract, "PublicMintNotActive");
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            await expect(fof.contract.connect(fof.signers[2]).publicMint(1, {value: mintPrice * 1n}))
                    .to.be.not.reverted;
            expect(await fof.contract.balanceOf(fof.signers[2])).to.equal(1n * 10n ** 18n);
            await fof.contract.connect(fof.signers[0]).startPublicMint(false);
            await expect(fof.contract.connect(fof.signers[2]).publicMint(1, {value: mintPrice * 1n}))
                    .to.be.revertedWithCustomError(fof.contract, "PublicMintNotActive");
            expect(await fof.contract.balanceOf(fof.signers[2])).to.equal(1n * 10n ** 18n);
        });

        it("should revert the transaction due to insufficient paymen", async () => {
            const fof = await loadFixture(deployFof);
            const mintPrice = await fof.contract.getPublicMintPrice();
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            await expect(fof.contract.connect(fof.signers[2]).publicMint(2, {value: mintPrice * 1n}))
                    .to.be.revertedWithCustomError(fof.contract, "InsufficientEther")
                    .withArgs(mintPrice * 2n, mintPrice * 1n);
            expect(await fof.contract.balanceOf(fof.signers[2])).to.equal(0);
        });

        it("should successfully mint tokens when conditions are met", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            const mintPrice = await fof.contract.getPublicMintPrice();
            expect(mintPrice).to.be.equal(ethers.parseEther('0.25'))
            await expect(fof.contract.connect(fof.signers[2]).publicMint(5, {value: mintPrice * 5n}))
                    .not.to.be.reverted;
            const balance = await fof.contract.balanceOf(fof.signers[2]);
            expect(balance).to.equal(5n * 10n ** 18n);
        });
    })

    describe("#withdraw", () => {
        it("should only withdraw by owner", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            const mintPrice = await fof.contract.getPublicMintPrice();
            await fof.contract.connect(fof.signers[2]).publicMint(5, {value: 5n * mintPrice});
            expect(await ethers.provider.getBalance(fof.contractAddress)).to.be.equal(5n * mintPrice);
            await expect(fof.contract.connect(fof.signers[1]).withdraw(fof.signers[3].address, 5n * mintPrice))
                .to.be.revertedWithCustomError(fof.contract, "OwnableUnauthorizedAccount")
                .withArgs(fof.signers[1].address);
        })

        it("should accurately withdraw Ether from the contract", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).startPublicMint(true);
            const mintPrice = await fof.contract.getPublicMintPrice();
            const etherBalanceBeforeMint = await ethers.provider.getBalance(fof.signers[2].address);
            const tx = await fof.contract.connect(fof.signers[2]).publicMint(5, {value: 5n * mintPrice});
            const receipt = await tx.wait()
            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice;
            const totalCost = gasUsed * gasPrice;
            expect(await ethers.provider.getBalance(fof.signers[2].address)).to.be.equal(etherBalanceBeforeMint - 5n * mintPrice - totalCost);
            expect(await ethers.provider.getBalance(fof.contractAddress)).to.be.equal(5n * mintPrice);
            const etherBalanceBeforeWithdraw = await ethers.provider.getBalance(fof.signers[3].address);
            await expect(fof.contract.connect(fof.signers[0]).withdraw(fof.signers[3].address, 5n * mintPrice)).to.be.not.reverted;
            expect(await ethers.provider.getBalance(fof.signers[3].address)).to.be.equal(etherBalanceBeforeWithdraw + 5n * mintPrice);
            expect(await ethers.provider.getBalance(fof.contractAddress)).to.be.equal(0);
        })
    })

    describe("uri", () => {
        it("should restrict URI setting privileges exclusively to the contract owner", async () => {
            const fof = await loadFixture(deployFof);
            await expect(fof.contract.connect(fof.signers[2]).setBaseURI("https://www.example.com/"))
                    .to.be.revertedWithCustomError(fof.contract, "OwnableUnauthorizedAccount")
                    .withArgs(fof.signers[2].address);
            expect(await fof.contract.BASE_URI()).to.be.equal("");
            await fof.contract.connect(fof.signers[0]).setBaseURI("https://www.example.com/");
            expect(await fof.contract.BASE_URI()).to.be.equal("https://www.example.com/");
        })

        it("should accurately retrieve the URI", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).setBaseURI("https://www.example.com/");
            await fof.contract.connect(fof.signers[1]).transfer(fof.signers[2].address, 2n * fof.deployConfig.units);
            expect(await fof.contract.tokenURI(1)).to.be.equal("https://www.example.com/1.json");
        })

        it("should revert when queried with an invalid ID", async () => {
            const fof = await loadFixture(deployFof);
            await fof.contract.connect(fof.signers[0]).setBaseURI("https://www.example.com/");
            await expect(fof.contract.tokenURI(1)).to.be.revertedWithCustomError(fof.contract, "NotFound");
            await expect(fof.contract.tokenURI(2)).to.be.revertedWithCustomError(fof.contract, "NotFound");
            await fof.contract.connect(fof.signers[1]).transfer(fof.signers[2].address, 2n * fof.deployConfig.units);
            expect(await fof.contract.tokenURI(2)).to.be.equal("https://www.example.com/2.json");
            await expect(fof.contract.tokenURI(3)).to.be.revertedWithCustomError(fof.contract, "NotFound");
            await fof.contract.connect(fof.signers[2]).transfer(fof.signers[1].address, 1n * fof.deployConfig.units);
            expect(await fof.contract.erc721TotalSupply()).to.be.equal(2);
            await expect(fof.contract.tokenURI(2)).to.be.revertedWithCustomError(fof.contract, "NotFound");
        })
    })
})
