// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MatchEscrow
 * @notice Manages entry fees and prize distribution for AgentArena matches
 * @dev Handles USDC deposits, match funding, and prize payouts
 */
contract MatchEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    // Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps = 250;

    // Platform fee recipient
    address public feeRecipient;

    enum MatchStatus {
        Created,
        Funded,           // Both agents funded
        InProgress,       // Match started
        Completed,        // Match ended, awaiting settlement
        Settled,          // Prizes distributed
        Cancelled,        // Match cancelled, refunded
        Disputed          // Dispute raised
    }

    struct Match {
        bytes32 matchId;
        uint256 agent1Id;
        uint256 agent2Id;
        uint256 entryFee;
        uint256 prizePool;
        address agent1Wallet;
        address agent2Wallet;
        bool agent1Funded;
        bool agent2Funded;
        MatchStatus status;
        uint256 createdAt;
        uint256 startedAt;
        uint256 endedAt;
        uint256 disputedAt;       // Track when dispute was raised
    }

    // Dispute timeout: 7 days for resolution
    uint256 public constant DISPUTE_TIMEOUT = 7 days;

    // Maximum match duration before emergency withdrawal allowed (30 days)
    uint256 public constant MAX_MATCH_DURATION = 30 days;

    // matchId => Match
    mapping(bytes32 => Match) public matches;

    // Authorized match managers
    mapping(address => bool) public authorizedManagers;

    // Events
    event MatchCreated(bytes32 indexed matchId, uint256 agent1Id, uint256 agent2Id, uint256 entryFee);
    event MatchFunded(bytes32 indexed matchId, uint256 agentId, uint256 amount);
    event MatchStarted(bytes32 indexed matchId, uint256 startedAt);
    event MatchCompleted(bytes32 indexed matchId, uint256 endedAt);
    event PrizeDistributed(bytes32 indexed matchId, uint256 winnerId, uint256 winnerAmount, uint256 platformFee);
    event MatchRefunded(bytes32 indexed matchId, uint256 agent1Refund, uint256 agent2Refund);
    event MatchDisputed(bytes32 indexed matchId);
    event DisputeResolved(bytes32 indexed matchId, uint256 winnerId);
    event DisputeTimedOut(bytes32 indexed matchId);
    event EmergencyWithdrawal(bytes32 indexed matchId, address recipient, uint256 amount);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    // Errors
    error MatchExists();
    error MatchNotFound();
    error InvalidStatus();
    error InvalidAmount();
    error InvalidAgent();
    error AlreadyFunded();
    error NotFunded();
    error Unauthorized();
    error FeeTooHigh();
    error DisputeNotTimedOut();
    error MatchNotStale();

    modifier onlyManager() {
        if (!authorizedManagers[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(address _usdc, address _feeRecipient) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }

    /**
     * @notice Create a new match
     * @param matchId Unique match identifier
     * @param agent1Id First agent's ERC-8004 ID
     * @param agent2Id Second agent's ERC-8004 ID
     * @param agent1Wallet First agent's wallet
     * @param agent2Wallet Second agent's wallet
     * @param entryFee Entry fee per agent in USDC
     */
    function createMatch(
        bytes32 matchId,
        uint256 agent1Id,
        uint256 agent2Id,
        address agent1Wallet,
        address agent2Wallet,
        uint256 entryFee
    ) external onlyManager {
        if (matches[matchId].createdAt != 0) revert MatchExists();
        if (agent1Id == agent2Id) revert InvalidAgent();
        // Allow $0 entry for free tier testing
        // if (entryFee == 0) revert InvalidAmount();

        matches[matchId] = Match({
            matchId: matchId,
            agent1Id: agent1Id,
            agent2Id: agent2Id,
            entryFee: entryFee,
            prizePool: 0,
            agent1Wallet: agent1Wallet,
            agent2Wallet: agent2Wallet,
            agent1Funded: false,
            agent2Funded: false,
            status: MatchStatus.Created,
            createdAt: block.timestamp,
            startedAt: 0,
            endedAt: 0,
            disputedAt: 0
        });

        emit MatchCreated(matchId, agent1Id, agent2Id, entryFee);
    }

    /**
     * @notice Fund a match (agent deposits entry fee)
     * @param matchId The match ID
     * @param agentId The agent ID funding the match
     */
    function fundMatch(bytes32 matchId, uint256 agentId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.createdAt == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Created && m.status != MatchStatus.Funded) revert InvalidStatus();

        bool isAgent1 = agentId == m.agent1Id;
        bool isAgent2 = agentId == m.agent2Id;

        if (!isAgent1 && !isAgent2) revert InvalidAgent();

        // Verify sender is the agent's wallet
        if (isAgent1) {
            if (msg.sender != m.agent1Wallet) revert Unauthorized();
            if (m.agent1Funded) revert AlreadyFunded();
        } else {
            if (msg.sender != m.agent2Wallet) revert Unauthorized();
            if (m.agent2Funded) revert AlreadyFunded();
        }

        // Transfer entry fee (skip if free tier)
        if (m.entryFee > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), m.entryFee);
            m.prizePool += m.entryFee;
        }

        if (isAgent1) {
            m.agent1Funded = true;
        } else {
            m.agent2Funded = true;
        }

        emit MatchFunded(matchId, agentId, m.entryFee);

        // If both funded, update status
        if (m.agent1Funded && m.agent2Funded) {
            m.status = MatchStatus.Funded;
        }
    }

    /**
     * @notice Start a funded match
     * @param matchId The match ID
     */
    function startMatch(bytes32 matchId) external onlyManager {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Funded) revert InvalidStatus();

        m.status = MatchStatus.InProgress;
        m.startedAt = block.timestamp;

        emit MatchStarted(matchId, m.startedAt);
    }

    /**
     * @notice Mark match as completed (awaiting settlement)
     * @param matchId The match ID
     */
    function completeMatch(bytes32 matchId) external onlyManager {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.InProgress) revert InvalidStatus();

        m.status = MatchStatus.Completed;
        m.endedAt = block.timestamp;

        emit MatchCompleted(matchId, m.endedAt);
    }

    /**
     * @notice Distribute prize to winner
     * @param matchId The match ID
     * @param winnerId The winning agent's ID (0 for draw)
     */
    function distributeWinnings(bytes32 matchId, uint256 winnerId) external onlyManager nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Completed) revert InvalidStatus();

        uint256 platformFee = (m.prizePool * platformFeeBps) / 10000;
        uint256 netPrize = m.prizePool - platformFee;

        m.status = MatchStatus.Settled;

        // Send platform fee
        if (platformFee > 0) {
            usdc.safeTransfer(feeRecipient, platformFee);
        }

        if (winnerId == 0) {
            // Draw - split evenly
            uint256 half = netPrize / 2;
            usdc.safeTransfer(m.agent1Wallet, half);
            usdc.safeTransfer(m.agent2Wallet, netPrize - half);

            emit PrizeDistributed(matchId, 0, half, platformFee);
        } else if (winnerId == m.agent1Id) {
            usdc.safeTransfer(m.agent1Wallet, netPrize);
            emit PrizeDistributed(matchId, winnerId, netPrize, platformFee);
        } else if (winnerId == m.agent2Id) {
            usdc.safeTransfer(m.agent2Wallet, netPrize);
            emit PrizeDistributed(matchId, winnerId, netPrize, platformFee);
        } else {
            revert InvalidAgent();
        }
    }

    /**
     * @notice Cancel match and refund both agents
     * @param matchId The match ID
     */
    function refundMatch(bytes32 matchId) external onlyManager nonReentrant {
        Match storage m = matches[matchId];
        if (m.status == MatchStatus.Settled || m.status == MatchStatus.Cancelled) {
            revert InvalidStatus();
        }

        uint256 agent1Refund = 0;
        uint256 agent2Refund = 0;

        if (m.agent1Funded) {
            agent1Refund = m.entryFee;
            usdc.safeTransfer(m.agent1Wallet, agent1Refund);
        }

        if (m.agent2Funded) {
            agent2Refund = m.entryFee;
            usdc.safeTransfer(m.agent2Wallet, agent2Refund);
        }

        m.status = MatchStatus.Cancelled;
        m.prizePool = 0;

        emit MatchRefunded(matchId, agent1Refund, agent2Refund);
    }

    /**
     * @notice Raise a dispute on a match
     * @param matchId The match ID
     */
    function disputeMatch(bytes32 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Completed) revert InvalidStatus();
        if (msg.sender != m.agent1Wallet && msg.sender != m.agent2Wallet) revert Unauthorized();

        m.status = MatchStatus.Disputed;
        m.disputedAt = block.timestamp;
        emit MatchDisputed(matchId);
    }

    /**
     * @notice Resolve a disputed match
     * @param matchId The match ID
     * @param winnerId The winner (determined by arbitration)
     */
    function resolveDispute(bytes32 matchId, uint256 winnerId) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Disputed) revert InvalidStatus();

        uint256 platformFee = (m.prizePool * platformFeeBps) / 10000;
        uint256 netPrize = m.prizePool - platformFee;

        m.status = MatchStatus.Settled;

        if (platformFee > 0) {
            usdc.safeTransfer(feeRecipient, platformFee);
        }

        address winner = winnerId == m.agent1Id ? m.agent1Wallet : m.agent2Wallet;
        usdc.safeTransfer(winner, netPrize);

        emit DisputeResolved(matchId, winnerId);
    }

    /**
     * @notice Resolve a timed-out dispute (split funds evenly after timeout)
     * @param matchId The match ID
     */
    function resolveTimedOutDispute(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Disputed) revert InvalidStatus();
        if (block.timestamp < m.disputedAt + DISPUTE_TIMEOUT) revert DisputeNotTimedOut();

        uint256 platformFee = (m.prizePool * platformFeeBps) / 10000;
        uint256 netPrize = m.prizePool - platformFee;

        m.status = MatchStatus.Settled;

        if (platformFee > 0) {
            usdc.safeTransfer(feeRecipient, platformFee);
        }

        // Split evenly on timeout
        uint256 half = netPrize / 2;
        usdc.safeTransfer(m.agent1Wallet, half);
        usdc.safeTransfer(m.agent2Wallet, netPrize - half);

        emit DisputeTimedOut(matchId);
    }

    /**
     * @notice Emergency withdrawal for stale matches (stuck for 30+ days)
     * @param matchId The match ID
     */
    function emergencyWithdraw(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];

        // Only for stuck matches (not settled or cancelled)
        if (m.status == MatchStatus.Settled || m.status == MatchStatus.Cancelled) {
            revert InvalidStatus();
        }

        // Only participants can initiate
        if (msg.sender != m.agent1Wallet && msg.sender != m.agent2Wallet) {
            revert Unauthorized();
        }

        // Must be stale (30+ days old)
        if (block.timestamp < m.createdAt + MAX_MATCH_DURATION) {
            revert MatchNotStale();
        }

        uint256 agent1Refund = 0;
        uint256 agent2Refund = 0;

        if (m.agent1Funded) {
            agent1Refund = m.entryFee;
            usdc.safeTransfer(m.agent1Wallet, agent1Refund);
            emit EmergencyWithdrawal(matchId, m.agent1Wallet, agent1Refund);
        }

        if (m.agent2Funded) {
            agent2Refund = m.entryFee;
            usdc.safeTransfer(m.agent2Wallet, agent2Refund);
            emit EmergencyWithdrawal(matchId, m.agent2Wallet, agent2Refund);
        }

        m.status = MatchStatus.Cancelled;
        m.prizePool = 0;
    }

    // View functions

    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function isFullyFunded(bytes32 matchId) external view returns (bool) {
        Match memory m = matches[matchId];
        return m.agent1Funded && m.agent2Funded;
    }

    function getPrizePool(bytes32 matchId) external view returns (uint256) {
        return matches[matchId].prizePool;
    }

    // Admin functions

    function setManager(address manager, bool authorized) external onlyOwner {
        authorizedManagers[manager] = authorized;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        feeRecipient = newRecipient;
    }

    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert FeeTooHigh(); // Max 10%
        uint256 oldFee = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(oldFee, newFeeBps);
    }
}
