"""Tests for AgentRuntime with real LLM provider integration via mock HTTP."""

from __future__ import annotations

import json
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.models.model_provider import WorkspaceModelProviderConfigRecord
from app.models.skill import SkillRecord, SkillReferenceRecord
from app.models.workflow import Workflow
from app.services.credential_store import CredentialStore
from app.services.llm_provider import LLMProviderService
from app.services.plugin_runtime import (
    PluginCallProxy,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.runtime import RuntimeService

_TEST_CREDENTIAL_KEY = Fernet.generate_key().decode("utf-8")


class _FakeCredentialSettings:
    credential_encryption_key = _TEST_CREDENTIAL_KEY


def _patch_credential_settings():
    return patch(
        "app.services.credential_encryption.get_settings",
        return_value=_FakeCredentialSettings(),
    )


def _openai_response(content: str, model: str = "gpt-4o") -> dict:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }


def _anthropic_response(content: str, model: str = "claude-3-7-sonnet-latest") -> dict:
    return {
        "id": "msg-test",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": content}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 12, "output_tokens": 8},
    }


def _openai_responses_response(content: str, model: str = "gpt-4.1") -> dict:
    return {
        "id": "resp-test",
        "object": "response",
        "model": model,
        "status": "completed",
        "output": [
            {
                "id": "msg-test",
                "content": [{"type": "output_text", "text": content}],
            }
        ],
        "output_text": content,
        "usage": {"input_tokens": 12, "output_tokens": 8, "total_tokens": 20},
    }


