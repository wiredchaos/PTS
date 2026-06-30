/**
 * qa_reviewer.js — Validates other agents' outputs.
 * Flags hallucination risk, missing citations, unsupported claims, missing documents.
 */

/**
 * @param {object} context - { env, db, kv, runId }
 * @param {object} input - { agentOutputs: [{ agentName, result }], requiredCitationAgents? }
 */
export async function run(_context, input) {
  const agentOutputs = Array.isArray(input.agentOutputs) ? input.agentOutputs : [];
  const requiredCitationAgents = Array.isArray(input.requiredCitationAgents)
    ? input.requiredCitationAgents
    : ['tax_analyst', 'legal_agent'];

  const flags = [];
  const passed = [];

  for (const { agentName, result } of agentOutputs) {
    if (!result || typeof result !== 'object') {
      flags.push({
        agent: agentName,
        issue: 'missing_output',
        severity: 'critical',
        description: 'Agent returned null or non-object output.',
      });
      continue;
    }

    // Check for missing citations on agents that require them
    if (requiredCitationAgents.includes(agentName)) {
      const citations = Array.isArray(result.citations) ? result.citations : [];
      if (citations.length === 0) {
        flags.push({
          agent: agentName,
          issue: 'missing_citations',
          severity: 'high',
          description: `${agentName} produced conclusions without any citations. Every tax/legal conclusion requires at least one citation.`,
        });
      } else {
        // Validate citation structure
        for (const citation of citations) {
          if (!citation.type || !citation.reference) {
            flags.push({
              agent: agentName,
              issue: 'malformed_citation',
              severity: 'medium',
              description: `Citation missing required fields (type, reference): ${JSON.stringify(citation)}`,
            });
          }
          // Flag suspicious fabrication patterns (e.g., generic placeholders)
          if (
            typeof citation.reference === 'string' &&
            /^(example|placeholder|todo|n\/a|unknown)$/i.test(citation.reference.trim())
          ) {
            flags.push({
              agent: agentName,
              issue: 'hallucination_risk',
              severity: 'high',
              description: `Suspicious citation reference detected: "${citation.reference}". Verify against authoritative source.`,
            });
          }
        }
      }
    }

    // Check for unsupported claims
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const finding of findings) {
      if (finding.supported === false && !finding.requires_human_review) {
        flags.push({
          agent: agentName,
          issue: 'unsupported_claim',
          severity: 'high',
          description: `Finding marked as unsupported but requires_human_review is not set: "${finding.finding}"`,
        });
      }
    }

    // Check for estimates without labeling
    if (result.estimate_only === true) {
      const hasEstimateLabel = findings.some((f) => f.estimate_only === true);
      if (!hasEstimateLabel && findings.length > 0) {
        flags.push({
          agent: agentName,
          issue: 'unlabeled_estimates',
          severity: 'medium',
          description: 'Output is marked estimate_only but individual findings are not labeled as estimates.',
        });
      }
    }

    // Check attorney review flag for legal agent
    if (agentName === 'legal_agent' && result.requires_attorney_review !== true) {
      flags.push({
        agent: agentName,
        issue: 'missing_attorney_review_flag',
        severity: 'critical',
        description: 'legal_agent must always set requires_attorney_review: true for legal conclusions.',
      });
    }

    // Check missing documents
    const missingDocs = Array.isArray(result.missing_documents) ? result.missing_documents : [];
    if (missingDocs.length > 0) {
      flags.push({
        agent: agentName,
        issue: 'missing_documents',
        severity: 'medium',
        description: `Agent reports missing documents: ${missingDocs.join(', ')}`,
      });
    }

    if (!flags.some((f) => f.agent === agentName && f.severity === 'critical')) {
      passed.push(agentName);
    }
  }

  const criticalCount = flags.filter((f) => f.severity === 'critical').length;
  const highCount = flags.filter((f) => f.severity === 'high').length;

  return {
    passed,
    flags,
    summary: {
      total_agents_reviewed: agentOutputs.length,
      passed_count: passed.length,
      flag_count: flags.length,
      critical_flags: criticalCount,
      high_flags: highCount,
    },
    requires_human_review: criticalCount > 0 || highCount > 0,
    qa_status: criticalCount > 0 ? 'fail' : highCount > 0 ? 'warn' : 'pass',
  };
}
