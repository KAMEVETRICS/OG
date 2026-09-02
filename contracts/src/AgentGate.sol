// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentSealRegistry {
    function isCompliant(
        uint256 agentId,
        bytes32 versionHash,
        bytes32 policyHash,
        uint16 minimumScore,
        address trustedIssuer
    ) external view returns (bool);
}

/// @title AgentGate
/// @notice Example integration that admits only current, policy-compliant agents.
contract AgentGate {
    IAgentSealRegistry public immutable registry;
    bytes32 public immutable policyHash;
    uint16 public immutable minimumScore;
    address public immutable trustedIssuer;

    error AgentNotCompliant();

    constructor(
        IAgentSealRegistry registry_,
        bytes32 policyHash_,
        uint16 minimumScore_,
        address trustedIssuer_
    ) {
        registry = registry_;
        policyHash = policyHash_;
        minimumScore = minimumScore_;
        trustedIssuer = trustedIssuer_;
    }

    function canExecute(uint256 agentId, bytes32 versionHash) public view returns (bool) {
        return registry.isCompliant(
            agentId,
            versionHash,
            policyHash,
            minimumScore,
            trustedIssuer
        );
    }

    function requireCompliant(uint256 agentId, bytes32 versionHash) external view {
        if (!canExecute(agentId, versionHash)) revert AgentNotCompliant();
    }
}

