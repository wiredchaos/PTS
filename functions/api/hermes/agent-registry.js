/**
 * GET /api/hermes/agent-registry
 * Lists all registered Hermes agents and their descriptions.
 */
import { jsonResponse } from '../../_lib/http.js';

const AGENTS = [
  {
    name: 'intake_classifier',
    description: 'Rules-based MIME/extension classification; no LLM required for known types; SLM fallback hint for unknowns.',
    llm_required: false,
    always_runs: false,
    conditions: 'taskType in [classify, upload, document, extract, analysis, full]',
  },
  {
    name: 'document_extractor',
    description: 'Extracts structured fields from documents; checks agent_memory first; sets requires_human_review if confidence < 0.7.',
    llm_required: false,
    always_runs: false,
    conditions: 'taskType in [extract, document, analysis, full]',
  },
  {
    name: 'tax_analyst',
    description: 'Workpaper-ready analysis; every conclusion includes at least one citation (IRC, Treasury Reg, IRS Pub, Revenue Ruling, etc.).',
    llm_required: false,
    always_runs: false,
    conditions: 'taskType in [analysis, tax, full]',
  },
  {
    name: 'resolution_agent',
    description: 'IRS/FTB resolution analysis. ONLY runs when client.case_type === "resolution". Returns credentialed_only if connector not configured.',
    llm_required: false,
    always_runs: false,
    conditions: 'taskType in [resolution, full] AND client.case_type === "resolution"',
  },
  {
    name: 'legal_agent',
    description: 'Entity/trust/POA/contract support. ALWAYS sets requires_attorney_review: true. Informational only.',
    llm_required: false,
    always_runs: false,
    conditions: 'taskType in [legal, entity, trust, poa, contract, full]',
  },
  {
    name: 'qa_reviewer',
    description: 'Validates other agents\' outputs. Flags hallucination risk, missing citations, unsupported claims.',
    llm_required: false,
    always_runs: false,
    conditions: 'Runs after tax_analyst, legal_agent, or document_extractor',
  },
  {
    name: 'gamma_agent',
    description: 'Generates Gamma presentation prompt/output. ONLY runs when hermesOptions.requestGamma === true.',
    llm_required: false,
    always_runs: false,
    conditions: 'hermesOptions.requestGamma === true',
  },
];

export async function onRequestGet(_context) {
  return jsonResponse(200, {
    ok: true,
    agent_count: AGENTS.length,
    agents: AGENTS,
  });
}