def _response_to_sse(resp_json: dict) -> str:
    """Convert a sync OpenAI response to SSE format for streaming mock."""
    if resp_json.get("object") == "response":
        content = str(resp_json.get("output_text") or "")
        model = resp_json.get("model") or "gpt-4o"
        usage = resp_json.get("usage") if isinstance(resp_json.get("usage"), dict) else {}
        response_id = resp_json.get("id") or "resp-stream"
        created_event = {
            "type": "response.created",
            "response": {"id": response_id, "model": model},
        }
        lines: list[str] = [
            f"data: {json.dumps(created_event)}"
        ]
        if content:
            lines.append(
                f'data: {json.dumps({"type": "response.output_text.delta", "delta": content})}'
            )
        completed_event = {
            "type": "response.completed",
            "response": {"id": response_id, "model": model, "usage": usage},
        }
        lines.append(
            f"data: {json.dumps(completed_event)}"
        )
        lines.append("data: [DONE]")
        return "\n".join(lines) + "\n"

    choice = (resp_json.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content") or ""
    model = resp_json.get("model") or "gpt-4o"
    lines: list[str] = []
    if content:
        chunk_data = {
            "id": "chatcmpl-stream",
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
        }
        lines.append(f"data: {json.dumps(chunk_data)}")
    final_data = {
        "id": "chatcmpl-stream",
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    lines.append(f"data: {json.dumps(final_data)}")
    lines.append("data: [DONE]")
    return "\n".join(lines) + "\n"


def _make_llm_provider(responses: list[dict]) -> LLMProviderService:
    """Create an LLMProviderService that returns pre-defined responses in order.

    Automatically converts sync responses to SSE format when the request
    has stream=true, so that streaming-first finalize works correctly.
    """
    call_index = {"i": 0}
    captured_requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        idx = call_index["i"]
        call_index["i"] += 1
        body = json.loads(request.content)
        captured_requests.append({
            "url": str(request.url),
            "headers": dict(request.headers),
            "body": body,
        })
        resp_json = responses[idx] if idx < len(responses) else _openai_response("fallback")
        if body.get("stream"):
            sse_text = _response_to_sse(resp_json)
            return httpx.Response(
                200,
                content=sse_text.encode(),
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(200, json=resp_json)

    provider = LLMProviderService(
        client_factory=lambda: httpx.Client(
            transport=httpx.MockTransport(handler),
        ),
    )
    provider._captured_requests = captured_requests  # type: ignore[attr-defined]
    return provider


def _create_runtime_with_llm(
    llm_responses: list[dict],
    registry: PluginRegistry | None = None,
) -> RuntimeService:
    """Create a RuntimeService with injected LLM provider."""
    if registry is None:
        registry = PluginRegistry()
    proxy = PluginCallProxy(registry)
    runtime = RuntimeService(plugin_call_proxy=proxy)
    llm_provider = _make_llm_provider(llm_responses)
    runtime._llm_provider = llm_provider
    runtime._agent_runtime._llm_provider = llm_provider
    return runtime


# ---------------------------------------------------------------------------
# Test: finalize output via LLM (no mock config, valid model config)
# ---------------------------------------------------------------------------

def test_finalize_via_llm_when_no_mock(sqlite_session: Session) -> None:
    """When model config has valid apiKey/modelId and no mockFinalOutput,
    the finalize phase should call the LLM and produce real output."""
    runtime = _create_runtime_with_llm([
        # Plan call response
        _openai_response("I will analyze the topic."),
        # Finalize call response
        _openai_response("The answer to everything is 42."),
    ])

    workflow = Workflow(
        id="wf-llm-finalize",
        name="LLM Finalize Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "What is the answer to everything?",
                        "systemPrompt": "You are a helpful assistant.",
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": False},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "test"})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.phase == "emit_output"
    output = agent_run.output_payload
    assert output["result"] == "The answer to everything is 42."
    assert output["decision_basis"] == "llm"
    assert output["model"] == "gpt-4o"
    assert [r.role for r in artifacts.ai_calls] == ["main_plan", "main_finalize"]

    # Verify the finalize AI call record captured real metrics
    finalize_call = next(r for r in artifacts.ai_calls if r.role == "main_finalize")
    assert finalize_call.model_id == "gpt-4o"
    # Streaming mode records latency but not per-token usage
    assert (
        finalize_call.token_usage.get("latency_ms") is not None
        or finalize_call.token_usage == {}
    )


# ---------------------------------------------------------------------------
# Test: mock config still takes priority over LLM
# ---------------------------------------------------------------------------

def test_mock_config_takes_priority_over_llm(sqlite_session: Session) -> None:
    """When mockFinalOutput is present, LLM should NOT be called for finalize."""
    runtime = _create_runtime_with_llm([
        # Plan call response (will be called since no mockPlan)
        _openai_response("Planning..."),
    ])

    workflow = Workflow(
        id="wf-mock-priority",
        name="Mock Priority Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Hello",
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": False},
                        "mockFinalOutput": {"result": "mock-output"},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.output_payload["result"] == "mock-output"


# ---------------------------------------------------------------------------
# Test: no model config falls back to synthetic output
# ---------------------------------------------------------------------------

def test_no_model_config_falls_back_gracefully(sqlite_session: Session) -> None:
    """When no model config (no apiKey/modelId), fall back to legacy behavior."""
    runtime = _create_runtime_with_llm([])

    workflow = Workflow(
        id="wf-no-model",
        name="No Model Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Say hello",
                        "assistant": {"enabled": False},
                        "mock_output": {"answer": "fallback"},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.output_payload == {"answer": "fallback"}


def test_llm_agent_injects_bound_skill_docs_into_llm_context(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm([
        _openai_response("Plan with the bound skill."),
        _openai_response("Produced a skill-aware answer."),
    ])

    sqlite_session.add(
        SkillRecord(
            id="skill-research-brief",
            workspace_id="default",
            name="Research Brief",
            description="Produce a concise, auditable brief.",
            body="Summarize findings, cite evidence, and end with open questions.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-handoff",
            skill_id="skill-research-brief",
            name="Operator Handoff",
            description="Close with next actions.",
            body="Always include what the operator should verify next.",
        )
    )

    workflow = Workflow(
        id="wf-agent-skill-bound",
        name="Agent Skill Bound Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Draft a response using the bound skill.",
                        "skillIds": ["skill-research-brief"],
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "skill test"})

    assert artifacts.run.status == "succeeded"
    assert any(record.role == "main_plan" for record in artifacts.ai_calls)

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert captured_requests
    message_contents = [
        message.get("content", "")
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    ]
    combined_content = "\n".join(str(content) for content in message_contents)
    assert "[Skills]" in combined_content
    assert "Research Brief" in combined_content
    assert "Operator Handoff" in combined_content
    assert "skills.get_reference" in combined_content
    assert (
        "/api/skills/skill-research-brief/references/ref-handoff?workspace_id=default"
        in combined_content
    )


def test_llm_agent_resolves_workspace_provider_config_ref(sqlite_session: Session) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_response("Plan with provider config."),
            _openai_response("Final answer with provider config."),
        ]
    )

    with _patch_credential_settings():
        credential = CredentialStore().create(
            sqlite_session,
            name="OpenAI Team Credential",
            credential_type="openai_api_key",
            data={"apiKey": "sk-provider-config-key"},
        )
        sqlite_session.add(
            WorkspaceModelProviderConfigRecord(
                id="provider-openai-team",
                workspace_id="default",
                provider_id="openai",
                label="OpenAI Team",
                description="",
                credential_id=credential.id,
                base_url="https://proxy.openai.local/v1",
                default_model="gpt-4.1",
                protocol="chat_completions",
                status="active",
                supported_model_types=["llm"],
            )
        )
        workflow = Workflow(
            id="wf-agent-provider-config-ref",
            name="Agent Provider Config Ref",
            version="0.1.0",
            status="draft",
            definition={
                "nodes": [
                    {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                    {
                        "id": "agent",
                        "type": "llmAgentNode",
                        "name": "Agent",
                        "config": {
                            "prompt": "Say hello.",
                            "model": {
                                "providerConfigRef": "provider-openai-team",
                                "provider": "anthropic",
                                "modelId": "gpt-4.1-mini",
                                "apiKey": "sk-inline-should-not-win",
                                "baseUrl": "https://inline-should-not-win.example",
                            },
                        },
                    },
                    {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                    {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
                ],
            },
        )
        sqlite_session.add(workflow)
        sqlite_session.commit()

        artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "provider ref"})

    assert artifacts.run.status == "succeeded"
    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert captured_requests
    assert captured_requests[0]["url"] == "https://proxy.openai.local/v1/chat/completions"
    assert captured_requests[0]["headers"]["authorization"] == "Bearer sk-provider-config-key"
    assert captured_requests[0]["body"]["model"] == "gpt-4.1-mini"


def test_llm_agent_resolves_workspace_provider_config_protocol_for_openai_responses(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_responses_response("Plan with provider config."),
            _openai_responses_response("Final answer with provider config."),
        ]
    )

    with _patch_credential_settings():
        credential = CredentialStore().create(
            sqlite_session,
            name="OpenAI Team Credential",
            credential_type="openai_api_key",
            data={"apiKey": "sk-provider-config-key"},
        )
        sqlite_session.add(
            WorkspaceModelProviderConfigRecord(
                id="provider-openai-responses-team",
                workspace_id="default",
                provider_id="openai",
                label="OpenAI Responses Team",
                description="",
                credential_id=credential.id,
                base_url="https://proxy.openai.local/v1",
                default_model="gpt-4.1",
                protocol="responses",
                status="active",
                supported_model_types=["llm"],
            )
        )
        workflow = Workflow(
            id="wf-agent-provider-config-responses",
            name="Agent Provider Config Responses",
            version="0.1.0",
            status="draft",
            definition={
                "nodes": [
                    {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                    {
                        "id": "agent",
                        "type": "llmAgentNode",
                        "name": "Agent",
                        "config": {
                            "prompt": "Say hello.",
                            "model": {
                                "providerConfigRef": "provider-openai-responses-team",
                                "modelId": "gpt-4.1-mini",
                            },
                        },
                    },
                    {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                    {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
                ],
            },
        )
        sqlite_session.add(workflow)
        sqlite_session.commit()

        artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "provider ref"})

    assert artifacts.run.status == "succeeded"
    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert captured_requests
    assert captured_requests[0]["url"] == "https://proxy.openai.local/v1/responses"
    assert captured_requests[0]["headers"]["authorization"] == "Bearer sk-provider-config-key"
    assert captured_requests[0]["body"]["model"] == "gpt-4.1-mini"
    assert captured_requests[0]["body"]["input"][0]["content"][0]["type"] == "input_text"


def test_reference_node_reads_authorized_upstream_json(sqlite_session: Session) -> None:
    runtime = RuntimeService(plugin_call_proxy=PluginCallProxy(PluginRegistry()))
    workflow = Workflow(
        id="wf-reference-node-json",
        name="Reference Node Json",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "source",
                    "type": "toolNode",
                    "name": "Source",
                    "config": {"mock_output": {"answer": "from-source"}},
                },
                {
                    "id": "referenceNode",
                    "type": "referenceNode",
                    "name": "referenceNode",
                    "config": {
                        "contextAccess": {"readableNodeIds": ["source"]},
                        "reference": {"sourceNodeId": "source", "artifactType": "json"},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "source"},
                {"id": "e2", "sourceNodeId": "source", "targetNodeId": "referenceNode"},
                {"id": "e3", "sourceNodeId": "referenceNode", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "reference"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "referenceNode": {
            "reference": {
                "sourceNodeId": "source",
                "artifactType": "json",
                "content": {"answer": "from-source"},
            }
        }
    }


def test_llm_agent_skill_binding_limits_injection_to_selected_phase(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_response("Plan with bound skill context."),
            _openai_response("Final answer without extra skill context."),
        ]
    )

    sqlite_session.add(
        SkillRecord(
            id="skill-research-brief",
            workspace_id="default",
            name="Research Brief",
            description="Produce a concise, auditable brief.",
            body="Summarize findings, cite evidence, and end with open questions.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-handoff",
            skill_id="skill-research-brief",
            name="Operator Handoff",
            description="Close with next actions.",
            body="Always include what the operator should verify next.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-budget",
            skill_id="skill-research-brief",
            name="Budget Control",
            description="Reference that should stay summary-only.",
            body="This body should stay out of prompt injection unless explicitly selected.",
        )
    )

    workflow = Workflow(
        id="wf-agent-skill-phase-bound",
        name="Agent Skill Phase Bound Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Draft a response using the bound skill.",
                        "skillIds": ["skill-research-brief"],
                        "skillBinding": {
                            "enabledPhases": ["main_plan"],
                            "promptBudgetChars": 256,
                            "references": [
                                {
                                    "skillId": "skill-research-brief",
                                    "referenceId": "ref-handoff",
                                    "phases": ["main_plan"],
                                }
                            ],
                        },
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "skill phase test"})

    assert artifacts.run.status == "succeeded"

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert len(captured_requests) == 2

    plan_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    )
    finalize_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[1]["body"]["messages"]
        if isinstance(message, dict)
    )

    assert "[Skills]" in plan_content
    assert "Research Brief" in plan_content
    assert "Operator Handoff" in plan_content
    assert "Always include what the operator should verify next." in plan_content
    assert "skills.get_reference" in plan_content
    assert (
        "/api/skills/skill-research-brief/references/ref-budget?workspace_id=default"
        in plan_content
    )
    assert "This body should stay out of prompt injection" not in plan_content
    assert "[Skills]" not in finalize_content

    loaded_events = [
        event for event in artifacts.events if event.event_type == "agent.skill.references.loaded"
    ]
    assert len(loaded_events) == 1
    assert loaded_events[0].payload == {
        "node_id": "agent",
        "phase": "main_plan",
        "references": [
            {
                "skill_id": "skill-research-brief",
                "skill_name": "Research Brief",
                "reference_id": "ref-handoff",
                "reference_name": "Operator Handoff",
                "load_source": "skill_binding",
                "retrieval_http_path": (
                    "/api/skills/skill-research-brief/references/ref-handoff"
                    "?workspace_id=default"
                ),
                "retrieval_mcp_method": "skills.get_reference",
                "retrieval_mcp_params": {
                    "skill_id": "skill-research-brief",
                    "reference_id": "ref-handoff",
                    "workspace_id": "default",
                },
            }
        ],
    }


def test_llm_agent_lazy_fetches_matching_skill_reference_body_at_runtime(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_response("Plan with runtime-fetched skill reference."),
            _openai_response("Final answer with budget guardrails."),
        ]
    )

    sqlite_session.add(
        SkillRecord(
            id="skill-research-brief",
            workspace_id="default",
            name="Research Brief",
            description="Produce a concise, auditable brief.",
            body="Summarize findings, cite evidence, and end with open questions.",
        )
    )
    sqlite_session.add_all(
        [
            SkillReferenceRecord(
                id="ref-handoff",
                skill_id="skill-research-brief",
                name="Operator Handoff",
                description="Close with next actions.",
                body="Always include what the operator should verify next.",
            ),
            SkillReferenceRecord(
                id="ref-budget",
                skill_id="skill-research-brief",
                name="Budget Control",
                description="Budget guardrails and cost limits.",
                body="State the budget ceiling and warn before overspending.",
            ),
        ]
    )

    workflow = Workflow(
        id="wf-agent-skill-runtime-fetch",
        name="Agent Skill Runtime Fetch Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "goal": "Keep the answer inside the available budget guardrails.",
                        "prompt": (
                            "Draft a response using the bound skill and mention "
                            "budget guardrails."
                        ),
                        "skillIds": ["skill-research-brief"],
                        "skillBinding": {
                            "enabledPhases": ["main_plan"],
                            "promptBudgetChars": 512,
                            "references": [],
                        },
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "budget review"})

    assert artifacts.run.status == "succeeded"
    assert "agent.skill.references.loaded" in [event.event_type for event in artifacts.events]

    loaded_event = next(
        event for event in artifacts.events if event.event_type == "agent.skill.references.loaded"
    )
    assert loaded_event.payload == {
        "node_id": "agent",
        "phase": "main_plan",
        "references": [
            {
                "skill_id": "skill-research-brief",
                "skill_name": "Research Brief",
                "reference_id": "ref-budget",
                "reference_name": "Budget Control",
                "load_source": "retrieval_query_match",
                "fetch_reason": "Matched query terms: budget, guardrails",
                "retrieval_http_path": (
                    "/api/skills/skill-research-brief/references/ref-budget"
                    "?workspace_id=default"
                ),
                "retrieval_mcp_method": "skills.get_reference",
                "retrieval_mcp_params": {
                    "skill_id": "skill-research-brief",
                    "reference_id": "ref-budget",
                    "workspace_id": "default",
                },
            }
        ],
    }

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert captured_requests
    combined_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    )
    assert "State the budget ceiling and warn before overspending." in combined_content
    assert "Always include what the operator should verify next." not in combined_content


