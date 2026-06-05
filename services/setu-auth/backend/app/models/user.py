"""Pydantic request/response models for the auth service."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "mother", "patient"]


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    role: Role = "patient"
    phone: Optional[str] = None


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class UserProfile(BaseModel):
    id: str
    email: EmailStr
    role: Role
    full_name: str
    phone: Optional[str] = None
    created_at: Optional[datetime] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class MessageResponse(BaseModel):
    message: str
