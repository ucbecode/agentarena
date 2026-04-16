// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IIdentityRegistry
 * @notice Interface for ERC-8004 Identity Registry
 */
interface IIdentityRegistry {
    function getAgentByWallet(address wallet) external view returns (uint256);
    function getWalletByAgent(uint256 agentId) external view returns (address);
    function agentExists(uint256 agentId) external view returns (bool);
    function ownerOf(uint256 agentId) external view returns (address);
}
