# {{evidence_subject}}

Draft scaffold. Use templates/README.md and schemas/workflow.schema.json.

## Assessment

{{actual_subject_revision_scope_and_result}}
{{source_evidence_and_observed_limits}}

## Workflow context

```json
{{validated_evidence_context_json}}
```

## Findings and provenance

{{unresolved_findings_or_explicit_none}}
{{actual_producer_reviewer_session_model_depth_when_applicable}}
{{actual_destination_policy_context_and_unavailable_inputs}}

Preflight the complete body with assuredloop validate --kind evidence.
New review result is exactly pass, fail, revise or incomplete; explanation stays
in prose. Ordinary execution results may be descriptive. Do not infer current
passing credit from historical text, fabricate tuple fields or invent observations.
Keep prior assessment/disposition links with the findings. Model and depth
declarations apply only when supplied or required by the consumer's policy.
