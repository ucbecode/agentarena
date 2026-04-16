// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IReputationRegistry
 * @notice Interface for ERC-8004 Reputation Registry
 */
interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        string calldata tag1,
        string calldata tag2,
        string calldata feedbackURI
    ) external;

    function getReputation(uint256 agentId) external view returns (int256);
}
