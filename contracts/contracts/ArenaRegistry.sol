// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IIdentityRegistry.sol";

// Forward declaration for LeaderboardContract
interface ILeaderboardContract {
    function recordSeasonResult(uint256 agentId, int256 pnl, bool won) external;
}

/**
 * @title ArenaRegistry
 * @notice Extends ERC-8004 identity with trading competition features
 * @dev Tracks ELO ratings, wins, losses, and total P&L per agent
 */
contract ArenaRegistry is Ownable {
    IIdentityRegistry public identityRegistry;
    ILeaderboardContract public leaderboardContract;

    // Starting ELO for new agents
    uint256 public constant STARTING_ELO = 1000;

    // K-factor for ELO calculation (higher = more volatile ratings)
    uint256 public constant K_FACTOR = 32;

    struct ArenaStats {
        uint256 elo;
        uint256 wins;
        uint256 losses;
        uint256 draws;
        int256 totalPnlUsdc;  // In USDC wei (6 decimals)
        string tradingEndpoint;
        bool registered;
        uint256 registeredAt;
        uint256 lastMatchAt;
    }

    // agentId => ArenaStats
    mapping(uint256 => ArenaStats) public stats;

    // Tier thresholds
    struct Tier {
        string name;
        uint256 minElo;
        uint256 entryFeeUsdc;
    }

    Tier[] public tiers;

    // Authorized match managers that can update ELO
    mapping(address => bool) public authorizedManagers;

    // Events
    event AgentRegistered(uint256 indexed agentId, string tradingEndpoint);
    event EloUpdated(uint256 indexed agentId, uint256 oldElo, uint256 newElo);
    event StatsUpdated(uint256 indexed agentId, uint256 wins, uint256 losses, int256 totalPnl);
    event ManagerAuthorized(address indexed manager, bool authorized);
    event TierAdded(string name, uint256 minElo, uint256 entryFeeUsdc);

    // Errors
    error NotRegistered();
    error AlreadyRegistered();
    error InvalidIdentity();
    error UnauthorizedManager();
    error NotAgentOwner();

    modifier onlyManager() {
        if (!authorizedManagers[msg.sender]) revert UnauthorizedManager();
        _;
    }

    modifier onlyAgentOwner(uint256 agentId) {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        _;
    }

    constructor(address _identityRegistry) Ownable(msg.sender) {
        identityRegistry = IIdentityRegistry(_identityRegistry);

        // Initialize default tiers
        tiers.push(Tier("Free", 0, 0));                   // $0 for testing
        tiers.push(Tier("Rookie", 0, 5_000_000));          // $5
        tiers.push(Tier("Bronze", 1100, 25_000_000));      // $25
        tiers.push(Tier("Silver", 1300, 100_000_000));     // $100
        tiers.push(Tier("Gold", 1500, 500_000_000));       // $500
        tiers.push(Tier("Diamond", 1700, 2000_000_000));   // $2000
    }

    /**
     * @notice Register an agent for arena competition
     * @param agentId The ERC-8004 agent ID
     * @param tradingEndpoint The agent's trading API endpoint
     */
    function registerForArena(uint256 agentId, string calldata tradingEndpoint) external onlyAgentOwner(agentId) {
        if (!identityRegistry.agentExists(agentId)) revert InvalidIdentity();
        if (stats[agentId].registered) revert AlreadyRegistered();

        stats[agentId] = ArenaStats({
            elo: STARTING_ELO,
            wins: 0,
            losses: 0,
            draws: 0,
            totalPnlUsdc: 0,
            tradingEndpoint: tradingEndpoint,
            registered: true,
            registeredAt: block.timestamp,
            lastMatchAt: 0
        });

        emit AgentRegistered(agentId, tradingEndpoint);
    }

    /**
     * @notice Update trading endpoint
     * @param agentId The agent ID
     * @param newEndpoint New trading endpoint URL
     */
    function updateEndpoint(uint256 agentId, string calldata newEndpoint) external onlyAgentOwner(agentId) {
        if (!stats[agentId].registered) revert NotRegistered();
        stats[agentId].tradingEndpoint = newEndpoint;
    }

    /**
     * @notice Update ELO after a match (called by MatchManager)
     * @param winnerId Winner agent ID (0 for draw)
     * @param loserId Loser agent ID (0 for draw)
     * @param isDraw Whether the match was a draw
     */
    function updateElo(uint256 winnerId, uint256 loserId, bool isDraw) external onlyManager {
        if (isDraw) {
            _updateEloForDraw(winnerId, loserId);
        } else {
            _updateEloForWin(winnerId, loserId);
        }
    }

    /**
     * @notice Record match result with P&L
     * @param agentId The agent ID
     * @param pnlUsdc P&L in USDC (can be negative)
     * @param won Whether the agent won
     */
    function recordMatchResult(
        uint256 agentId,
        int256 pnlUsdc,
        bool won
    ) external onlyManager {
        if (!stats[agentId].registered) revert NotRegistered();

        ArenaStats storage s = stats[agentId];

        if (won) {
            s.wins++;
        } else {
            s.losses++;
        }

        s.totalPnlUsdc += pnlUsdc;
        s.lastMatchAt = block.timestamp;

        emit StatsUpdated(agentId, s.wins, s.losses, s.totalPnlUsdc);

        // Record in season leaderboard if configured
        if (address(leaderboardContract) != address(0)) {
            try leaderboardContract.recordSeasonResult(agentId, pnlUsdc, won) {
                // Success - leaderboard updated
            } catch {
                // Leaderboard update failed - don't revert main transaction
                // This could happen if season is not active
            }
        }
    }

    /**
     * @notice Get agent's current tier based on ELO
     * @param agentId The agent ID
     * @return tierIndex The tier index
     * @return tier The tier details
     */
    function getAgentTier(uint256 agentId) external view returns (uint256 tierIndex, Tier memory tier) {
        uint256 elo = stats[agentId].elo;

        // Find highest tier agent qualifies for
        for (uint256 i = tiers.length; i > 0; i--) {
            if (elo >= tiers[i-1].minElo) {
                return (i-1, tiers[i-1]);
            }
        }

        return (0, tiers[0]);
    }

    /**
     * @notice Check if agent can compete in a tier
     * @param agentId The agent ID
     * @param tierIndex The tier to check
     */
    function canCompeteInTier(uint256 agentId, uint256 tierIndex) external view returns (bool) {
        if (!stats[agentId].registered) return false;
        if (tierIndex >= tiers.length) return false;
        return stats[agentId].elo >= tiers[tierIndex].minElo;
    }

    /**
     * @notice Get full stats for an agent
     * @param agentId The agent ID
     */
    function getStats(uint256 agentId) external view returns (ArenaStats memory) {
        return stats[agentId];
    }

    /**
     * @notice Get win rate for an agent (basis points)
     * @param agentId The agent ID
     */
    function getWinRate(uint256 agentId) external view returns (uint256) {
        ArenaStats memory s = stats[agentId];
        uint256 total = s.wins + s.losses + s.draws;
        if (total == 0) return 0;
        return (s.wins * 10000) / total;
    }

    // Admin functions

    function setManager(address manager, bool authorized) external onlyOwner {
        authorizedManagers[manager] = authorized;
        emit ManagerAuthorized(manager, authorized);
    }

    function addTier(string calldata name, uint256 minElo, uint256 entryFeeUsdc) external onlyOwner {
        tiers.push(Tier(name, minElo, entryFeeUsdc));
        emit TierAdded(name, minElo, entryFeeUsdc);
    }

    function getTierCount() external view returns (uint256) {
        return tiers.length;
    }

    function setLeaderboardContract(address _leaderboardContract) external onlyOwner {
        leaderboardContract = ILeaderboardContract(_leaderboardContract);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    // Internal ELO calculation

    function _updateEloForWin(uint256 winnerId, uint256 loserId) internal {
        ArenaStats storage winner = stats[winnerId];
        ArenaStats storage loser = stats[loserId];

        uint256 winnerOldElo = winner.elo;
        uint256 loserOldElo = loser.elo;

        // Calculate expected scores (scaled by 1000 for precision)
        uint256 expectedWinner = _expectedScore(winnerOldElo, loserOldElo);
        uint256 expectedLoser = 1000 - expectedWinner;

        // Update ELOs
        // Winner gets K * (1 - expected)
        uint256 winnerGain = (K_FACTOR * (1000 - expectedWinner)) / 1000;
        winner.elo = winnerOldElo + winnerGain;

        // Loser loses K * expected
        uint256 loserLoss = (K_FACTOR * expectedLoser) / 1000;
        if (loserOldElo > loserLoss) {
            loser.elo = loserOldElo - loserLoss;
        } else {
            loser.elo = 100; // Minimum ELO floor
        }

        emit EloUpdated(winnerId, winnerOldElo, winner.elo);
        emit EloUpdated(loserId, loserOldElo, loser.elo);
    }

    function _updateEloForDraw(uint256 agent1Id, uint256 agent2Id) internal {
        ArenaStats storage agent1 = stats[agent1Id];
        ArenaStats storage agent2 = stats[agent2Id];

        uint256 agent1OldElo = agent1.elo;
        uint256 agent2OldElo = agent2.elo;

        // Expected scores
        uint256 expected1 = _expectedScore(agent1OldElo, agent2OldElo);
        uint256 expected2 = 1000 - expected1;

        // Draw = 0.5 actual score
        // Change = K * (0.5 - expected)
        int256 change1 = int256(K_FACTOR) * (int256(500) - int256(expected1)) / 1000;
        int256 change2 = int256(K_FACTOR) * (int256(500) - int256(expected2)) / 1000;

        // Apply changes
        if (change1 >= 0) {
            agent1.elo = agent1OldElo + uint256(change1);
        } else {
            uint256 loss = uint256(-change1);
            agent1.elo = agent1OldElo > loss ? agent1OldElo - loss : 100;
        }

        if (change2 >= 0) {
            agent2.elo = agent2OldElo + uint256(change2);
        } else {
            uint256 loss = uint256(-change2);
            agent2.elo = agent2OldElo > loss ? agent2OldElo - loss : 100;
        }

        agent1.draws++;
        agent2.draws++;

        emit EloUpdated(agent1Id, agent1OldElo, agent1.elo);
        emit EloUpdated(agent2Id, agent2OldElo, agent2.elo);
    }

    /**
     * @notice Calculate expected score (scaled by 1000)
     * @dev Uses approximation of 1 / (1 + 10^((ratingB - ratingA) / 400))
     */
    function _expectedScore(uint256 ratingA, uint256 ratingB) internal pure returns (uint256) {
        // Simplified ELO expected score calculation
        // Higher rated player expected to win more often
        if (ratingA >= ratingB) {
            uint256 diff = ratingA - ratingB;
            if (diff > 400) diff = 400; // Cap difference
            // Approximate: 500 + (diff * 500 / 400)
            return 500 + (diff * 500) / 400;
        } else {
            uint256 diff = ratingB - ratingA;
            if (diff > 400) diff = 400;
            return 500 - (diff * 500) / 400;
        }
    }
}
