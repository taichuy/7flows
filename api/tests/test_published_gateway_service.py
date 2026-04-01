from unittest.mock import Mock

import pytest

from app.services.published_gateway import (
    PublishedEndpointGatewayError,
    PublishedEndpointGatewayService,
    PublishedGatewayInvokeResult,
)


def test_invoke_openai_chat_completion_commits_invocation_audit_on_success() -> None:
    service = PublishedEndpointGatewayService()
    binding_invoker = Mock()
    result = PublishedGatewayInvokeResult(
        response_payload={"id": "chatcmpl_demo", "object": "chat.completion"},
        cache_status="bypass",
        run_id="run-success",
        run_status="succeeded",
        run_payload={"id": "run-success", "status": "succeeded"},
    )
    binding_invoker.invoke_protocol_binding_by_alias.return_value = result
    service._binding_invoker = binding_invoker
    db = Mock()

    actual = service.invoke_openai_chat_completion(
        db,
        model="published-openai-demo",
        input_payload={"messages": []},
        request_payload={"model": "published-openai-demo", "messages": []},
    )

    assert actual == result
    db.commit.assert_called_once()


def test_invoke_native_endpoint_commits_invocation_audit_before_raising() -> None:
    service = PublishedEndpointGatewayService()
    binding_invoker = Mock()
    binding_invoker.invoke_binding.side_effect = PublishedEndpointGatewayError(
        "published invocation failed",
        status_code=500,
    )
    service._binding_invoker = binding_invoker
    db = Mock()

    with pytest.raises(PublishedEndpointGatewayError, match="published invocation failed"):
        service.invoke_native_endpoint(
            db,
            workflow_id="workflow-1",
            endpoint_id="native-chat",
            input_payload={"input": {"message": "hello"}},
        )

    db.commit.assert_called_once()


def test_record_protocol_rejection_by_alias_commits_audit() -> None:
    service = PublishedEndpointGatewayService()
    workflow_publish_service = Mock()
    api_key_service = Mock()
    invocation_service = Mock()
    binding = Mock(
        workflow_id="workflow-1",
        endpoint_id="openai-chat",
        auth_mode="api_key",
        protocol="openai",
    )
    authenticated_key = Mock(id="pub-key-1")

    workflow_publish_service.get_published_binding_by_alias.return_value = binding
    api_key_service.authenticate_key.return_value = authenticated_key
    service._workflow_publish_service = workflow_publish_service
    service._api_key_service = api_key_service
    service._invocation_service = invocation_service
    db = Mock()

    service.record_protocol_rejection_by_alias(
        db,
        model="published-openai-demo",
        expected_protocol="openai",
        request_payload={"model": "published-openai-demo", "stream": True},
        error_detail="Streaming responses are not supported yet.",
        presented_api_key="sf_pub_demo_secret",
        request_surface_override="openai.responses.async",
    )

    invocation_service.record_invocation.assert_called_once()
    db.commit.assert_called_once()
