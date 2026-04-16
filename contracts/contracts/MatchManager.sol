// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./ArenaRegistry.sol";
import "./MatchEscrow.sol";

/**
 * @title MatchManager
 * @notice Orchestrates match lifecycle for AgentArena
 * @dev Handles match creation, result submission, and settlement
 */
contract MatchManager is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    ArenaRegistry public arenaRegistry;
    MatchEscrow public matchEscrow;

    // Match duration in seconds (default 15 minutes)
    uint256 public matchDuration = 900;

    // Challenge timeout (5 minutes to accept)
    uint256 public challengeTimeout = 300;

    // Trusted oracles for result submission
    mapping(address => bool) public trustedOracles;

    // Match state tracking
    struct MatchState {
        bytes32 matchId;
        uint256 challenger;
        uint256 challenged;
        uint256 tier;
        uint256 challengedAt;
        bool accepted;
        int256 agent1Pnl;  // P&L in USDC (6 decimals)
        int256 agent2Pnl;
        bytes32 resultHash;
        bool resultSubmitted;
        bool settled;  // Prevent double settlement
    }

    // matchId => MatchState
    mapping(bytes32 => MatchState) public matchStates;

    // Track active matches per agent
    mapping(uint256 => bytes32) public activeMatch;

    // Events
    event ChallengeCreated(bytes32 indexed matchId, uint256 challenger, uint256 challenged, uint256 tier);
    event ChallengeAccepted(bytes32 indexed matchId);
    event ChallengeExpired(bytes32 indexed matchId);
    event MatchResultSubmitted(bytes32 indexed matchId, int256 agent1Pnl, int256 agent2Pnl, bytes32 resultHash);
    event MatchSettled(bytes32 indexed matchId, uint256 winnerId);
    event OracleUpdated(address indexed oracle, bool trusted);

    // Errors
    error AgentNotRegistered();
    error AgentInMatch();
    error ChallengeNotFound();
    error ChallengeNotAccepted();
    error ChallengeAlreadyAccepted();
    error ChallengeSelf();
    error InvalidTier();
    error MatchNotReady();
    error ResultAlreadySubmitted();
    error NotTrustedOracle();
    error InvalidResultHash();
    error MatchNotEnded();
    error AlreadySettled();

    constructor(
        address _arenaRegistry,
        address _matchEscrow
    ) Ownable(msg.sender) {
        arenaRegistry = ArenaRegistry(_arenaRegistry);
        matchEscrow = MatchEscrow(_matchEscrow);
    }

    /**
     * @notice Create a challenge to another agent
     * @param challengerId The challenger's agent ID
     * @param challengedId The challenged agent's ID
     * @param tier The tier to compete in
     */
    function createChallenge(
        uint256 challengerId,
        uint256 challengedId,
        uint256 tier
    ) external returns (bytes32 matchId) {
        if (challengerId == challengedId) revert ChallengeSelf();

        // Verify both agents are registered
        ArenaRegistry.ArenaStats memory challenger = arenaRegistry.getStats(challengerId);
        ArenaRegistry.ArenaStats memory challenged = arenaRegistry.getStats(challengedId);

        if (!challenger.registered) revert AgentNotRegistered();
        if (!challenged.registered) revert AgentNotRegistered();

        // Check both can compete in tier
        if (!arenaRegistry.canCompeteInTier(challengerId, tier)) revert InvalidTier();
        if (!arenaRegistry.canCompeteInTier(challengedId, tier)) revert InvalidTier();

        // Check neither is in an active match
        if (activeMatch[challengerId] != bytes32(0)) revert AgentInMatch();
        if (activeMatch[challengedId] != bytes32(0)) revert AgentInMatch();

        // Generate match ID
        matchId = keccak256(abi.encodePacked(
            challengerId,
            challengedId,
            tier,
            block.timestamp,
            blockhash(block.number - 1)
        ));

        // Get tier entry fee from the specified tier
        (,,uint256 entryFee) = arenaRegistry.tiers(tier);

        // Get agent wallets from identity registry
        address challenger1Wallet = arenaRegistry.identityRegistry().getWalletByAgent(challengerId);
        address challenged2Wallet = arenaRegistry.identityRegistry().getWalletByAgent(challengedId);

        // Create match in escrow
        matchEscrow.createMatch(
            matchId,
            challengerId,
            challengedId,
            challenger1Wallet,
            challenged2Wallet,
            entryFee
        );

        // Track match state
        matchStates[matchId] = MatchState({
            matchId: matchId,
            challenger: challengerId,
            challenged: challengedId,
            tier: tier,
            challengedAt: block.timestamp,
            accepted: false,
            agent1Pnl: 0,
            agent2Pnl: 0,
            resultHash: bytes32(0),
            resultSubmitted: false,
            settled: false
        });

        // Mark agents as in match (pending)
        activeMatch[challengerId] = matchId;
        activeMatch[challengedId] = matchId;

        emit ChallengeCreated(matchId, challengerId, challengedId, tier);
    }

    /**
     * @notice Accept a challenge (both agents must fund escrow first)
     * @param matchId The match ID
     */
    function acceptChallenge(bytes32 matchId) external {
        MatchState storage state = matchStates[matchId];
        if (state.matchId == bytes32(0)) revert ChallengeNotFound();
        if (state.accepted) revert ChallengeAlreadyAccepted();

        // Check challenge hasn't expired
        if (block.timestamp > state.challengedAt + challengeTimeout) {
            _expireChallenge(matchId);
            revert ChallengeNotFound();
        }

        // Verify both agents have funded
        if (!matchEscrow.isFullyFunded(matchId)) revert MatchNotReady();

        state.accepted = true;

        // Start match
        matchEscrow.startMatch(matchId);

        emit ChallengeAccepted(matchId);
    }

    /**
     * @notice Cancel an expired challenge
     * @param matchId The match ID
     */
    function cancelExpiredChallenge(bytes32 matchId) external {
        MatchState storage state = matchStates[matchId];
        if (state.matchId == bytes32(0)) revert ChallengeNotFound();
        if (state.accepted) revert ChallengeAlreadyAccepted();

        if (block.timestamp > state.challengedAt + challengeTimeout) {
            _expireChallenge(matchId);
        }
    }

    /**
     * @notice Submit match result (oracle only)
     * @param matchId The match ID
     * @param agent1Pnl Agent 1's P&L in USDC
     * @param agent2Pnl Agent 2's P&L in USDC
     * @param resultHash Hash of detailed results for verification
     */
    function submitResult(
        bytes32 matchId,
        int256 agent1Pnl,
        int256 agent2Pnl,
        bytes32 resultHash
    ) external {
        if (!trustedOracles[msg.sender]) revert NotTrustedOracle();

        MatchState storage state = matchStates[matchId];
        if (state.matchId == bytes32(0)) revert ChallengeNotFound();
        if (!state.accepted) revert ChallengeNotAccepted();
        if (state.resultSubmitted) revert ResultAlreadySubmitted();

        // Verify match has ended (time-based)
        MatchEscrow.Match memory m = matchEscrow.getMatch(matchId);
        if (m.startedAt + matchDuration > block.timestamp) revert MatchNotEnded();

        state.agent1Pnl = agent1Pnl;
        state.agent2Pnl = agent2Pnl;
        state.resultHash = resultHash;
        state.resultSubmitted = true;

        // Complete match in escrow
        matchEscrow.completeMatch(matchId);

        emit MatchResultSubmitted(matchId, agent1Pnl, agent2Pnl, resultHash);
    }

    /**
     * @notice Settle match after result submission
     * @param matchId The match ID
     */
    function settleMatch(bytes32 matchId) external {
        MatchState storage state = matchStates[matchId];
        if (!state.resultSubmitted) revert MatchNotReady();
        if (state.settled) revert AlreadySettled();

        // Determine winner based on P&L
        uint256 winnerId;
        bool isDraw = false;

        if (state.agent1Pnl > state.agent2Pnl) {
            winnerId = state.challenger;
        } else if (state.agent2Pnl > state.agent1Pnl) {
            winnerId = state.challenged;
        } else {
            // Draw
            winnerId = 0;
            isDraw = true;
        }

        // Update ELO ratings
        if (isDraw) {
            arenaRegistry.updateElo(state.challenger, state.challenged, true);
        } else {
            uint256 loserId = winnerId == state.challenger ? state.challenged : state.challenger;
            arenaRegistry.updateElo(winnerId, loserId, false);
        }

        // Record individual results
        bool agent1Won = state.agent1Pnl > state.agent2Pnl;
        bool agent2Won = state.agent2Pnl > state.agent1Pnl;

        arenaRegistry.recordMatchResult(state.challenger, state.agent1Pnl, agent1Won);
        arenaRegistry.recordMatchResult(state.challenged, state.agent2Pnl, agent2Won);

        // Mark as settled BEFORE external call (CEI pattern)
        state.settled = true;

        // Distribute prizes
        matchEscrow.distributeWinnings(matchId, winnerId);

        // Clear active match
        activeMatch[state.challenger] = bytes32(0);
        activeMatch[state.challenged] = bytes32(0);

        emit MatchSettled(matchId, winnerId);
    }

    // Internal functions

    function _expireChallenge(bytes32 matchId) internal {
        MatchState storage state = matchStates[matchId];

        // Refund any deposited funds
        matchEscrow.refundMatch(matchId);

        // Clear active match
        activeMatch[state.challenger] = bytes32(0);
        activeMatch[state.challenged] = bytes32(0);

        emit ChallengeExpired(matchId);
    }

    // View functions

    function getMatchState(bytes32 matchId) external view returns (MatchState memory) {
        return matchStates[matchId];
    }

    function isAgentInMatch(uint256 agentId) external view returns (bool) {
        return activeMatch[agentId] != bytes32(0);
    }

    function getAgentActiveMatch(uint256 agentId) external view returns (bytes32) {
        return activeMatch[agentId];
    }

    // Admin functions

    function setOracle(address oracle, bool trusted) external onlyOwner {
        trustedOracles[oracle] = trusted;
        emit OracleUpdated(oracle, trusted);
    }

    function setMatchDuration(uint256 duration) external onlyOwner {
        matchDuration = duration;
    }

    function setChallengeTimeout(uint256 timeout) external onlyOwner {
        challengeTimeout = timeout;
    }

    function setArenaRegistry(address _arenaRegistry) external onlyOwner {
        arenaRegistry = ArenaRegistry(_arenaRegistry);
    }

    function setMatchEscrow(address _matchEscrow) external onlyOwner {
        matchEscrow = MatchEscrow(_matchEscrow);
    }
}