def test_llm_agent_can_explicitly_request_skill_reference_before_planning(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_response(
                "SKILL_REFERENCE_REQUEST "
                '{"skill_id":"skill-operator-brief","reference_id":"ref-canonical-signoff",'
                '"reason":"Need the exact sign-off clause before planning."}'
            ),
            _openai_response("Plan after the explicit skill reference request."),
            _openai_response("Final answer with the approved sign-off."),
        ]
    )

    sqlite_session.add(
        SkillRecord(
            id="skill-operator-brief",
            workspace_id="default",
            name="Operator Brief",
            description="Draft concise operator-facing replies.",
            body="Keep the answer concise and operational.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-canonical-signoff",
            skill_id="skill-operator-brief",
            name="Meridian Appendix",
            description="M47 phrase bank.",
            body="Always close with: Escalate to finance before any extra spend.",
        )
    )

    workflow = Workflow(
        id="wf-agent-skill-explicit-request",
        name="Agent Skill Explicit Request Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "goal": "Draft a concise operator response.",
                        "prompt": "Draft a concise reply.",
                        "skillIds": ["skill-operator-brief"],
                        "skillBinding": {
                            "enabledPhases": ["main_plan"],
                            "promptBudgetChars": 512,
                            "references": [],
                        },
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "ops reply"})

    assert artifacts.run.status == "succeeded"

    requested_event = next(
        event
        for event in artifacts.events
        if event.event_type == "agent.skill.references.requested"
    )
    assert requested_event.payload == {
        "node_id": "agent",
        "phase": "main_plan",
        "skill_id": "skill-operator-brief",
        "reference_id": "ref-canonical-signoff",
        "status": "loaded",
        "request_index": 1,
        "request_total": 1,
        "reason": "Need the exact sign-off clause before planning.",
        "retrieval_http_path": (
            "/api/skills/skill-operator-brief/references/ref-canonical-signoff"
            "?workspace_id=default"
        ),
        "retrieval_mcp_method": "skills.get_reference",
        "retrieval_mcp_params": {
            "skill_id": "skill-operator-brief",
            "reference_id": "ref-canonical-signoff",
            "workspace_id": "default",
        },
    }

    loaded_events = [
        event for event in artifacts.events if event.event_type == "agent.skill.references.loaded"
    ]
    assert loaded_events[-1].payload == {
        "node_id": "agent",
        "phase": "main_plan",
        "references": [
            {
                "skill_id": "skill-operator-brief",
                "skill_name": "Operator Brief",
                "reference_id": "ref-canonical-signoff",
                "reference_name": "Meridian Appendix",
                "load_source": "llm_explicit_request",
                "fetch_reason": "Need the exact sign-off clause before planning.",
                "fetch_request_index": 1,
                "fetch_request_total": 1,
                "retrieval_http_path": (
                    "/api/skills/skill-operator-brief/references/ref-canonical-signoff"
                    "?workspace_id=default"
                ),
                "retrieval_mcp_method": "skills.get_reference",
                "retrieval_mcp_params": {
                    "skill_id": "skill-operator-brief",
                    "reference_id": "ref-canonical-signoff",
                    "workspace_id": "default",
                },
            }
        ],
    }

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert len(captured_requests) == 3

    first_plan_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    )
    second_plan_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[1]["body"]["messages"]
        if isinstance(message, dict)
    )
    assert "M47 phrase bank." in first_plan_content
    assert "Escalate to finance before any extra spend." not in first_plan_content
    assert "Escalate to finance before any extra spend." in second_plan_content



