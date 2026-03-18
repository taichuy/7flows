from pydantic import BaseModel


class SignalFollowUpExplanation(BaseModel):
    primary_signal: str | None = None
    follow_up: str | None = None
