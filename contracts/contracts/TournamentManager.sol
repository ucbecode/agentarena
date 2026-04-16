// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ArenaRegistry.sol";
import "./MatchEscrow.sol";

/**
 * @title TournamentManager
 * @notice Manages bracket-style tournaments for AgentArena
 * @dev Single elimination tournaments with prize distribution
 */
contract TournamentManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    ArenaRegistry public arenaRegistry;
    MatchEscrow public matchEscrow;

    // Tournament sizes: 8, 16, or 32 agents
    uint256[] public validSizes = [8, 16, 32];

    // Prize distribution in basis points (for 8-player: 1st, 2nd, 3rd-4th)
    // 50%, 25%, 12.5% each for 3rd/4th, 5% platform
    uint256 public constant PRIZE_1ST_BPS = 5000;
    uint256 public constant PRIZE_2ND_BPS = 2500;
    uint256 public constant PRIZE_3RD_BPS = 1000;  // Each 3rd/4th place
    uint256 public constant PLATFORM_FEE_BPS = 500;

    enum TournamentStatus {
        Registration,
        InProgress,
        Completed,
        Cancelled
    }

    struct Tournament {
        bytes32 tournamentId;
        string name;
        uint256 tier;
        uint256 entryFee;
        uint256 maxParticipants;
        uint256 prizePool;
        uint256[] participants;
        TournamentStatus status;
        uint256 createdAt;
        uint256 startedAt;
        uint256 endedAt;
        uint256 currentRound;
        uint256 totalRounds;
    }

    struct BracketMatch {
        bytes32 matchId;
        uint256 agent1Id;
        uint256 agent2Id;
        uint256 winnerId;
        uint256 round;
        uint256 position;  // Position in round (0-indexed)
        bool completed;
    }

    // tournamentId => Tournament
    mapping(bytes32 => Tournament) public tournaments;

    // tournamentId => round => position => BracketMatch
    mapping(bytes32 => mapping(uint256 => mapping(uint256 => BracketMatch))) public brackets;

    // tournamentId => agentId => registered
    mapping(bytes32 => mapping(uint256 => bool)) public registered;

    // Events
    event TournamentCreated(bytes32 indexed tournamentId, string name, uint256 tier, uint256 entryFee, uint256 maxParticipants);
    event AgentRegistered(bytes32 indexed tournamentId, uint256 indexed agentId);
    event TournamentStarted(bytes32 indexed tournamentId);
    event BracketMatchCreated(bytes32 indexed tournamentId, uint256 round, uint256 position, uint256 agent1, uint256 agent2);
    event BracketMatchCompleted(bytes32 indexed tournamentId, uint256 round, uint256 position, uint256 winnerId);
    event TournamentCompleted(bytes32 indexed tournamentId, uint256 winner, uint256 second, uint256 third1, uint256 third2);
    event PrizesDistributed(bytes32 indexed tournamentId, uint256 winner, uint256 winnerPrize);
    event TournamentCancelled(bytes32 indexed tournamentId);

    // Errors
    error InvalidSize();
    error TournamentNotFound();
    error RegistrationClosed();
    error TournamentFull();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidTier();
    error InvalidStatus();
    error NotEnoughParticipants();
    error RoundNotComplete();
    error MatchNotFound();

    constructor(
        address _usdc,
        address _arenaRegistry,
        address _matchEscrow
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        arenaRegistry = ArenaRegistry(_arenaRegistry);
        matchEscrow = MatchEscrow(_matchEscrow);
    }

    /**
     * @notice Create a new tournament
     * @param name Tournament name
     * @param tier Competition tier
     * @param entryFee Entry fee per participant
     * @param maxParticipants Maximum participants (8, 16, or 32)
     */
    function createTournament(
        string calldata name,
        uint256 tier,
        uint256 entryFee,
        uint256 maxParticipants
    ) external onlyOwner returns (bytes32 tournamentId) {
        bool validSize = false;
        for (uint i = 0; i < validSizes.length; i++) {
            if (validSizes[i] == maxParticipants) {
                validSize = true;
                break;
            }
        }
        if (!validSize) revert InvalidSize();

        tournamentId = keccak256(abi.encodePacked(
            name,
            tier,
            block.timestamp,
            blockhash(block.number - 1)
        ));

        // Calculate total rounds: log2(maxParticipants)
        uint256 totalRounds;
        if (maxParticipants == 8) totalRounds = 3;
        else if (maxParticipants == 16) totalRounds = 4;
        else totalRounds = 5;

        tournaments[tournamentId] = Tournament({
            tournamentId: tournamentId,
            name: name,
            tier: tier,
            entryFee: entryFee,
            maxParticipants: maxParticipants,
            prizePool: 0,
            participants: new uint256[](0),
            status: TournamentStatus.Registration,
            createdAt: block.timestamp,
            startedAt: 0,
            endedAt: 0,
            currentRound: 0,
            totalRounds: totalRounds
        });

        emit TournamentCreated(tournamentId, name, tier, entryFee, maxParticipants);
    }

    /**
     * @notice Register for a tournament
     * @param tournamentId The tournament ID
     * @param agentId The agent ID
     */
    function registerForTournament(bytes32 tournamentId, uint256 agentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        if (t.createdAt == 0) revert TournamentNotFound();
        if (t.status != TournamentStatus.Registration) revert RegistrationClosed();
        if (t.participants.length >= t.maxParticipants) revert TournamentFull();
        if (registered[tournamentId][agentId]) revert AlreadyRegistered();

        // Verify agent can compete in tier
        if (!arenaRegistry.canCompeteInTier(agentId, t.tier)) revert InvalidTier();

        // Verify sender is agent owner
        address wallet = arenaRegistry.identityRegistry().getWalletByAgent(agentId);
        if (msg.sender != wallet) revert NotRegistered();

        // Transfer entry fee
        usdc.safeTransferFrom(msg.sender, address(this), t.entryFee);
        t.prizePool += t.entryFee;

        t.participants.push(agentId);
        registered[tournamentId][agentId] = true;

        emit AgentRegistered(tournamentId, agentId);
    }

    /**
     * @notice Start the tournament (creates first round brackets)
     * @param tournamentId The tournament ID
     */
    function startTournament(bytes32 tournamentId) external onlyOwner {
        Tournament storage t = tournaments[tournamentId];
        if (t.status != TournamentStatus.Registration) revert InvalidStatus();
        if (t.participants.length < t.maxParticipants) revert NotEnoughParticipants();

        t.status = TournamentStatus.InProgress;
        t.startedAt = block.timestamp;
        t.currentRound = 1;

        // Shuffle participants (simple shuffle using block data)
        _shuffleParticipants(t.participants);

        // Create first round matches
        uint256 matchCount = t.maxParticipants / 2;
        for (uint256 i = 0; i < matchCount; i++) {
            bytes32 matchId = keccak256(abi.encodePacked(
                tournamentId,
                uint256(1),  // Round 1
                i
            ));

            brackets[tournamentId][1][i] = BracketMatch({
                matchId: matchId,
                agent1Id: t.participants[i * 2],
                agent2Id: t.participants[i * 2 + 1],
                winnerId: 0,
                round: 1,
                position: i,
                completed: false
            });

            emit BracketMatchCreated(tournamentId, 1, i, t.participants[i * 2], t.participants[i * 2 + 1]);
        }

        emit TournamentStarted(tournamentId);
    }

    /**
     * @notice Submit bracket match result
     * @param tournamentId The tournament ID
     * @param round The round number
     * @param position The match position in the round
     * @param winnerId The winning agent ID
     */
    function submitBracketResult(
        bytes32 tournamentId,
        uint256 round,
        uint256 position,
        uint256 winnerId
    ) external onlyOwner {
        Tournament storage t = tournaments[tournamentId];
        if (t.status != TournamentStatus.InProgress) revert InvalidStatus();

        BracketMatch storage m = brackets[tournamentId][round][position];
        if (m.matchId == bytes32(0)) revert MatchNotFound();
        if (m.completed) revert InvalidStatus();

        // Verify winner is one of the participants
        if (winnerId != m.agent1Id && winnerId != m.agent2Id) revert NotRegistered();

        m.winnerId = winnerId;
        m.completed = true;

        emit BracketMatchCompleted(tournamentId, round, position, winnerId);

        // Check if round is complete
        uint256 matchesInRound = t.maxParticipants / (2 ** round);
        bool roundComplete = true;
        for (uint256 i = 0; i < matchesInRound; i++) {
            if (!brackets[tournamentId][round][i].completed) {
                roundComplete = false;
                break;
            }
        }

        if (roundComplete) {
            _advanceRound(tournamentId);
        }
    }

    /**
     * @notice Advance to next round or complete tournament
     */
    function _advanceRound(bytes32 tournamentId) internal {
        Tournament storage t = tournaments[tournamentId];

        if (t.currentRound == t.totalRounds) {
            // Tournament complete
            _completeTournament(tournamentId);
        } else {
            // Create next round matches
            t.currentRound++;
            uint256 matchesInRound = t.maxParticipants / (2 ** t.currentRound);

            for (uint256 i = 0; i < matchesInRound; i++) {
                bytes32 matchId = keccak256(abi.encodePacked(
                    tournamentId,
                    t.currentRound,
                    i
                ));

                // Get winners from previous round
                uint256 prevPos1 = i * 2;
                uint256 prevPos2 = i * 2 + 1;

                uint256 agent1 = brackets[tournamentId][t.currentRound - 1][prevPos1].winnerId;
                uint256 agent2 = brackets[tournamentId][t.currentRound - 1][prevPos2].winnerId;

                brackets[tournamentId][t.currentRound][i] = BracketMatch({
                    matchId: matchId,
                    agent1Id: agent1,
                    agent2Id: agent2,
                    winnerId: 0,
                    round: t.currentRound,
                    position: i,
                    completed: false
                });

                emit BracketMatchCreated(tournamentId, t.currentRound, i, agent1, agent2);
            }
        }
    }

    /**
     * @notice Complete tournament and distribute prizes
     */
    function _completeTournament(bytes32 tournamentId) internal {
        Tournament storage t = tournaments[tournamentId];
        t.status = TournamentStatus.Completed;
        t.endedAt = block.timestamp;

        // Get final results
        BracketMatch memory finalMatch = brackets[tournamentId][t.totalRounds][0];
        uint256 winner = finalMatch.winnerId;
        uint256 second = finalMatch.agent1Id == winner ? finalMatch.agent2Id : finalMatch.agent1Id;

        // Get semifinal losers (3rd place)
        uint256 third1;
        uint256 third2;
        if (t.totalRounds >= 2) {
            BracketMatch memory semi1 = brackets[tournamentId][t.totalRounds - 1][0];
            BracketMatch memory semi2 = brackets[tournamentId][t.totalRounds - 1][1];
            third1 = semi1.agent1Id == semi1.winnerId ? semi1.agent2Id : semi1.agent1Id;
            third2 = semi2.agent1Id == semi2.winnerId ? semi2.agent2Id : semi2.agent1Id;
        }

        emit TournamentCompleted(tournamentId, winner, second, third1, third2);

        // Distribute prizes
        _distributePrizes(tournamentId, winner, second, third1, third2);
    }

    /**
     * @notice Distribute prizes to winners
     * @dev Uses remainder approach to handle rounding: last place gets any leftover from integer division
     */
    function _distributePrizes(
        bytes32 tournamentId,
        uint256 winner,
        uint256 second,
        uint256 third1,
        uint256 third2
    ) internal {
        Tournament storage t = tournaments[tournamentId];

        // Calculate prizes with potential rounding
        uint256 platformFee = (t.prizePool * PLATFORM_FEE_BPS) / 10000;
        uint256 prize1st = (t.prizePool * PRIZE_1ST_BPS) / 10000;
        uint256 prize2nd = (t.prizePool * PRIZE_2ND_BPS) / 10000;
        uint256 prize3rd = (t.prizePool * PRIZE_3RD_BPS) / 10000;

        // Track total distributed to handle rounding
        uint256 totalDistributed = platformFee + prize1st + prize2nd;
        uint256 third1Prize = 0;
        uint256 third2Prize = 0;

        // Platform fee
        usdc.safeTransfer(owner(), platformFee);

        // Winner
        address winnerWallet = arenaRegistry.identityRegistry().getWalletByAgent(winner);
        usdc.safeTransfer(winnerWallet, prize1st);

        // Second place
        address secondWallet = arenaRegistry.identityRegistry().getWalletByAgent(second);
        usdc.safeTransfer(secondWallet, prize2nd);

        // Third places - give second 3rd place any rounding remainder
        if (third1 > 0) {
            third1Prize = prize3rd;
            totalDistributed += third1Prize;
            address third1Wallet = arenaRegistry.identityRegistry().getWalletByAgent(third1);
            usdc.safeTransfer(third1Wallet, third1Prize);
        }
        if (third2 > 0) {
            // Give last place the remainder to handle rounding
            third2Prize = t.prizePool - totalDistributed;
            address third2Wallet = arenaRegistry.identityRegistry().getWalletByAgent(third2);
            usdc.safeTransfer(third2Wallet, third2Prize);
        } else if (third1 == 0) {
            // If no 3rd places, remainder goes to platform
            uint256 remainder = t.prizePool - totalDistributed;
            if (remainder > 0) {
                usdc.safeTransfer(owner(), remainder);
            }
        }

        emit PrizesDistributed(tournamentId, winner, prize1st);
    }

    /**
     * @notice Cancel a tournament (refund all participants)
     */
    function cancelTournament(bytes32 tournamentId) external onlyOwner nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        if (t.status == TournamentStatus.Completed || t.status == TournamentStatus.Cancelled) {
            revert InvalidStatus();
        }

        t.status = TournamentStatus.Cancelled;

        // Refund all participants
        for (uint256 i = 0; i < t.participants.length; i++) {
            address wallet = arenaRegistry.identityRegistry().getWalletByAgent(t.participants[i]);
            usdc.safeTransfer(wallet, t.entryFee);
        }

        emit TournamentCancelled(tournamentId);
    }

    /**
     * @notice Shuffle participants for bracket seeding
     * @dev WARNING: This uses block.prevrandao which can be influenced by validators.
     *      For high-stakes tournaments, consider using Chainlink VRF:
     *      1. Request randomness before startTournament
     *      2. Use the random word as seed in _shuffleParticipants
     *      See: https://docs.chain.link/vrf
     *
     * Current implementation adds more entropy sources but is NOT fully secure:
     * - block.prevrandao: Can be influenced by validators (post-merge)
     * - block.timestamp: Can be manipulated within ~15 second window
     * - msg.sender: Adds some unpredictability from starter's address
     * - tournamentId: Unique per tournament
     */
    function _shuffleParticipants(uint256[] storage arr) internal {
        uint256 n = arr.length;
        // Combine multiple entropy sources (still not cryptographically secure)
        bytes32 seed = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            block.number,
            arr.length
        ));

        for (uint256 i = n - 1; i > 0; i--) {
            // Use evolving hash for each swap to reduce predictability
            seed = keccak256(abi.encodePacked(seed, i));
            uint256 j = uint256(seed) % (i + 1);
            (arr[i], arr[j]) = (arr[j], arr[i]);
        }
    }

    // View functions

    function getTournament(bytes32 tournamentId) external view returns (Tournament memory) {
        return tournaments[tournamentId];
    }

    function getParticipants(bytes32 tournamentId) external view returns (uint256[] memory) {
        return tournaments[tournamentId].participants;
    }

    function getBracketMatch(bytes32 tournamentId, uint256 round, uint256 position) external view returns (BracketMatch memory) {
        return brackets[tournamentId][round][position];
    }

    function isRegistered(bytes32 tournamentId, uint256 agentId) external view returns (bool) {
        return registered[tournamentId][agentId];
    }
}