def test_llm_agent_assistant_phase_can_explicitly_request_skill_reference(
    sqlite_session: Session,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "search results ready",
            "structured": {"documents": ["doc1"]},
            "meta": {"tool_name": "Native Search"},
        },
    )
    runtime = _create_runtime_with_llm(
        [
            _openai_response(
                'SKILL_REFERENCE_REQUEST {"skill_id":"skill-operator-brief",'
                '"reference_id":"ref-review-checklist",'
                '"reason":"Need the exact operator checklist before distilling evidence."}'
            ),
            _openai_response(
                json.dumps(
                    {
                        "summary": "Evidence distilled with exact checklist.",
                        "key_points": ["Operator checklist captured"],
                        "conflicts": [],
                        "unknowns": [],
                        "confidence": 0.91,
                    }
                )
            ),
            _openai_response("Final answer based on distilled evidence."),
        ],
        registry=registry,
    )

    sqlite_session.add(
        SkillRecord(
            id="skill-operator-brief",
            workspace_id="default",
            name="Operator Brief",
            description="Draft concise operator-facing replies.",
            body="Keep the answer concise and operational.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-review-checklist",
            skill_id="skill-operator-brief",
            name="Review Checklist",
            description="M47 appendix.",
            body="Verify checklist owners before shipping.",
        )
    )

    workflow = Workflow(
        id="wf-agent-skill-assistant-request",
        name="Agent Skill Assistant Request Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "goal": "Summarize findings for the operator.",
                        "prompt": "Analyze search results",
                        "skillIds": ["skill-operator-brief"],
                        "skillBinding": {
                            "enabledPhases": ["assistant_distill"],
                            "promptBudgetChars": 512,
                            "references": [],
                        },
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": True, "trigger": "always"},
                        "mockPlan": {
                            "toolCalls": [
                                {"toolId": "native.search", "inputs": {"query": "test"}}
                            ],
                            "needAssistant": True,
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "ops reply"})

    assert artifacts.run.status == "succeeded"

    requested_event = next(
        event
        for event in artifacts.events
        if event.event_type == "agent.skill.references.requested"
    )
    assert requested_event.payload == {
        "node_id": "agent",
        "phase": "assistant_distill",
        "skill_id": "skill-operator-brief",
        "reference_id": "ref-review-checklist",
        "status": "loaded",
        "request_index": 1,
        "request_total": 1,
        "reason": "Need the exact operator checklist before distilling evidence.",
        "retrieval_http_path": (
            "/api/skills/skill-operator-brief/references/ref-review-checklist"
            "?workspace_id=default"
        ),
        "retrieval_mcp_method": "skills.get_reference",
        "retrieval_mcp_params": {
            "skill_id": "skill-operator-brief",
            "reference_id": "ref-review-checklist",
            "workspace_id": "default",
        },
    }

    loaded_events = [
        event for event in artifacts.events if event.event_type == "agent.skill.references.loaded"
    ]
    assert loaded_events[-1].payload == {
        "node_id": "agent",
        "phase": "assistant_distill",
        "references": [
            {
                "skill_id": "skill-operator-brief",
                "skill_name": "Operator Brief",
                "reference_id": "ref-review-checklist",
                "reference_name": "Review Checklist",
                "load_source": "llm_explicit_request",
                "fetch_reason": "Need the exact operator checklist before distilling evidence.",
                "fetch_request_index": 1,
                "fetch_request_total": 1,
                "retrieval_http_path": (
                    "/api/skills/skill-operator-brief/references/ref-review-checklist"
                    "?workspace_id=default"
                ),
                "retrieval_mcp_method": "skills.get_reference",
                "retrieval_mcp_params": {
                    "skill_id": "skill-operator-brief",
                    "reference_id": "ref-review-checklist",
                    "workspace_id": "default",
                },
            }
        ],
    }

    roles = [record.role for record in artifacts.ai_calls]
    assert "assistant_distill_skill_reference_request" in roles
    assert "assistant_distill" in roles
    assert "main_finalize" in roles

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert len(captured_requests) == 3

    request_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    )
    distill_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[1]["body"]["messages"]
        if isinstance(message, dict)
    )
    assert "Verify checklist owners before shipping." not in request_content
    assert "Verify checklist owners before shipping." in distill_content



