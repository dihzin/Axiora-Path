from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Achievement,
    ChildAchievement,
    ChildProfile,
    EventLog,
    LedgerTransaction,
    Recommendation,
    SavingGoal,
    Streak,
    TaskLog,
    TaskLogStatus,
    Wallet,
)
from app.services.wallet import extract_pot_split, signed_amount_cents


class EventService:
    def __init__(self, db: Session):
        self.db = db

    def emit(
        self,
        type: str,
        tenant_id: int,
        actor_user_id: int | None = None,
        child_id: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> EventLog:
        event = EventLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            child_id=child_id,
            type=type,
            payload=payload or {},
        )
        self.db.add(event)
        self.db.flush()
        self._emit_audit_from_event(event)

        self.streak_handler(event)
        self.adaptive_rules_handler(event)
        self.achievement_handler(event)
        return event

    def _persist_audit(
        self,
        *,
        tenant_id: int,
        actor_user_id: int,
        action: str,
        entity_type: str,
        entity_id: int,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(
            AuditLog(
                tenant_id=tenant_id,
                actor_user_id=actor_user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata_json=metadata or {},
            ),
        )

    def _emit_audit_from_event(self, event: EventLog) -> None:
        if event.actor_user_id is None:
            return

        def _as_positive_int(value: Any) -> int | None:
            if isinstance(value, int) and value > 0:
                return value
            if isinstance(value, str) and value.isdigit():
                parsed = int(value)
                return parsed if parsed > 0 else None
            return None

        action: str | None = None
        entity_type: str | None = None
        entity_id: int | None = None
        metadata = event.payload

        if event.type == "task.created":
            action = "task.create"
            entity_type = "task"
            entity_id = _as_positive_int(event.payload.get("task_id"))
        elif event.type == "task.updated":
            action = "task.update"
            entity_type = "task"
            entity_id = _as_positive_int(event.payload.get("task_id"))
        elif event.type == "task.deleted":
            action = "task.delete"
            entity_type = "task"
            entity_id = _as_positive_int(event.payload.get("task_id"))
        elif event.type == "routine.approved":
            action = "task.approve"
            entity_type = "task_log"
            entity_id = _as_positive_int(event.payload.get("log_id"))
        elif event.type == "routine.rejected":
            action = "task.reject"
            entity_type = "task_log"
            entity_id = _as_positive_int(event.payload.get("log_id"))
        elif event.type == "wallet.allowance.ran":
            action = "wallet.adjust"
            entity_type = "ledger_transaction"
            entity_id = _as_positive_int(event.payload.get("transaction_id"))
        elif event.type == "goal.created":
            action = "goal.create"
            entity_type = "saving_goal"
            entity_id = _as_positive_int(event.payload.get("goal_id"))
        elif event.type == "pin.changed":
            action = "pin.change"
            entity_type = "tenant"
            entity_id = event.tenant_id

        if action is None or entity_type is None or entity_id is None:
            return

        self._persist_audit(
            tenant_id=event.tenant_id,
            actor_user_id=event.actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=metadata,
        )

    def _persist_event(
        self,
        *,
        type: str,
        tenant_id: int,
        actor_user_id: int | None,
        child_id: int | None,
        payload: dict[str, Any],
    ) -> None:
        self.db.add(
            EventLog(
                tenant_id=tenant_id,
                actor_user_id=actor_user_id,
                child_id=child_id,
                type=type,
                payload=payload,
            ),
        )

    def streak_handler(self, event: EventLog) -> None:
        if event.type != "routine.marked" or event.child_id is None:
            return

        raw_date = event.payload.get("date")
        try:
            mark_date = date.fromisoformat(raw_date) if isinstance(raw_date, str) else date.today()
        except ValueError:
            mark_date = date.today()

        streak = self.db.get(Streak, event.child_id)
        if streak is None:
            streak = Streak(
                child_id=event.child_id,
                current=1,
                last_date=mark_date,
                freeze_used_today=False,
                freeze_tokens=1,
            )
            self.db.add(streak)
            return

        if streak.last_date is None:
            streak.current = 1
            streak.last_date = mark_date
            streak.freeze_used_today = False
            return

        gap = (mark_date - streak.last_date).days
        if gap == 0:
            return
        if gap == 1:
            streak.current += 1
            streak.freeze_used_today = False
        else:
            if streak.freeze_tokens > 0:
                streak.freeze_tokens -= 1
                streak.freeze_used_today = True
                self._persist_event(
                    type="streak.freeze.used",
                    tenant_id=event.tenant_id,
                    actor_user_id=event.actor_user_id,
                    child_id=event.child_id,
                    payload={"mark_date": str(mark_date), "remaining_freeze_tokens": streak.freeze_tokens},
                )
            else:
                streak.current = 1
                streak.freeze_used_today = False
        streak.last_date = mark_date

    def adaptive_rules_handler(self, event: EventLog) -> None:
        if event.child_id is None:
            return

        child = self.db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == event.child_id,
                ChildProfile.tenant_id == event.tenant_id,
                ChildProfile.deleted_at.is_(None),
            ),
        )
        if child is None:
            return

        self._rule_two_days_without_marks(child_id=child.id, tenant_id=child.tenant_id)
        self._rule_many_rejections_same_task(child_id=child.id, tenant_id=child.tenant_id)
        self._rule_active_goal_low_activity(child_id=child.id, tenant_id=child.tenant_id)

    def achievement_handler(self, event: EventLog) -> None:
        if event.child_id is None:
            return

        child = self.db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == event.child_id,
                ChildProfile.tenant_id == event.tenant_id,
                ChildProfile.deleted_at.is_(None),
            ),
        )
        if child is None:
            return

        self._unlock_if(
            child_id=child.id,
            slug="streak_7_days",
            condition_met=self._is_streak_threshold_reached(child.id, threshold=7),
        )
        self._unlock_if(
            child_id=child.id,
            slug="approvals_10",
            condition_met=self._is_approval_threshold_reached(child.id, child.tenant_id, threshold=10),
        )
        self._unlock_if(
            child_id=child.id,
            slug="first_goal_reached",
            condition_met=self._is_first_goal_reached(child.id, child.tenant_id),
        )

    def _unlock_if(self, *, child_id: int, slug: str, condition_met: bool) -> None:
        if not condition_met:
            return

        achievement = self.db.scalar(select(Achievement).where(Achievement.slug == slug))
        if achievement is None:
            return

        existing = self.db.scalar(
            select(ChildAchievement).where(
                ChildAchievement.child_id == child_id,
                ChildAchievement.achievement_id == achievement.id,
            ),
        )
        if existing is not None:
            return

        self.db.add(
            ChildAchievement(
                child_id=child_id,
                achievement_id=achievement.id,
            ),
        )

    def _is_streak_threshold_reached(self, child_id: int, *, threshold: int) -> bool:
        streak = self.db.get(Streak, child_id)
        if streak is None:
            return False
        return streak.current >= threshold

    def _is_approval_threshold_reached(self, child_id: int, tenant_id: int, *, threshold: int) -> bool:
        approved_count = self.db.scalar(
            select(func.count(TaskLog.id)).where(
                TaskLog.child_id == child_id,
                TaskLog.tenant_id == tenant_id,
                TaskLog.status == TaskLogStatus.APPROVED,
            ),
        )
        return int(approved_count or 0) >= threshold

    def _is_first_goal_reached(self, child_id: int, tenant_id: int) -> bool:
        first_goal = self.db.scalar(
            select(SavingGoal)
            .where(
                SavingGoal.child_id == child_id,
                SavingGoal.tenant_id == tenant_id,
            )
            .order_by(SavingGoal.created_at.asc(), SavingGoal.id.asc()),
        )
        if first_goal is None:
            return False

        wallet = self.db.scalar(
            select(Wallet).where(
                Wallet.child_id == child_id,
                Wallet.tenant_id == tenant_id,
            ),
        )
        if wallet is None:
            return False

        transactions = self.db.scalars(
            select(LedgerTransaction)
            .where(
                LedgerTransaction.tenant_id == tenant_id,
                LedgerTransaction.wallet_id == wallet.id,
            )
            .order_by(LedgerTransaction.created_at.asc(), LedgerTransaction.id.asc()),
        ).all()

        saved_total = 0
        for tx in transactions:
            signed = signed_amount_cents(tx.type, tx.amount_cents)
            split = extract_pot_split(tx.metadata_json)
            save_amount = split.get("SAVE", 0)
            if save_amount == 0:
                continue
            saved_total += save_amount if signed >= 0 else -save_amount

        return saved_total >= first_goal.target_cents

    def _create_recommendation_if_missing(
        self,
        *,
        child_id: int,
        recommendation_type: str,
        title: str,
        body: str,
        severity: str,
    ) -> None:
        existing = self.db.scalar(
            select(Recommendation).where(
                Recommendation.child_id == child_id,
                Recommendation.type == recommendation_type,
                Recommendation.dismissed_at.is_(None),
            ),
        )
        if existing is not None:
            return

        self.db.add(
            Recommendation(
                child_id=child_id,
                type=recommendation_type,
                title=title,
                body=body,
                severity=severity,
            ),
        )

    def _rule_two_days_without_marks(self, *, child_id: int, tenant_id: int) -> None:
        today = date.today()
        start = today - timedelta(days=2)
        mark_count = self.db.scalar(
            select(func.count(TaskLog.id)).where(
                TaskLog.tenant_id == tenant_id,
                TaskLog.child_id == child_id,
                TaskLog.date >= start,
                TaskLog.date < today,
            ),
        )
        if (mark_count or 0) == 0:
            self._create_recommendation_if_missing(
                child_id=child_id,
                recommendation_type="NO_MARKS_2_DAYS",
                title="Sem rotina ha 2 dias",
                body="A crianca ficou dois dias sem marcar tarefas. Sugira uma rotina curta hoje.",
                severity="MEDIUM",
            )

    def _rule_many_rejections_same_task(self, *, child_id: int, tenant_id: int) -> None:
        start = date.today() - timedelta(days=14)
        rejected_task = self.db.scalar(
            select(TaskLog.task_id)
            .where(
                TaskLog.tenant_id == tenant_id,
                TaskLog.child_id == child_id,
                TaskLog.status == TaskLogStatus.REJECTED,
                TaskLog.date >= start,
            )
            .group_by(TaskLog.task_id)
            .having(func.count(TaskLog.id) >= 3)
            .order_by(func.count(TaskLog.id).desc()),
        )
        if rejected_task is not None:
            self._create_recommendation_if_missing(
                child_id=child_id,
                recommendation_type="MANY_REJECTIONS_SAME_TASK",
                title="Muitas rejeicoes na mesma tarefa",
                body="A mesma tarefa esta sendo rejeitada com frequencia. Revise dificuldade ou criterio.",
                severity="HIGH",
            )

    def _rule_active_goal_low_activity(self, *, child_id: int, tenant_id: int) -> None:
        has_goal = self.db.scalar(
            select(SavingGoal.id).where(
                SavingGoal.tenant_id == tenant_id,
                SavingGoal.child_id == child_id,
            ),
        )
        if has_goal is None:
            return

        start = date.today() - timedelta(days=7)
        approved_count = self.db.scalar(
            select(func.count(TaskLog.id)).where(
                and_(
                    TaskLog.tenant_id == tenant_id,
                    TaskLog.child_id == child_id,
                    TaskLog.status == TaskLogStatus.APPROVED,
                    TaskLog.date >= start,
                ),
            ),
        )
        if (approved_count or 0) < 2:
            self._create_recommendation_if_missing(
                child_id=child_id,
                recommendation_type="GOAL_LOW_ACTIVITY",
                title="Meta ativa com baixa atividade",
                body="Existe meta de economia ativa e pouca atividade recente. Sugira uma tarefa bonus.",
                severity="MEDIUM",
            )
