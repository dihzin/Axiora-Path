from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class StudentSkillMastery(Base):
    __tablename__ = "student_skill_mastery"
    __table_args__ = (
        UniqueConstraint("student_id", "skill_id", name="uq_student_skill_mastery_student_skill"),
        Index("ix_student_skill_mastery_student_id", "student_id"),
        Index("ix_student_skill_mastery_skill_id", "skill_id"),
        Index("ix_student_skill_mastery_last_updated", "last_updated"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    skill_id: Mapped[str] = mapped_column(String(36), ForeignKey("skills.id"), nullable=False)
    mastery: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    velocity: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False, server_default="0")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class StudentLessonProgress(Base):
    __tablename__ = "student_lesson_progress"
    __table_args__ = (
        UniqueConstraint("student_id", "lesson_id", name="uq_student_lesson_progress_student_lesson"),
        Index("ix_student_lesson_progress_student_id", "student_id"),
        Index("ix_student_lesson_progress_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stars: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    time_spent: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class StudentSubjectState(Base):
    __tablename__ = "student_subject_state"
    __table_args__ = (
        UniqueConstraint("student_id", "subject_id", name="uq_student_subject_state_student_subject"),
        Index("ix_student_subject_state_student_id", "student_id"),
        Index("ix_student_subject_state_subject_id", "subject_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    progress: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    current_skill: Mapped[str | None] = mapped_column(String(36), ForeignKey("skills.id"), nullable=True)
    current_lesson: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
