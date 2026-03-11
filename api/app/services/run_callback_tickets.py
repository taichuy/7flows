from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from secrets import token_urlsafe

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import RunCallbackTicket


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class CallbackTicketSnapshot:
    ticket: str
    run_id: str
    node_run_id: str
    tool_call_id: str | None
    tool_id: str | None
    tool_call_index: int
    waiting_status: str
    reason: str | None
    status: str
    created_at: datetime

    def as_checkpoint_payload(self) -> dict[str, object]:
        return {
            "ticket": self.ticket,
            "run_id": self.run_id,
            "node_run_id": self.node_run_id,
            "tool_call_id": self.tool_call_id,
            "tool_id": self.tool_id,
            "tool_call_index": self.tool_call_index,
            "waiting_status": self.waiting_status,
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at.isoformat().replace("+00:00", "Z"),
        }


class RunCallbackTicketService:
    def issue_ticket(
        self,
        db: Session,
        *,
        run_id: str,
        node_run_id: str,
        tool_call_id: str | None,
        tool_id: str | None,
        tool_call_index: int,
        waiting_status: str,
        reason: str | None,
    ) -> CallbackTicketSnapshot:
        self.cancel_pending_for_node_run(
            db,
            node_run_id=node_run_id,
            reason="superseded_by_new_waiting_callback",
        )
        record = RunCallbackTicket(
            id=token_urlsafe(24),
            run_id=run_id,
            node_run_id=node_run_id,
            tool_call_id=tool_call_id,
            tool_id=tool_id,
            tool_call_index=max(int(tool_call_index), 0),
            waiting_status=waiting_status,
            status="pending",
            reason=reason,
            callback_payload=None,
            created_at=_utcnow(),
        )
        db.add(record)
        db.flush()
        return self._snapshot(record)

    def get_ticket(self, db: Session, ticket: str) -> RunCallbackTicket | None:
        return db.get(RunCallbackTicket, ticket)

    def consume_ticket(
        self,
        record: RunCallbackTicket,
        *,
        callback_payload: dict,
    ) -> CallbackTicketSnapshot:
        record.status = "consumed"
        record.callback_payload = callback_payload
        record.consumed_at = _utcnow()
        return self._snapshot(record)

    def cancel_pending_for_node_run(
        self,
        db: Session,
        *,
        node_run_id: str,
        reason: str,
    ) -> list[RunCallbackTicket]:
        records = db.scalars(
            select(RunCallbackTicket).where(
                RunCallbackTicket.node_run_id == node_run_id,
                RunCallbackTicket.status == "pending",
            )
        ).all()
        for record in records:
            record.status = "canceled"
            record.callback_payload = {"reason": reason}
            record.canceled_at = _utcnow()
        return records

    def _snapshot(self, record: RunCallbackTicket) -> CallbackTicketSnapshot:
        return CallbackTicketSnapshot(
            ticket=record.id,
            run_id=record.run_id,
            node_run_id=record.node_run_id,
            tool_call_id=record.tool_call_id,
            tool_id=record.tool_id,
            tool_call_index=record.tool_call_index,
            waiting_status=record.waiting_status,
            reason=record.reason,
            status=record.status,
            created_at=record.created_at,
        )
