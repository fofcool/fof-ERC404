//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC404} from "./ERC404/contracts/ERC404.sol";
import {ERC404MerkleClaim} from "./ERC404/contracts/extensions/ERC404MerkleClaim.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract Fof is ERC404, ERC404MerkleClaim, Ownable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant MAX_FOF_ERC721 = 200_000;
    string private _baseUri = '';
    string private _baseExtension = ".json";

    bool private _publicMint = false;

    uint256 private _maxSizeAtOneTime = 0;

    error ExceedsMaxSizeAtOneTime(uint256 requested, uint256 maxSizeAtOneTime);
    error PublicMintNotActive();
    error InsufficientEther(uint256 required, uint256 sent);
    error ExceedsMaxSupply(uint256 requested, uint256 remaining);

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address initialOwner,
        address initialMintRecipient
    ) ERC404(name, symbol, decimals) Ownable(initialOwner){
         _setERC721TransferExempt(initialMintRecipient, true);
        _mintERC20(initialMintRecipient, 36000 * units, false);
        _maxSizeAtOneTime = 10 * units;
    } 

    function tokenURI(uint256 id) public view override returns (string memory) {
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, id.toString(), _baseExtension)) : "";
    }

    function _baseURI() internal view returns (string memory) {
        return _baseUri;
    }

    function BASE_URI() external view returns (string memory) {
        return _baseUri;
    }

    function setBaseURI(string memory baseUri) public onlyOwner {
        _baseUri = baseUri;
    }

    function setERC721TransferExempt(address account, bool value) external onlyOwner {
        _setERC721TransferExempt(account, value);
    }

    function isPublicMint() public view returns (bool) {
        return _publicMint;
    }

    function startPublicMint(bool startMint) public onlyOwner {
        _publicMint = startMint;
    }

    function getPublicMintPrice() public view returns (uint256) {
        uint256 priceIncreaseStep = (erc20TotalSupply() + (2000 * units - 1)) / units / 2000;
        if (priceIncreaseStep == 0) {
            return 0.07 ether;
        } else {
            return 0.07 ether + (priceIncreaseStep * 0.01 ether);
        }
    }

    function MAX_SIZE_AT_ONE_TIME() public view returns (uint256) {
        return _maxSizeAtOneTime / units;
    }

    function publicMint(uint256 mintCount) public payable nonReentrant {
        if(mintCount * units > _maxSizeAtOneTime) {
            revert ExceedsMaxSizeAtOneTime(mintCount, _maxSizeAtOneTime / units);
        }
        if(!_publicMint) {
            revert PublicMintNotActive();
        }
        if (msg.value < getPublicMintPrice() * mintCount) {
            revert InsufficientEther({
                required: getPublicMintPrice() * mintCount,
                sent: msg.value
            });
        }
        if (erc20TotalSupply() / units + mintCount > MAX_FOF_ERC721) {
            revert ExceedsMaxSupply({
                requested: mintCount,
                remaining: MAX_FOF_ERC721 - erc20TotalSupply() / units
            });
        }
        _mintERC20(msg.sender, mintCount * units, false);
    }

    function withdraw(address account, uint256 amount) public onlyOwner {
        require(amount <= address(this).balance, "insufficient balance in contract");
        payable(address(account)).transfer(amount);
    }
}
