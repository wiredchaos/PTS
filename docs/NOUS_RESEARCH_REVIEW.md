# NousResearch Review — Hermes Model Series, MoA, and Inference Routing

## Scope

This document is a **research review only**. It documents publicly available work from NousResearch on GitHub, identifies patterns considered for PTS Hermes Core v1, notes what was adopted vs. rejected, and covers licensing. No NousResearch code was copied into this repository.

---

## Repositories Reviewed

The following NousResearch public GitHub repositories were reviewed for relevant patterns:

| Repository | Description | Relevance to PTS |
|---|---|---|
| [NousResearch/Hermes-3-Llama-3.1-8B](https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B) | Hermes 3 model series fine-tuned on Llama 3.1 | Model fine-tuning approach, tool-calling format |
| [NousResearch/Hermes-Function-Calling](https://github.com/NousResearch/Hermes-Function-Calling) | Function calling templates and structured output | Tool-call prompt format, structured JSON output |
| [NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO](https://huggingface.co/NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO) | DPO-aligned Hermes 2 on MoE model | Alignment techniques for instruction following |

> **Note**: NousResearch does not maintain a public "MoA orchestration framework" repository as of this review. The MoA architectural pattern referenced here draws on the general concept published in research (Wang et al., 2024, "Mixture-of-Agents Enhances Large Language Model Capabilities") rather than NousResearch-specific code.

---

## Patterns Reviewed

### 1. Hermes Model Series — Tool Calling Format

**What was reviewed**: NousResearch Hermes models use a structured `<tool_call>` and `<tool_response>` XML-like format for function calling, built on top of chatml (`<|im_start|>` / `<|im_end|>`).

**Pattern**:
```
<|im_start|>system
You are a function calling AI model. You are provided with function signatures...
<|im_end|>
<|im_start|>user
...
<|im_end|>
<|im_start|>assistant
<tool_call>
{"name": "get_current_weather", "arguments": {"location": "New York"}}
</tool_call>
<|im_end|>
```

**Adopted for PTS**: The concept of structured JSON outputs from agents (each agent returns a typed object) is consistent with this pattern. PTS agents return well-typed JavaScript objects rather than free-form text.

**Rejected**: The specific chatml prompt format was not adopted because PTS Hermes Core v1 does not rely on a single LLM model — agents are primarily rules-based or use optional external LLM providers via env-configured keys. The chatml format is model-specific.

**Licensing**: Hermes model weights are released under `apache-2.0` license (model weights). The prompt format itself is a technique, not a copyrightable artifact.

---

### 2. Structured Output / JSON Schema Enforcement

**What was reviewed**: NousResearch Hermes-Function-Calling examples demonstrate constrained decoding and JSON schema validation for LLM outputs to prevent hallucination.

**Pattern**: Define a JSON schema for expected agent output; validate the model's response against the schema before passing downstream.

**Adopted for PTS**: 
- Each PTS agent returns a typed object with known fields (`classification`, `citations`, `requires_human_review`, etc.).
- `qa_reviewer` validates agent outputs for required fields (citations, attorney review flag, etc.) — this is the PTS equivalent of schema enforcement without requiring a live LLM.

**Rejected**: Runtime JSON schema validation libraries were not added as a dependency; the `qa_reviewer` agent implements equivalent checks with explicit field-level assertions.

---

### 3. Mixture-of-Agents (MoA) Pattern

**What was reviewed**: The general MoA concept (Wang et al., 2024) proposes running multiple LLM instances in parallel and using an aggregator to synthesize their outputs. NousResearch has implemented MoA-style multi-agent inference in some of their model serving infrastructure.

**Pattern**:
- Layer 1: Multiple specialized agents process input independently.
- Layer 2: Aggregator synthesizes outputs into a final response.

**Adopted for PTS**:
- PTS implements a **sequential MoA** variant where agents are domain-specialized (not model-replicated).
- `qa_reviewer` serves as the aggregator/quality gate.
- Sequential ordering (classify → extract → analyze → QA) reduces unnecessary computation.

**Rejected**: Parallel agent execution was not adopted because:
1. Cloudflare Pages Functions do not natively support parallel async fan-out without a Durable Object or Queue.
2. Domain agents in PTS are not interchangeable — they are purpose-built and ordered by dependency (classification must precede extraction).

---

### 4. SLM (Small Language Model) Inference Routing

**What was reviewed**: NousResearch and the broader research community have explored routing simple tasks to smaller, cheaper models (SLMs) and complex tasks to larger models (LLMs).

**Pattern**: Classify query complexity → route to SLM if simple, LLM if complex.

**Adopted for PTS**:
- `intake_classifier` explicitly skips LLM for known MIME types (rules-first).
- When a file type is unknown, the agent returns `slm_hint: 'unknown file type — consider SLM classification'` as a signal for future routing improvement.
- The `llm_used` field in agent responses tracks whether any model was invoked.

**Rejected**: Actual SLM integration (e.g., Cloudflare Workers AI inference) was not added in v1. The hint mechanism is a forward-looking extension point.

---

## Licensing Summary

| Source | License | Code Used in PTS |
|---|---|---|
| NousResearch/Hermes model weights | Apache 2.0 | No — weights not incorporated |
| NousResearch/Hermes-Function-Calling repo | MIT (per repo) | No — patterns only, no code copy |
| MoA paper (Wang et al., 2024) | Academic / arXiv | No — architectural concept only |

**Verification**: All pattern adoptions were implemented from scratch in PTS. No code was copied from external repositories. The PTS implementation is original work inspired by publicly documented techniques.

---

## PTS Implementation Notes

### What Hermes Core v1 took from this research:

1. **Named after Hermes**: The orchestrator is named "Hermes" as a nod to the NousResearch Hermes model series, which pioneered structured tool-calling and multi-agent coordination patterns.
2. **Citation enforcement**: The concept of grounding every output in verifiable references mirrors NousResearch's work on reducing hallucination via structured outputs and tool verification.
3. **Agent specialization**: Domain-specialized agents (tax, legal, resolution) rather than a single general-purpose LLM aligns with the NousResearch philosophy of fine-tuned, task-specific models.
4. **Graceful LLM degradation**: When no LLM key is configured, agents fall back to rules-based logic — consistent with the principle of not requiring a large model for deterministic tasks.

### What was explicitly not adopted:

- No NousResearch model code was included.
- No chatml prompt format was hardcoded (LLM provider is optional and pluggable via env).
- No external inference API dependencies were added.

---

## References

- NousResearch GitHub: https://github.com/NousResearch
- Hermes Function Calling: https://github.com/NousResearch/Hermes-Function-Calling
- Wang, J. et al. (2024). "Mixture-of-Agents Enhances Large Language Model Capabilities." arXiv:2406.04692.
- Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/ (future integration point)

---

*This document is a research review only. It does not constitute an endorsement of or affiliation with NousResearch.*
