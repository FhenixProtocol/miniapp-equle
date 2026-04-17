// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./EquleNFT.sol";

//'0'..'9' -> 0..9, '+'->10, '-'->11, '*'->12, '/'->13
//'0':0000 '1':0001 '2':0010 '3':0011 '4':0100 '5':0101 '6':0110 '7':0111
//'8':1000 '9':1001 '+':1010 '-':1011 '*':1100 '/':1101

//     [127...100][99...80][79...60][59...40][39...20][19...0]
//       unused     rot4     rot3     rot2     rot1     rot0

// doubts on - euint events and AA for ACL
// better pattern to have more storage on FHE results, or redo FHE on-demand?
// needs improvement on ownership

/**
 * @title Equle
 * @author (Fhenix*)
 * @notice A privacy-preserving mathematical equation guessing game using Fully Homomorphic Encryption (FHE)
 * @dev Players attempt to guess both a mathematical equation and its result within 5 attempts per day.
 *      The game uses FHE to maintain privacy of equations and results while allowing gameplay verification.
 */
contract Equle is Ownable {
    //ERRORS

    error MaxAttemptsReached(uint8 currentAttempts);
    error GameAlreadyWon(address player, uint256 gameId);
    error NoAttemptsYet(address player, uint256 gameId);

    //STATE VARIABLES

    uint256 public immutable startTimestamp;
    uint256 public constant DAY = 24 hours;
    uint256 public constant MAX_ATTEMPTS = 6;
    euint16 public ZERO;
    euint16 public ONE;
    euint16 public TWO;

    EquleNFT public equleNFT;

    struct AttemptData {
        euint128 equationGuess;
        euint16 resultGuess;
        euint128 equationXor;
        euint16 resultFeedback;
    }

    struct PlayerGameState {
        uint8 currentAttempt; // Current attempt count
        bool hasWon; // Whether player has won
    }

    //mapping: gameid -> playerAddress -> attemptNumber -> attempt data
    mapping(uint256 => mapping(address => mapping(uint8 => AttemptData)))
        private attemptData;
    //mapping: gameid -> playerAddress-> player game state
    mapping(uint256 => mapping(address => PlayerGameState))
        private playerStates;
    // mapping:gameid -> result (target result as euint for privacy)
    mapping(uint256 => euint16) public gameResult;
    // mapping: gameid -> equation
    mapping(uint256 => euint128) public gameEquation;

    //EVENTS

    event GuessSubmitted(
        address indexed player,
        uint256 indexed gameId,
        uint8 attemptNumber,
        euint128 lastEquationXor,
        euint16 resultFeedback
    );

    event GameFinalized(
        address indexed player,
        uint256 indexed gameId,
        uint8 attemptNumber
    );

    event GameCompleted(
        address indexed player,
        uint256 indexed gameId,
        bool won,
        uint8 totalAttempts
    );

    event NFTMinted(
        address indexed player,
        uint256 indexed gameId,
        uint8 attempts
    );

    constructor() Ownable(msg.sender) {
        startTimestamp = block.timestamp;
        ZERO = FHE.asEuint16(0);
        ONE = FHE.asEuint16(1);
        TWO = FHE.asEuint16(2);
        FHE.allowThis(ZERO);
        FHE.allowThis(ONE);
        FHE.allowThis(TWO);

        equleNFT = new EquleNFT(address(this));
    }

    //FUNCTIONS

    /**
     * @notice Submit a guess for both the equation and its result
     * @dev Stores the guess, performs XOR comparison with target equation, and checks result accuracy
     * @param equationGuess The encrypted equation guess from the player
     * @param resultGuess The encrypted result guess from the player
     */
    function guess(
        InEuint128 memory equationGuess,
        InEuint16 memory resultGuess
    ) public {
        uint256 gameId = getCurrentGameId();
        euint128 eqGuess = FHE.asEuint128(equationGuess);
        euint16 result = FHE.asEuint16(resultGuess);
        uint8 currentAttempt = playerStates[gameId][msg.sender].currentAttempt;

        // check and ++ user attempt
        if (currentAttempt >= MAX_ATTEMPTS) {
            revert MaxAttemptsReached(currentAttempt);
        }
        playerStates[gameId][msg.sender].currentAttempt++;

        if (playerStates[gameId][msg.sender].hasWon) {
            revert GameAlreadyWon(msg.sender, gameId);
        }

        //FHE operation
        euint128 equationXor = FHE.xor(eqGuess, gameEquation[gameId]);

        // result check
        euint16 resultFeedback = _resultCheck(result, gameResult[gameId]);

        // store the attempt data
        attemptData[gameId][msg.sender][currentAttempt] = AttemptData({
            equationGuess: eqGuess,
            resultGuess: result,
            equationXor: equationXor,
            resultFeedback: resultFeedback
        });

        //ACL
        FHE.allowSender(eqGuess);
        FHE.allowThis(eqGuess);

        FHE.allowSender(result);
        FHE.allowThis(result);

        FHE.allowSender(equationXor);
        FHE.allowThis(equationXor);

        FHE.allowSender(resultFeedback);
        FHE.allowThis(resultFeedback);

        emit GuessSubmitted(
            msg.sender,
            gameId,
            currentAttempt,
            equationXor,
            resultFeedback
        );
    }

    /**
     * @notice Compares user's result guess with the target result
     * @dev Returns 0 for correct, 1 for too low, 2 for too high (like Wordle feedback)
     * @param userGuess The encrypted user's result guess
     * @param targetResult The encrypted target result
     * @return resultAnswer Encrypted comparison result (0=correct, 1=too low, 2=too high)
     */
    function _resultCheck(
        euint16 userGuess,
        euint16 targetResult
    ) private returns (euint16 resultAnswer) {
        // eq = 0, lt = 1 , gt = 2
        ebool isEqual = FHE.eq(userGuess, targetResult);
        ebool userIsLower = FHE.lt(userGuess, targetResult);

        return FHE.select(isEqual, ZERO, FHE.select(userIsLower, ONE, TWO));
    }

    /**
     * @notice Marks the player's last equation XOR as publicly decryptable
     * @dev Client calls decryptForTx(ctHash).withoutPermit() off-chain to obtain
     *      the decrypted value + Threshold Network signature, then submits both
     *      to ClaimVictory for verification.
     * @return ctHash The bytes32 handle of the ciphertext the client must decrypt
     */
    function finalizeGame() public returns (bytes32 ctHash) {
        uint256 gameId = getCurrentGameId();

        if (playerStates[gameId][msg.sender].currentAttempt == 0) {
            revert NoAttemptsYet(msg.sender, gameId);
        }

        if (playerStates[gameId][msg.sender].hasWon) {
            revert GameAlreadyWon(msg.sender, gameId);
        }

        uint8 lastAttempt = playerStates[gameId][msg.sender].currentAttempt - 1;

        euint128 lastEquationXor = attemptData[gameId][msg.sender][lastAttempt]
            .equationXor;
        FHE.allowPublic(lastEquationXor);

        emit GameFinalized(msg.sender, gameId, lastAttempt);
        return euint128.unwrap(lastEquationXor);
    }

    /**
     * @notice Verifies the client-provided decryption and mints the victory NFT if valid
     * @dev The contract verifies the Threshold Network signature against the last
     *      attempt's XOR ciphertext. Victory = lower 20 bits of the decrypted value == 0.
     * @param decryptedValue The plaintext XOR value produced by decryptForTx
     * @param decryptionProof The Threshold Network signature returned by decryptForTx
     */
    function ClaimVictory(
        uint128 decryptedValue,
        bytes calldata decryptionProof
    ) public {
        uint256 gameId = getCurrentGameId();

        if (playerStates[gameId][msg.sender].currentAttempt == 0) {
            revert NoAttemptsYet(msg.sender, gameId);
        }

        if (playerStates[gameId][msg.sender].hasWon) {
            revert GameAlreadyWon(msg.sender, gameId);
        }

        uint8 lastAttempt = playerStates[gameId][msg.sender].currentAttempt - 1;

        euint128 lastEquationXor = attemptData[gameId][msg.sender][lastAttempt]
            .equationXor;

        FHE.verifyDecryptResult(
            lastEquationXor,
            decryptedValue,
            decryptionProof
        );

        uint128 mask = (1 << 20) - 1;
        uint128 lower20Bits = decryptedValue & mask;
        bool hasWon = (lower20Bits == 0);
        playerStates[gameId][msg.sender].hasWon = hasWon;

        if (hasWon) {
            equleNFT.mintOrUpdateNFT(msg.sender, gameId, lastAttempt + 1);
            emit NFTMinted(
                msg.sender,
                gameId,
                playerStates[gameId][msg.sender].currentAttempt
            );
        }

        emit GameCompleted(
            msg.sender,
            gameId,
            hasWon,
            playerStates[gameId][msg.sender].currentAttempt
        );
    }

    /**
     * @notice Sets the target equation and result for a specific game day (admin only)
     * @dev Allows owner to configure daily puzzles with encrypted values
     * @param gameId The game identifier (typically day number since contract deployment)
     * @param equation The encrypted target equation
     * @param result The encrypted target result
     */
    function setGame(
        uint256 gameId,
        InEuint128 memory equation,
        InEuint16 memory result
    ) external onlyOwner {
        gameEquation[gameId] = FHE.asEuint128(equation);
        gameResult[gameId] = FHE.asEuint16(result);
        FHE.allowThis(gameEquation[gameId]);
        FHE.allowThis(gameResult[gameId]);
    }

    function hasPlayerWon(
        uint256 gameId,
        address player
    ) external view returns (bool) {
        return playerStates[gameId][player].hasWon;
    }

    function getPlayerAttempts(
        uint256 gameId,
        address player
    ) external view returns (uint8) {
        return playerStates[gameId][player].currentAttempt;
    }

    function getPlayerLastEquationGuess(
        uint256 gameId,
        address player
    ) external view returns (euint128) {
        uint8 lastAttempt = playerStates[gameId][player].currentAttempt - 1;
        return attemptData[gameId][player][lastAttempt].equationGuess;
    }

    function getPlayerLastResultGuess(
        uint256 gameId,
        address player
    ) external view returns (euint16) {
        uint8 lastAttempt = playerStates[gameId][player].currentAttempt - 1;
        return attemptData[gameId][player][lastAttempt].resultGuess;
    }

    function getPlayerEquationXor(
        uint256 gameId,
        address player
    ) external view returns (euint128) {
        uint8 lastAttempt = playerStates[gameId][player].currentAttempt - 1;
        return attemptData[gameId][player][lastAttempt].equationXor;
    }

    function getPlayerGameState(
        uint256 gameId,
        address player
    ) external view returns (uint8 currentAttempt, bool hasWon) {
        PlayerGameState storage state = playerStates[gameId][player];
        return (state.currentAttempt, state.hasWon);
    }

    function getPlayerAttempt(
        uint256 gameId,
        address player,
        uint8 attemptNumber
    )
        external
        view
        returns (
            euint128 equationGuess,
            euint16 resultGuess,
            euint128 equationXor,
            euint16 resultFeedback
        )
    {
        AttemptData storage attempt = attemptData[gameId][player][
            attemptNumber
        ];
        return (
            attempt.equationGuess,
            attempt.resultGuess,
            attempt.equationXor,
            attempt.resultFeedback
        );
    }

    function getCurrentGameId() public view returns (uint256) {
        return ((block.timestamp - startTimestamp) / DAY) + 1;
    }
}
