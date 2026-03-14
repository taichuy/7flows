from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from typing import Any

from app.services.runtime_types import WorkflowExecutionError

_SUPPORTED_SANDBOX_LANGUAGES = {"python"}
_DEFAULT_TIMEOUT_MS = 30_000

_PYTHON_WRAPPER = textwrap.dedent(
    """
    import base64
    import io
    import json
    import os
    import sys
    import traceback
    from contextlib import redirect_stderr, redirect_stdout

    payload = json.loads(sys.stdin.read() or "{}")
    code = base64.b64decode(os.environ["SEVENFLOWS_SANDBOX_CODE"]).decode("utf-8")
    globals_ns = {
        "__name__": "__main__",
        "input_payload": payload,
        "node_input": payload,
        "result": None,
        "output": None,
    }
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()

    try:
        with redirect_stdout(captured_stdout), redirect_stderr(captured_stderr):
            exec(compile(code, "<sandbox_code>", "exec"), globals_ns, globals_ns)
        result = globals_ns.get("result")
        if result is None and "output" in globals_ns:
            result = globals_ns.get("output")
        envelope = {
            "ok": True,
            "result": result,
            "stdout": captured_stdout.getvalue(),
            "stderr": captured_stderr.getvalue(),
        }
    except Exception:
        traceback.print_exc(file=captured_stderr)
        envelope = {
            "ok": False,
            "error": captured_stderr.getvalue() or "sandbox_code execution failed",
            "stdout": captured_stdout.getvalue(),
            "stderr": captured_stderr.getvalue(),
        }

    sys.stdout.write(json.dumps(envelope, ensure_ascii=False))
    """
).strip()


@dataclass(frozen=True)
class SandboxCodeExecutionResult:
    language: str
    result: Any
    stdout: str
    stderr: str
    effective_adapter: str


class HostSandboxCodeExecutor:
    def execute(
        self,
        *,
        config: dict[str, Any],
        node_input: dict[str, Any],
        timeout_ms: int | None,
    ) -> SandboxCodeExecutionResult:
        language = str(config.get("language") or "python").strip().lower() or "python"
        if language not in _SUPPORTED_SANDBOX_LANGUAGES:
            supported = ", ".join(sorted(_SUPPORTED_SANDBOX_LANGUAGES))
            raise WorkflowExecutionError(
                f"sandbox_code currently only supports language(s): {supported}."
            )

        code = str(config.get("code") or "")
        if not code.strip():
            raise WorkflowExecutionError("sandbox_code nodes must define a non-empty config.code.")

        resolved_timeout_ms = timeout_ms if isinstance(timeout_ms, int) else _DEFAULT_TIMEOUT_MS
        try:
            completed = subprocess.run(
                [sys.executable, "-c", _PYTHON_WRAPPER],
                input=json.dumps(node_input, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=max(resolved_timeout_ms, 1) / 1000,
                env={
                    **os.environ,
                    "SEVENFLOWS_SANDBOX_CODE": base64.b64encode(code.encode("utf-8")).decode(
                        "ascii"
                    ),
                },
            )
        except subprocess.TimeoutExpired as exc:
            raise WorkflowExecutionError(
                f"sandbox_code exceeded timeout after {resolved_timeout_ms}ms."
            ) from exc
        except OSError as exc:
            raise WorkflowExecutionError(
                f"sandbox_code failed to start host subprocess: {exc}"
            ) from exc

        envelope = self._parse_envelope(completed.stdout, stderr=completed.stderr)
        stdout = str(envelope.get("stdout") or "")
        stderr = str(envelope.get("stderr") or completed.stderr or "")
        if not envelope.get("ok"):
            message = str(envelope.get("error") or stderr or "sandbox_code execution failed")
            raise WorkflowExecutionError(message.strip())

        return SandboxCodeExecutionResult(
            language=language,
            result=envelope.get("result"),
            stdout=stdout,
            stderr=stderr,
            effective_adapter="host_subprocess_python",
        )

    def _parse_envelope(self, stdout: str, *, stderr: str) -> dict[str, Any]:
        raw_stdout = stdout.strip()
        if not raw_stdout:
            if stderr.strip():
                raise WorkflowExecutionError(stderr.strip())
            raise WorkflowExecutionError("sandbox_code subprocess returned an empty response.")

        try:
            payload = json.loads(raw_stdout)
        except json.JSONDecodeError as exc:
            raise WorkflowExecutionError(
                "sandbox_code subprocess returned a non-JSON envelope."
            ) from exc

        if not isinstance(payload, dict):
            raise WorkflowExecutionError("sandbox_code subprocess returned an invalid response.")
        return payload
