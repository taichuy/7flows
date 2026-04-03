from fastapi.testclient import TestClient


def test_skill_catalog_crud_and_reference_retrieval(
    client: TestClient, auth_headers: dict, write_headers: dict
) -> None:
    list_response = client.get("/api/skills", headers=auth_headers)
    assert list_response.status_code == 200
    assert list_response.json() == []

    create_response = client.post(
        "/api/skills",
        json={
            "id": "skill-research-brief",
            "workspace_id": "default",
            "name": "Research Brief",
            "description": "Guide the agent to produce concise research briefs.",
            "body": "Summarize the task, collect evidence, and highlight open questions.",
            "references": [
                {
                    "id": "ref-structure",
                    "name": "Brief Structure",
                    "description": "Outline expected output sections.",
                    "body": "Use sections for summary, evidence, risks, and next steps.",
                }
            ],
        },
        headers=write_headers,
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["id"] == "skill-research-brief"
    assert created["references"][0]["id"] == "ref-structure"

    detail_response = client.get("/api/skills/skill-research-brief", headers=auth_headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["name"] == "Research Brief"
    assert detail["body"].startswith("Summarize the task")
    assert detail["references"] == [
        {
            "id": "ref-structure",
            "name": "Brief Structure",
            "description": "Outline expected output sections.",
        }
    ]

    reference_response = client.get(
        "/api/skills/skill-research-brief/references/ref-structure",
        headers=auth_headers,
    )
    assert reference_response.status_code == 200
    assert reference_response.json()["body"].startswith("Use sections")

    mcp_list_response = client.post(
        "/api/skills/mcp/call",
        json={
            "method": "skills.list",
            "params": {"workspace_id": "default"},
        },
        headers=auth_headers,
    )
    assert mcp_list_response.status_code == 200
    assert mcp_list_response.json()["result"][0]["id"] == "skill-research-brief"

    mcp_detail_response = client.post(
        "/api/skills/mcp/call",
        json={
            "method": "skills.get",
            "params": {"skill_id": "skill-research-brief"},
        },
        headers=auth_headers,
    )
    assert mcp_detail_response.status_code == 200
    assert mcp_detail_response.json()["result"]["references"] == [
        {
            "id": "ref-structure",
            "name": "Brief Structure",
            "description": "Outline expected output sections.",
        }
    ]

    mcp_reference_response = client.post(
        "/api/skills/mcp/call",
        json={
            "method": "skills.get_reference",
            "params": {
                "skill_id": "skill-research-brief",
                "reference_id": "ref-structure",
            },
        },
        headers=auth_headers,
    )
    assert mcp_reference_response.status_code == 200
    assert mcp_reference_response.json()["result"] == {
        "id": "ref-structure",
        "name": "Brief Structure",
        "description": "Outline expected output sections.",
        "body": "Use sections for summary, evidence, risks, and next steps.",
    }

    update_response = client.put(
        "/api/skills/skill-research-brief",
        json={
            "description": "Guide the agent to produce auditable research briefs.",
            "references": [
                {
                    "id": "ref-handoff",
                    "name": "Operator Handoff",
                    "description": "What humans need next.",
                    "body": "Always include unresolved questions and recommended operator actions.",
                }
            ],
        },
        headers=write_headers,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["description"] == "Guide the agent to produce auditable research briefs."
    assert updated["references"] == [
        {
            "id": "ref-handoff",
            "name": "Operator Handoff",
            "description": "What humans need next.",
        }
    ]

    final_list_response = client.get("/api/skills", headers=auth_headers)
    assert final_list_response.status_code == 200
    assert final_list_response.json()[0]["reference_count"] == 1

    delete_response = client.delete("/api/skills/skill-research-brief", headers=write_headers)
    assert delete_response.status_code == 204
    assert client.get("/api/skills", headers=auth_headers).json() == []
