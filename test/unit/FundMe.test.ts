import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { assert, expect } from "chai"
import { BigNumber } from "ethers"
import { network, deployments, ethers } from "hardhat"
import { developmentChains } from "../../helper-hardhat-config"
import { FundMe, MockV3Aggregator } from "../../typechain-types"

describe("FundMe", function () {
    let fundMe: FundMe
    let mockV3Aggregator: MockV3Aggregator
    let deployer: SignerWithAddress
    const sendValue = ethers.utils.parseEther("1")
    beforeEach(async () => {
        //deploy fundme contract using hardhat-deploy
        if (!developmentChains.includes(network.name)) {
            throw "You need to be on a development chain to run tests"
        }
        const accounts = await ethers.getSigners()
        deployer = accounts[0]
        await deployments.fixture(["all"])
        fundMe = await ethers.getContract("FundMe")
        mockV3Aggregator = await ethers.getContract("MockV3Aggregator")
    })

    describe("constructor", () => {
        it("Sets the aggregator addresses correctly", async () => {
            const response = await fundMe.s_priceFeed()
            assert.equal(response, mockV3Aggregator.address)
        })
    })

    describe("fund", () => {
        it("Fails if you don't send enough ETH", async () => {
            await expect(fundMe.fund()).to.be.revertedWith(
                "You need to spend more ETH!"
            )
        })

        it("Updated the amount funded in data structure", async () => {
            await fundMe.fund({ value: sendValue })
            const response = await fundMe.s_addressToAmountFunded(
                deployer.address
            )
            assert.equal(response.toString(), sendValue.toString())
        })

        it("Adds funder to s_funders array", async () => {
            await fundMe.fund({ value: sendValue })
            const funder = await fundMe.s_funders(0)
            assert.equal(funder, deployer.address)
        })
    })

    describe("Withdraw", () => {
        beforeEach(async () => {
            await fundMe.fund({ value: sendValue })
        })

        it("Withdraw ETH from a single founder", async () => {
            // Arrange
            const startingFundMeBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const startingDeployerBalance = await fundMe.provider.getBalance(
                deployer.address
            )
            // Act
            const tranasctionResponse = await fundMe.withdraw()
            const tranasctionReceipt = await tranasctionResponse.wait(1)
            const { gasUsed, effectiveGasPrice } = tranasctionReceipt
            const gasCost = gasUsed.mul(effectiveGasPrice)

            const endingFundMeBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const endingDeployerBalance = await fundMe.provider.getBalance(
                deployer.address
            )
            // Assert
            assert.equal(endingFundMeBalance.toString(), "0")
            assert.equal(
                startingFundMeBalance.add(startingDeployerBalance).toString(),
                endingDeployerBalance.add(gasCost).toString()
            )
        })

        it("allows us to withdraw with multiple s_funders", async () => {
            // Arrange
            const accounts = await ethers.getSigners()
            for (let i = 1; i < 6; i++) {
                const fundMeConnectedContract = fundMe.connect(accounts[i])
                await fundMeConnectedContract.fund({ value: sendValue })
            }

            const startingFundMeBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const startingDeployerBalance = await fundMe.provider.getBalance(
                deployer.address
            )
            // Act
            const tranasctionResponse = await fundMe.cheaperWithdraw()
            const tranasctionReceipt = await tranasctionResponse.wait(1)
            const { gasUsed, effectiveGasPrice } = tranasctionReceipt
            const gasCost = gasUsed.mul(effectiveGasPrice)

            const endingFundMeBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const endingDeployerBalance = await fundMe.provider.getBalance(
                deployer.address
            )

            // Assert
            assert.equal(endingFundMeBalance.toString(), "0")
            assert.equal(
                startingFundMeBalance.add(startingDeployerBalance).toString(),
                endingDeployerBalance.add(gasCost).toString()
            )

            // make sure s_funders are reset properly
            await expect(fundMe.s_funders(0)).to.be.reverted

            for (let i = 1; i < 6; i++) {
                assert.equal(
                    (
                        await fundMe.s_addressToAmountFunded(
                            accounts[i].address
                        )
                    ).toString(),
                    "0"
                )
            }
        })

        it("Only allows the owner to withdraw", async () => {
            const accounts = await ethers.getSigners()
            const attackerConnectedContract = fundMe.connect(accounts[1])
            // await expect(
            //     attackerConnectedContract.withdraw()
            // ).to.be.revertedWith("FundMe__NotOwner")
            await expect(attackerConnectedContract.withdraw()).to.be.reverted
        })
    })
})
