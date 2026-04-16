// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ArenaRegistry.sol";

/**
 * @title LeaderboardContract
 * @notice On-chain rankings for AgentArena
 * @dev Tracks seasonal and all-time leaderboards
 */
contract LeaderboardContract is Ownable {
    ArenaRegistry public arenaRegistry;

    // Season duration (30 days default)
    uint256 public seasonDuration = 30 days;

    // Current season
    uint256 public currentSeason;

    // Season start timestamps
    mapping(uint256 => uint256) public seasonStartTime;

    // Season rankings: season => position => agentId
    mapping(uint256 => mapping(uint256 => uint256)) public seasonRankings;

    // Season scores: season => agentId => score
    mapping(uint256 => mapping(uint256 => SeasonScore)) public seasonScores;

    // All-time top 100
    uint256[100] public allTimeTop;

    struct SeasonScore {
        uint256 agentId;
        int256 pnl;
        uint256 wins;
        uint256 losses;
        uint256 matches;
        uint256 peakElo;
        bool active;
    }

    // Events
    event SeasonStarted(uint256 indexed season, uint256 startTime);
    event SeasonEnded(uint256 indexed season, uint256 winner);
    event ScoreUpdated(uint256 indexed season, uint256 indexed agentId, int256 pnl, uint256 wins);
    event LeaderboardUpdated(uint256 indexed season, uint256 indexed position, uint256 indexed agentId);

    // Errors
    error SeasonNotActive();
    error SeasonAlreadyActive();
    error InvalidSeason();

    constructor(address _arenaRegistry) Ownable(msg.sender) {
        arenaRegistry = ArenaRegistry(_arenaRegistry);
    }

    /**
     * @notice Start a new season
     */
    function startSeason() external onlyOwner {
        if (currentSeason > 0) {
            uint256 seasonEnd = seasonStartTime[currentSeason] + seasonDuration;
            if (block.timestamp < seasonEnd) revert SeasonAlreadyActive();
        }

        currentSeason++;
        seasonStartTime[currentSeason] = block.timestamp;

        emit SeasonStarted(currentSeason, block.timestamp);
    }

    /**
     * @notice Record match result for season
     * @param agentId The agent ID
     * @param pnl P&L from the match
     * @param won Whether the agent won
     */
    function recordSeasonResult(
        uint256 agentId,
        int256 pnl,
        bool won
    ) external {
        // Only ArenaRegistry can call this
        if (msg.sender != address(arenaRegistry)) revert("Unauthorized");

        if (currentSeason == 0) return; // No active season
        if (block.timestamp > seasonStartTime[currentSeason] + seasonDuration) return; // Season ended

        SeasonScore storage score = seasonScores[currentSeason][agentId];

        if (!score.active) {
            score.agentId = agentId;
            score.active = true;
        }

        score.pnl += pnl;
        score.matches++;

        if (won) {
            score.wins++;
        } else {
            score.losses++;
        }

        // Update peak ELO
        ArenaRegistry.ArenaStats memory stats = arenaRegistry.getStats(agentId);
        if (stats.elo > score.peakElo) {
            score.peakElo = stats.elo;
        }

        emit ScoreUpdated(currentSeason, agentId, score.pnl, score.wins);
    }

    /**
     * @notice Get season score for an agent
     */
    function getSeasonScore(uint256 season, uint256 agentId) external view returns (SeasonScore memory) {
        return seasonScores[season][agentId];
    }

    /**
     * @notice Check if season is active
     */
    function isSeasonActive() external view returns (bool) {
        if (currentSeason == 0) return false;
        return block.timestamp <= seasonStartTime[currentSeason] + seasonDuration;
    }

    /**
     * @notice Get time remaining in current season
     */
    function seasonTimeRemaining() external view returns (uint256) {
        if (currentSeason == 0) return 0;
        uint256 endTime = seasonStartTime[currentSeason] + seasonDuration;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    /**
     * @notice Update all-time rankings (called periodically)
     * @param agents Array of agent IDs to consider
     */
    function updateAllTimeRankings(uint256[] calldata agents) external onlyOwner {
        // Simple insertion sort for top 100
        for (uint256 i = 0; i < agents.length; i++) {
            ArenaRegistry.ArenaStats memory stats = arenaRegistry.getStats(agents[i]);
            if (!stats.registered) continue;

            // Find position in top 100
            uint256 insertPos = 100;
            for (uint256 j = 0; j < 100; j++) {
                if (allTimeTop[j] == 0) {
                    insertPos = j;
                    break;
                }

                ArenaRegistry.ArenaStats memory existing = arenaRegistry.getStats(allTimeTop[j]);
                if (stats.elo > existing.elo) {
                    insertPos = j;
                    break;
                }
            }

            if (insertPos < 100) {
                // Check if already in list
                bool found = false;
                uint256 foundPos = 0;
                for (uint256 j = 0; j < 100; j++) {
                    if (allTimeTop[j] == agents[i]) {
                        found = true;
                        foundPos = j;
                        break;
                    }
                }

                if (found && foundPos > insertPos) {
                    // Move up
                    for (uint256 j = foundPos; j > insertPos; j--) {
                        allTimeTop[j] = allTimeTop[j - 1];
                    }
                    allTimeTop[insertPos] = agents[i];
                } else if (!found) {
                    // Insert new
                    for (uint256 j = 99; j > insertPos; j--) {
                        allTimeTop[j] = allTimeTop[j - 1];
                    }
                    allTimeTop[insertPos] = agents[i];
                }

                emit LeaderboardUpdated(0, insertPos, agents[i]);
            }
        }
    }

    /**
     * @notice Get top N agents for current season by P&L
     * @param n Number of agents to return
     * @param agents Pool of agents to consider
     */
    function getTopByPnl(uint256 n, uint256[] calldata agents) external view returns (uint256[] memory topAgents, int256[] memory pnls) {
        topAgents = new uint256[](n);
        pnls = new int256[](n);

        for (uint256 i = 0; i < agents.length; i++) {
            SeasonScore memory score = seasonScores[currentSeason][agents[i]];
            if (!score.active) continue;

            // Find insertion position
            for (uint256 j = 0; j < n; j++) {
                if (topAgents[j] == 0 || score.pnl > pnls[j]) {
                    // Shift down
                    for (uint256 k = n - 1; k > j; k--) {
                        topAgents[k] = topAgents[k - 1];
                        pnls[k] = pnls[k - 1];
                    }
                    topAgents[j] = agents[i];
                    pnls[j] = score.pnl;
                    break;
                }
            }
        }
    }

    /**
     * @notice Get top N agents by ELO
     * @param n Number of agents
     * @param agents Pool to consider
     */
    function getTopByElo(uint256 n, uint256[] calldata agents) external view returns (uint256[] memory topAgents, uint256[] memory elos) {
        topAgents = new uint256[](n);
        elos = new uint256[](n);

        for (uint256 i = 0; i < agents.length; i++) {
            ArenaRegistry.ArenaStats memory stats = arenaRegistry.getStats(agents[i]);
            if (!stats.registered) continue;

            for (uint256 j = 0; j < n; j++) {
                if (topAgents[j] == 0 || stats.elo > elos[j]) {
                    for (uint256 k = n - 1; k > j; k--) {
                        topAgents[k] = topAgents[k - 1];
                        elos[k] = elos[k - 1];
                    }
                    topAgents[j] = agents[i];
                    elos[j] = stats.elo;
                    break;
                }
            }
        }
    }

    /**
     * @notice Get all-time top 100
     */
    function getAllTimeTop() external view returns (uint256[100] memory) {
        return allTimeTop;
    }

    /**
     * @notice Get agent's all-time rank
     */
    function getAllTimeRank(uint256 agentId) external view returns (uint256) {
        for (uint256 i = 0; i < 100; i++) {
            if (allTimeTop[i] == agentId) {
                return i + 1; // 1-indexed rank
            }
        }
        return 0; // Not in top 100
    }

    // Admin functions

    function setSeasonDuration(uint256 duration) external onlyOwner {
        seasonDuration = duration;
    }

    function setArenaRegistry(address _arenaRegistry) external onlyOwner {
        arenaRegistry = ArenaRegistry(_arenaRegistry);
    }
}
