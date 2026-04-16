// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title MockIdentityRegistry
 * @notice Mock ERC-8004 identity registry for testing
 */
contract MockIdentityRegistry {
    mapping(uint256 => address) public agentWallets;
    mapping(address => uint256) public walletAgents;

    function registerAgent(address wallet, uint256 agentId) external {
        agentWallets[agentId] = wallet;
        walletAgents[wallet] = agentId;
    }

    function getWalletByAgent(uint256 agentId) external view returns (address) {
        return agentWallets[agentId];
    }

    function getAgentByWallet(address wallet) external view returns (uint256) {
        return walletAgents[wallet];
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return agentWallets[agentId];
    }

    function agentExists(uint256 agentId) external view returns (bool) {
        return agentWallets[agentId] != address(0);
    }
}
