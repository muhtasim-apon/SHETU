"""Pydantic models for health goals."""
from typing import Optional

from pydantic import BaseModel


class GoalCreate(BaseModel):
    goal_type: str
    goal_label: str
    goal_label_bn: Optional[str] = None
    target_value: float
    target_unit: str
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    reminder_enabled: bool = True
    notes: Optional[str] = None


class GoalUpdate(BaseModel):
    goal_label: Optional[str] = None
    goal_label_bn: Optional[str] = None
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    deadline: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    notes: Optional[str] = None


class GoalResponse(BaseModel):
    id: str
    goal_type: str
    goal_label: str
    goal_label_bn: Optional[str] = None
    target_value: float
    target_unit: str
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    reminder_enabled: bool = True
    notes: Optional[str] = None
    current_value: Optional[float] = None
    progress_percent: float = 0.0
    is_active: bool = True
    is_achieved: bool = False
    achieved_at: Optional[str] = None
    days_remaining: Optional[int] = None
    created_at: Optional[str] = None