def test_llm_agent_finalize_phase_can_explicitly_request_skill_reference(
    sqlite_session: Session,
) -> None:
    runtime = _create_runtime_with_llm(
        [
            _openai_response(
                'SKILL_REFERENCE_REQUEST {"skill_id":"skill-operator-brief",'
                '"reference_id":"ref-canonical-signoff",'
                '"reason":"Need the exact sign-off clause before finalizing."}'
            ),
            _openai_response("Escalate to finance before any extra spend."),
        ]
    )

    sqlite_session.add(
        SkillRecord(
            id="skill-operator-brief",
            workspace_id="default",
            name="Operator Brief",
            description="Draft concise operator-facing replies.",
            body="Keep the answer concise and operational.",
        )
    )
    sqlite_session.add(
        SkillReferenceRecord(
            id="ref-canonical-signoff",
            skill_id="skill-operator-brief",
            name="Canonical Sign-off",
            description="Required closing clause.",
            body="Always close with: Escalate to finance before any extra spend.",
        )
    )

    workflow = Workflow(
        id="wf-agent-skill-finalize-request",
        name="Agent Skill Finalize Request Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "goal": "Draft a concise operator response.",
                        "prompt": "Draft the final reply.",
                        "skillIds": ["skill-operator-brief"],
                        "skillBinding": {
                            "enabledPhases": ["main_finalize"],
                            "promptBudgetChars": 512,
                            "references": [],
                        },
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": False},
                        "mockPlan": {"toolCalls": []},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "ops reply"})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.output_payload["result"] == "Escalate to finance before any extra spend."

    requested_event = next(
        event
        for event in artifacts.events
        if event.event_type == "agent.skill.references.requested"
    )
    assert requested_event.payload == {
        "node_id": "agent",
        "phase": "main_finalize",
        "skill_id": "skill-operator-brief",
        "reference_id": "ref-canonical-signoff",
        "status": "loaded",
        "request_index": 1,
        "request_total": 1,
        "reason": "Need the exact sign-off clause before finalizing.",
        "retrieval_http_path": (
            "/api/skills/skill-operator-brief/references/ref-canonical-signoff"
            "?workspace_id=default"
        ),
        "retrieval_mcp_method": "skills.get_reference",
        "retrieval_mcp_params": {
            "skill_id": "skill-operator-brief",
            "reference_id": "ref-canonical-signoff",
            "workspace_id": "default",
        },
    }

    loaded_events = [
        event for event in artifacts.events if event.event_type == "agent.skill.references.loaded"
    ]
    assert loaded_events[-1].payload == {
        "node_id": "agent",
        "phase": "main_finalize",
        "references": [
            {
                "skill_id": "skill-operator-brief",
                "skill_name": "Operator Brief",
                "reference_id": "ref-canonical-signoff",
                "reference_name": "Canonical Sign-off",
                "load_source": "llm_explicit_request",
                "fetch_reason": "Need the exact sign-off clause before finalizing.",
                "fetch_request_index": 1,
                "fetch_request_total": 1,
                "retrieval_http_path": (
                    "/api/skills/skill-operator-brief/references/ref-canonical-signoff"
                    "?workspace_id=default"
                ),
                "retrieval_mcp_method": "skills.get_reference",
                "retrieval_mcp_params": {
                    "skill_id": "skill-operator-brief",
                    "reference_id": "ref-canonical-signoff",
                    "workspace_id": "default",
                },
            }
        ],
    }

    roles = [record.role for record in artifacts.ai_calls]
    assert "main_finalize_skill_reference_request" in roles
    assert "main_finalize" in roles

    captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
    assert len(captured_requests) == 2

    request_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[0]["body"]["messages"]
        if isinstance(message, dict)
    )
    finalize_content = "\n".join(
        str(message.get("content", ""))
        for message in captured_requests[1]["body"]["messages"]
        if isinstance(message, dict)
    )
    assert "Always close with: Escalate to finance before any extra spend." not in request_content
    assert "Always close with: Escalate to finance before any extra spend." in finalize_content



