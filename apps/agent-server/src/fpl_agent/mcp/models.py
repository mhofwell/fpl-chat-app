"""Pydantic models for MCP tool inputs and outputs.

PlayerProfile is sectioned so the model can anchor responses on the
relevant section (form, ownership, scoring, etc.). Fixture has a
dual shape: team-POV when team_id is set, neutral otherwise.
"""

from __future__ import annotations

from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


# ── Shared reference types ───────────────────────────────────────────


class TeamRef(BaseModel):
    id: int
    name: str
    short_name: str


class Meta(BaseModel):
    source: Literal["redis", "api"]
    as_of: str  # ISO 8601
    cache_age_seconds: int


class ToolResponse(BaseModel, Generic[T]):
    data: list[T]
    meta: Meta


# ── Player profile (sectioned) ──────────────────────────────────────


class BasicInfo(BaseModel):
    id: int
    web_name: str
    first_name: str
    second_name: str
    team: TeamRef
    position: str  # GKP, DEF, MID, FWD
    now_cost: float  # converted from 0.1M int
    total_points: int
    status: str  # a=available, u=unavailable, i=injured, etc.


class ScoringStats(BaseModel):
    goals_scored: int
    assists: int
    clean_sheets: int
    bonus: int
    expected_goals: str
    expected_assists: str
    expected_goal_involvements: str
    ict_index: str
    influence: str
    creativity: str
    threat: str


class FormStats(BaseModel):
    form: str
    points_per_game: str
    form_rank: int | None = None
    points_per_game_rank: int | None = None


class OwnershipStats(BaseModel):
    selected_by_percent: str
    transfers_in: int
    transfers_out: int
    transfers_in_event: int
    transfers_out_event: int
    cost_change_event: int


class PlayingTime(BaseModel):
    minutes: int
    starts: int
    chance_of_playing_this_round: int | None = None
    chance_of_playing_next_round: int | None = None
    news: str
    news_added: str | None = None


class PlayerProfile(BaseModel):
    basic: BasicInfo
    scoring: ScoringStats
    form: FormStats
    ownership: OwnershipStats
    playing: PlayingTime


# ── Team profile ─────────────────────────────────────────────────────


class TeamProfile(BaseModel):
    id: int
    name: str
    short_name: str
    strength: int
    position: int
    played: int
    win: int
    draw: int
    loss: int
    points: int
    strength_overall_home: int
    strength_overall_away: int
    strength_attack_home: int
    strength_attack_away: int
    strength_defence_home: int
    strength_defence_away: int


# ── Fixture (dual-shape) ────────────────────────────────────────────


class Fixture(BaseModel):
    id: int
    gameweek: int | None = None
    kickoff_time: str | None = None
    finished: bool

    # Team-POV fields (populated when team_id filter is set)
    venue: Literal["H", "A"] | None = None
    opponent: TeamRef | None = None
    result: Literal["W", "D", "L"] | None = None
    goals_for: int | None = None
    goals_against: int | None = None
    difficulty: int | None = None

    # Neutral fields (populated when no team filter)
    home_team: TeamRef | None = None
    away_team: TeamRef | None = None
    home_score: int | None = None
    away_score: int | None = None
    home_difficulty: int | None = None
    away_difficulty: int | None = None
