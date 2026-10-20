"""Relational persistence models. These are not domain entities."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import UUID as PGUUID
from sqlalchemy.types import Boolean


class Base(DeclarativeBase):
    pass


class AcademicSourceRow(Base):
    __tablename__ = "academic_sources"
    __table_args__ = (
        UniqueConstraint("student_id", "source", name="uq_academic_source_student_source"),
        CheckConstraint("source IN ('manual', 'csv', 'json')", name="ck_academic_source_kind"),
        Index("ix_academic_sources_student", "student_id"),
    )
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    student_external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ImportedCourseRow(Base):
    __tablename__ = "imported_courses"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_imported_course_external"),
        Index("ix_imported_courses_source", "source_id"),
    )
    course_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    source_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("academic_sources.source_id", ondelete="RESTRICT"),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    code: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ImportedAssignmentRow(Base):
    __tablename__ = "imported_assignments"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_imported_assignment_external"),
        Index("ix_imported_assignments_source", "source_id"),
    )
    assignment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    source_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("academic_sources.source_id", ondelete="RESTRICT"),
        nullable=False,
    )
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("imported_courses.course_id", ondelete="RESTRICT"),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ImportedSubmissionRow(Base):
    __tablename__ = "imported_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", name="uq_imported_submission_assignment"),)
    submission_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    assignment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("imported_assignments.assignment_id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskRow(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("student_id", "task_id", name="uq_task_owner"),
        CheckConstraint("estimated_seconds >= 0", name="ck_tasks_estimated_nonnegative"),
        CheckConstraint(
            "status IN ('not_started', 'in_progress', 'completed')", name="ck_tasks_status"
        ),
        Index("ix_tasks_student", "student_id"),
    )
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    assignment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    estimated_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ExecutionRow(Base):
    __tablename__ = "task_executions"
    __table_args__ = (
        CheckConstraint("outcome IN ('partial', 'completed')", name="ck_execution_outcome"),
        Index("ix_executions_student_task", "student_id", "task_id"),
    )
    record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlanRow(Base):
    __tablename__ = "study_plans"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "period_start", "period_end", "revision", name="uq_plan_revision"
        ),
        UniqueConstraint("parent_record_id", name="uq_plan_parent"),
        CheckConstraint("revision >= 1", name="ck_plan_revision"),
        Index("ix_plans_scope", "student_id", "period_start", "period_end", "revision"),
    )
    record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_record_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("study_plans.record_id"), nullable=True
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    planner_version: Mapped[int] = mapped_column(Integer, nullable=False)


class PlanBlockRow(Base):
    __tablename__ = "study_plan_blocks"
    __table_args__ = (Index("ix_plan_blocks_plan_order", "plan_record_id", "position"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("study_plans.record_id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlanUnplannedRow(Base):
    __tablename__ = "study_plan_unplanned"
    __table_args__ = (UniqueConstraint("plan_record_id", "task_id", name="uq_plan_unplanned_task"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("study_plans.record_id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    remaining_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)


class ReplanningAuditRow(Base):
    __tablename__ = "replanning_audits"
    record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("study_plans.record_id", ondelete="CASCADE"),
        primary_key=True,
    )
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    replanner_version: Mapped[int] = mapped_column(Integer, nullable=False)
    historical_block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    crossing_block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    preserved_future_block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    removed_future_block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    added_future_block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    moved_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    newly_unplanned_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    execution_context_task_count: Mapped[int] = mapped_column(Integer, nullable=False)


class PlanChangeRow(Base):
    __tablename__ = "plan_changes"
    __table_args__ = (UniqueConstraint("record_id", "task_id", name="uq_plan_change_task"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("replanning_audits.record_id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    baseline_unplanned_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_unplanned_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revised_unplanned_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    revised_unplanned_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    had_execution_activity: Mapped[bool] = mapped_column(Boolean, nullable=False)


class PlanChangeReasonRow(Base):
    __tablename__ = "plan_change_reasons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    change_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plan_changes.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(64), nullable=False)


class PlanChangeBlockRow(Base):
    __tablename__ = "plan_change_blocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    change_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plan_changes.id", ondelete="CASCADE"), nullable=False
    )
    side: Mapped[str] = mapped_column(String(16), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlanReflectionKindRow(Base):
    __tablename__ = "plan_reflection_kinds"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("replanning_audits.record_id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)


class ReflectionRow(Base):
    __tablename__ = "confirmed_reflections"
    __table_args__ = (Index("ix_reflections_student_time", "student_id", "confirmed_at"),)
    record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ReflectionSignalRow(Base):
    __tablename__ = "confirmed_reflection_signals"
    __table_args__ = (
        ForeignKeyConstraint(
            ["record_id"], ["confirmed_reflections.record_id"], ondelete="CASCADE"
        ),
        CheckConstraint(
            "kind IN ('estimation_feedback', 'workload_feedback', 'difficult_topic', "
            "'deferred_task')",
            name="ck_reflection_signal_kind",
        ),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    estimated_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workload: Mapped[str | None] = mapped_column(String(32), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(500), nullable=True)


class WeeklyGoalRow(Base):
    __tablename__ = "weekly_goals"
    __table_args__ = (
        UniqueConstraint("student_id", "period_start", "period_end", name="uq_weekly_goal_scope"),
        CheckConstraint("target_minutes >= 0", name="ck_weekly_goal_target"),
        Index("ix_weekly_goals_student", "student_id", "period_start"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    goal_text: Mapped[str] = mapped_column(String(500), nullable=False)
    target_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    # [[starts_at_iso, ends_at_iso], ...] in UTC; small, always read with the goal.
    study_windows: Mapped[list[list[str]]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SimulatedWorkspaceRow(Base):
    """Demo/staging only: an account's fictional fixture anchor and virtual clock."""

    __tablename__ = "simulated_workspaces"
    __table_args__ = (
        CheckConstraint("generation >= 1", name="ck_simulated_workspace_generation"),
        CheckConstraint("virtual_now >= anchor", name="ck_simulated_workspace_clock"),
    )
    owner_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    anchor: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    virtual_now: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SimulatedSubmissionRow(Base):
    __tablename__ = "simulated_submissions"
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    assignment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TaskDecompositionSessionRow(Base):
    """Candidate sessions survive between serverless instances; they are not task facts."""

    __tablename__ = "task_decomposition_sessions"
    __table_args__ = (Index("ix_task_decomposition_sessions_student", "student_id"),)
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    session: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    confirmation: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LearningPreferenceRow(Base):
    __tablename__ = "learning_preferences"
    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    preferences: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)


class CompanionMemoryRow(Base):
    __tablename__ = "companion_memories"
    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    identifier: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(String(400), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CompanionConversationRow(Base):
    __tablename__ = "companion_conversations"
    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    identifier: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CompanionExchangeRow(Base):
    __tablename__ = "companion_exchanges"
    __table_args__ = (
        ForeignKeyConstraint(
            ["owner", "conversation_id"],
            ["companion_conversations.owner", "companion_conversations.identifier"],
            name="fk_companion_exchange_conversation",
            ondelete="CASCADE",
        ),
        Index(
            "ix_companion_conversation_messages",
            "owner",
            "conversation_id",
            "created_at",
            "identifier",
        ),
    )
    conversation_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    identifier: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TicketBoardRow(Base):
    __tablename__ = "ticket_boards"
    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    scope: Mapped[str] = mapped_column(String(256), primary_key=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