# ---------------------------------------------------------------------------
# Test: LLM finalize with tools
# ---------------------------------------------------------------------------

def test_llm_finalize_with_tool_results(sqlite_session: Session) -> None:
    """When tools execute and model config is valid, finalize via LLM with tool context."""
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "Found 3 results",
            "structured": {"hits": 3},
            "meta": {"tool_name": "Native Search"},
        },
    )

    runtime = _create_runtime_with_llm(
        [
            # Plan - no LLM call since mockPlan is used
            # Finalize call response
            _openai_response("Based on the search results, I found 3 items."),
        ],
        registry=registry,
    )

    workflow = Workflow(
        id="wf-llm-tools",
        name="LLM With Tools Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Search and summarize",
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": False},
                        "mockPlan": {
                            "toolCalls": [
                                {"toolId": "native.search", "inputs": {"query": "test"}}
                            ],
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    output = agent_run.output_payload
    assert output["result"] == "Based on the search results, I found 3 items."
    assert output["decision_basis"] == "llm_with_tools"


# ---------------------------------------------------------------------------
# Test: LLM distill evidence
# ---------------------------------------------------------------------------

def test_llm_distill_evidence_with_valid_model(sqlite_session: Session) -> None:
    """When assistant is enabled and model config valid, distill evidence via LLM."""
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "search results ready",
            "structured": {"documents": ["doc1"]},
            "meta": {"tool_name": "Native Search"},
        },
    )

    evidence_json = json.dumps({
        "summary": "LLM-distilled evidence from search",
        "key_points": ["Found doc1"],
        "conflicts": [],
        "unknowns": [],
        "confidence": 0.95,
    })

    runtime = _create_runtime_with_llm(
        [
            # Distill evidence call
            _openai_response(evidence_json),
            # Finalize call
            _openai_response("Final answer based on evidence."),
        ],
        registry=registry,
    )

    workflow = Workflow(
        id="wf-llm-distill",
        name="LLM Distill Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Analyze search results",
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": True, "trigger": "always"},
                        "mockPlan": {
                            "toolCalls": [
                                {"toolId": "native.search", "inputs": {"query": "test"}}
                            ],
                            "needAssistant": True,
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")

    # Evidence should come from LLM
    evidence = agent_run.evidence_context
    assert evidence is not None
    assert evidence["summary"] == "LLM-distilled evidence from search"
    assert evidence["confidence"] == 0.95

    # Roles should include assistant_distill
    roles = [r.role for r in artifacts.ai_calls]
    assert "assistant_distill" in roles
    assert "main_finalize" in roles


# ---------------------------------------------------------------------------
# Test: LLM error in finalize degrades gracefully
# ---------------------------------------------------------------------------

def test_llm_finalize_error_degrades_gracefully(sqlite_session: Session) -> None:
    """When LLM call fails during finalize, fall back to synthetic output."""

    def error_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    llm_provider = LLMProviderService(
        client_factory=lambda: httpx.Client(
            transport=httpx.MockTransport(error_handler),
        ),
    )
    registry = PluginRegistry()
    proxy = PluginCallProxy(registry)
    runtime = RuntimeService(plugin_call_proxy=proxy)
    runtime._llm_provider = llm_provider
    runtime._agent_runtime._llm_provider = llm_provider

    workflow = Workflow(
        id="wf-llm-error",
        name="LLM Error Test",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "prompt": "Analyze this",
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4o",
                            "apiKey": "sk-test-key",
                        },
                        "assistant": {"enabled": False},
                        "mockPlan": {"toolCalls": []},
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

    # Should still succeed with fallback
    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.output_payload["decision_basis"] == "working_context"


def test_openai_compatible_runtime_resolves_credential_ref_and_custom_base_url(
    sqlite_session: Session,
) -> None:
    with _patch_credential_settings():
        runtime = _create_runtime_with_llm([
            _openai_response("Proxy-backed answer.", model="kimi-k2")
        ])
        credential = CredentialStore().create(
            sqlite_session,
            name="Proxy OpenAI Key",
            credential_type="openai_compatible_api_key",
            data={"api_key": "sk-proxy-key"},
        )
        sqlite_session.commit()

        workflow = Workflow(
            id="wf-openai-compatible-base-url",
            name="OpenAI-compatible Base URL",
            version="0.1.0",
            status="draft",
            definition={
                "nodes": [
                    {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                    {
                        "id": "agent",
                        "type": "llmAgentNode",
                        "name": "Agent",
                        "config": {
                            "prompt": "Answer via proxy",
                            "model": {
                                "provider": "openai-compatible",
                                "modelId": "kimi-k2",
                                "apiKey": f"credential://{credential.id}",
                                "baseUrl": "https://proxy.example/v1",
                            },
                            "assistant": {"enabled": False},
                        },
                    },
                    {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                    {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
                ],
            },
        )
        sqlite_session.add(workflow)
        sqlite_session.commit()

        artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

        assert artifacts.run.status == "succeeded"
        captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
        assert captured_requests[0]["url"] == "https://proxy.example/v1/chat/completions"
        assert captured_requests[0]["body"]["model"] == "kimi-k2"

        resolved_credential = CredentialStore().get(sqlite_session, credential_id=credential.id)
        assert resolved_credential.last_used_at is not None


def test_anthropic_runtime_uses_messages_endpoint_with_credential_ref_and_base_url(
    sqlite_session: Session,
) -> None:
    with _patch_credential_settings():
        runtime = _create_runtime_with_llm([
            _anthropic_response("Anthropic proxy answer.")
        ])
        credential = CredentialStore().create(
            sqlite_session,
            name="Anthropic Key",
            credential_type="anthropic_api_key",
            data={"api_key": "sk-ant-test"},
        )
        sqlite_session.commit()

        workflow = Workflow(
            id="wf-anthropic-base-url",
            name="Anthropic Base URL",
            version="0.1.0",
            status="draft",
            definition={
                "nodes": [
                    {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                    {
                        "id": "agent",
                        "type": "llmAgentNode",
                        "name": "Agent",
                        "config": {
                            "prompt": "Answer via anthropic proxy",
                            "model": {
                                "provider": "anthropic",
                                "modelId": "claude-3-7-sonnet-latest",
                                "apiKey": f"credential://{credential.id}",
                                "baseUrl": "https://anthropic-proxy.example",
                            },
                            "assistant": {"enabled": False},
                        },
                    },
                    {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                    {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
                ],
            },
        )
        sqlite_session.add(workflow)
        sqlite_session.commit()

        artifacts = runtime.execute_workflow(sqlite_session, workflow, {})

        assert artifacts.run.status == "succeeded"
        captured_requests = runtime._llm_provider._captured_requests  # type: ignore[attr-defined]
        assert captured_requests[0]["url"] == "https://anthropic-proxy.example/v1/messages"
        assert captured_requests[0]["body"]["model"] == "claude-3-7-sonnet-latest"

        resolved_credential = CredentialStore().get(sqlite_session, credential_id=credential.id)
        assert resolved_credential.last_used_at is not None
