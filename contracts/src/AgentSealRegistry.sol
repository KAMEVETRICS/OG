// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentSealRegistry
/// @notice Version-bound, policy-specific safety certifications for ERC-8004 agents.
contract AgentSealRegistry {
    enum ValidationStatus {
        Valid,
        Missing,
        Revoked,
        Expired,
        WrongIssuer,
        CriticalFailure,
        ScoreTooLow
    }

    struct Seal {
        uint256 agentId;
        bytes32 versionHash;
        bytes32 policyHash;
        bytes32 evidenceRoot;
        uint16 safetyScore;
        uint16 passedChecks;
        uint16 totalChecks;
        uint16 criticalFailures;
        uint64 issuedAt;
        uint64 expiresAt;
        address issuer;
        bool revoked;
    }

    error Unauthorized();
    error InvalidSeal();
    error SealNotFound();

    address public owner;
    uint256 public nextSealId = 1;

    mapping(address issuer => bool authorized) public isIssuer;
    mapping(uint256 sealId => Seal seal) public seals;
    mapping(bytes32 lookupKey => uint256 sealId) public latestSealId;
    mapping(bytes32 lookupKey => mapping(address issuer => uint256 sealId)) public latestSealIdByIssuer;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IssuerAuthorizationChanged(address indexed issuer, bool authorized);
    event SealIssued(
        uint256 indexed sealId,
        uint256 indexed agentId,
        bytes32 indexed policyHash,
        bytes32 versionHash,
        bytes32 evidenceRoot,
        uint16 safetyScore,
        uint64 expiresAt,
        address issuer
    );
    event SealRevoked(uint256 indexed sealId, address indexed issuer);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyIssuer() {
        if (!isIssuer[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidSeal();
        owner = initialOwner;
        isIssuer[initialOwner] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit IssuerAuthorizationChanged(initialOwner, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidSeal();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setIssuer(address issuer, bool authorized) external onlyOwner {
        if (issuer == address(0)) revert InvalidSeal();
        isIssuer[issuer] = authorized;
        emit IssuerAuthorizationChanged(issuer, authorized);
    }

    function issueSeal(Seal calldata candidate) external onlyIssuer returns (uint256 sealId) {
        if (
            candidate.agentId == 0 ||
            candidate.versionHash == bytes32(0) ||
            candidate.policyHash == bytes32(0) ||
            candidate.evidenceRoot == bytes32(0) ||
            candidate.safetyScore > 100 ||
            candidate.totalChecks == 0 ||
            candidate.passedChecks != candidate.totalChecks ||
            candidate.criticalFailures != 0 ||
            candidate.expiresAt <= block.timestamp ||
            candidate.issuer != address(0) ||
            candidate.issuedAt != 0 ||
            candidate.revoked
        ) revert InvalidSeal();

        sealId = nextSealId++;
        Seal memory issued = candidate;
        issued.issuedAt = uint64(block.timestamp);
        issued.issuer = msg.sender;
        seals[sealId] = issued;
        bytes32 lookupKey = _lookupKey(candidate.agentId, candidate.versionHash, candidate.policyHash);
        latestSealId[lookupKey] = sealId;
        latestSealIdByIssuer[lookupKey][msg.sender] = sealId;

        emit SealIssued(
            sealId,
            issued.agentId,
            issued.policyHash,
            issued.versionHash,
            issued.evidenceRoot,
            issued.safetyScore,
            issued.expiresAt,
            issued.issuer
        );
    }

    function revokeSeal(uint256 sealId) external {
        Seal storage seal = seals[sealId];
        if (seal.issuedAt == 0) revert SealNotFound();
        if (msg.sender != owner && msg.sender != seal.issuer) revert Unauthorized();
        seal.revoked = true;
        emit SealRevoked(sealId, msg.sender);
    }

    function validateSeal(
        uint256 agentId,
        bytes32 versionHash,
        bytes32 policyHash,
        uint16 minimumScore,
        address trustedIssuer
    ) public view returns (ValidationStatus status, uint256 sealId) {
        bytes32 lookupKey = _lookupKey(agentId, versionHash, policyHash);
        if (trustedIssuer == address(0)) {
            sealId = latestSealId[lookupKey];
        } else {
            sealId = latestSealIdByIssuer[lookupKey][trustedIssuer];
            if (sealId == 0) {
                uint256 latestSeal = latestSealId[lookupKey];
                if (latestSeal != 0) return (ValidationStatus.WrongIssuer, latestSeal);
            }
        }
        if (sealId == 0) return (ValidationStatus.Missing, 0);

        Seal storage seal = seals[sealId];
        if (seal.revoked) return (ValidationStatus.Revoked, sealId);
        if (seal.expiresAt <= block.timestamp) return (ValidationStatus.Expired, sealId);
        if (trustedIssuer != address(0) && seal.issuer != trustedIssuer) {
            return (ValidationStatus.WrongIssuer, sealId);
        }
        if (seal.criticalFailures != 0) {
            return (ValidationStatus.CriticalFailure, sealId);
        }
        if (seal.safetyScore < minimumScore) {
            return (ValidationStatus.ScoreTooLow, sealId);
        }
        return (ValidationStatus.Valid, sealId);
    }

    function isCompliant(
        uint256 agentId,
        bytes32 versionHash,
        bytes32 policyHash,
        uint16 minimumScore,
        address trustedIssuer
    ) external view returns (bool) {
        (ValidationStatus status,) = validateSeal(
            agentId,
            versionHash,
            policyHash,
            minimumScore,
            trustedIssuer
        );
        return status == ValidationStatus.Valid;
    }

    function _lookupKey(
        uint256 agentId,
        bytes32 versionHash,
        bytes32 policyHash
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(agentId, versionHash, policyHash));
    }
}
