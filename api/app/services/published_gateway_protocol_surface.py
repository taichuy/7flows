from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.published_gateway_types import PublishedGatewayInvokeResult
from app.services.published_protocol_mapper import (
    build_anthropic_message_response,
    build_cache_identity_payload,
    build_openai_chat_completion_response,
    build_openai_response_api_response,
)


class PublishedGatewayProtocolSurfaceMixin:
    def invoke_openai_chat_completion(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.chat.completions",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_streaming_enabled=require_streaming_enabled,
            response_builder=lambda **kwargs: build_openai_chat_completion_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_openai_chat_completion_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.chat.completions.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="openai.chat.completions.async",
            response_builder=(
                lambda **kwargs: self._response_builder.build_protocol_async_response_payload(
                    binding=kwargs["binding"],
                    workflow=kwargs["workflow"],
                    workflow_version=kwargs["workflow_version"],
                    blueprint_record=kwargs["blueprint_record"],
                    artifacts=kwargs["artifacts"],
                    run_detail=kwargs["run_detail"],
                    run_snapshot=kwargs.get("run_snapshot"),
                    model=model,
                    request_surface="openai.chat.completions.async",
                    protocol_response_builder=build_openai_chat_completion_response,
                )
            ),
        )

    def invoke_openai_response(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.responses",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_streaming_enabled=require_streaming_enabled,
            response_builder=lambda **kwargs: build_openai_response_api_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_openai_response_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.responses.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="openai.responses.async",
            response_builder=(
                lambda **kwargs: self._response_builder.build_protocol_async_response_payload(
                    binding=kwargs["binding"],
                    workflow=kwargs["workflow"],
                    workflow_version=kwargs["workflow_version"],
                    blueprint_record=kwargs["blueprint_record"],
                    artifacts=kwargs["artifacts"],
                    run_detail=kwargs["run_detail"],
                    run_snapshot=kwargs.get("run_snapshot"),
                    model=model,
                    request_surface="openai.responses.async",
                    protocol_response_builder=build_openai_response_api_response,
                )
            ),
        )

    def invoke_anthropic_message(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="anthropic",
            missing_detail="Published Anthropic model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="anthropic.messages",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_streaming_enabled=require_streaming_enabled,
            response_builder=lambda **kwargs: build_anthropic_message_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_anthropic_message_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="anthropic",
            missing_detail="Published Anthropic model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="anthropic.messages.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="anthropic.messages.async",
            response_builder=(
                lambda **kwargs: self._response_builder.build_protocol_async_response_payload(
                    binding=kwargs["binding"],
                    workflow=kwargs["workflow"],
                    workflow_version=kwargs["workflow_version"],
                    blueprint_record=kwargs["blueprint_record"],
                    artifacts=kwargs["artifacts"],
                    run_detail=kwargs["run_detail"],
                    run_snapshot=kwargs.get("run_snapshot"),
                    model=model,
                    request_surface="anthropic.messages.async",
                    protocol_response_builder=build_anthropic_message_response,
                )
            ),
        )
