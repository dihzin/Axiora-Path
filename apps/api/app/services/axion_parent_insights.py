from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, UserAchievement
from app.services.axion_intelligence_v2 import compute_behavior_metrics, get_behavior_metrics
from app.services.learning_insights import get_learning_insights


@dataclass(slots=True)
class InsightSkillItem:
    skill_name: str
    subject_name: str
    explanation: str


@dataclass(slots=True)
class InsightCard:
    title: str
    summary: str
    tone: str


@dataclass(slots=True)
class ParentAxionInsightsSnapshot:
    learning_rhythm: InsightCard
    emotional_trend: InsightCard
    strength_skills: list[InsightSkillItem]
    reinforcement_skills: list[InsightSkillItem]
    dropout_risk: InsightCard
    suggested_parental_actions: list[str]


def _learning_rhythm_card(rhythm_score: float, inputs: dict[str, float | int]) -> InsightCard:
    active_days = int(inputs.get("activeDays7", 0))
    streak = int(inputs.get("streak", 0))
    if rhythm_score >= 0.75:
        return InsightCard(
            title="Ritmo de aprendizagem consistente",
            summary=f"Boa regularidade na semana (atividade em {active_days} dias e sequencia de {streak} dia(s)).",
            tone="positive",
        )
    if rhythm_score >= 0.45:
        return InsightCard(
            title="Ritmo em consolidacao",
            summary="A crianca esta avancando, mas ainda se beneficia de uma rotina curta e frequente.",
            tone="neutral",
        )
    return InsightCard(
        title="Ritmo em retomada",
        summary="Sinais de oscilacao no estudo. Pequenas sessoes diarias podem ajudar a recuperar constancia.",
        tone="attention",
    )


def _emotional_trend_card(frustration_score: float, confidence_score: float, momentum: float) -> InsightCard:
    if frustration_score >= 0.7:
        return InsightCard(
            title="Momento emocional sensivel",
            summary="Vale priorizar desafios leves e reforco positivo para preservar confianca.",
            tone="attention",
        )
    if confidence_score >= 0.75 and momentum > 0:
        return InsightCard(
            title="Confianca em alta",
            summary="A crianca responde bem aos desafios atuais e mostra boa evolucao recente.",
            tone="positive",
        )
    return InsightCard(
        title="Emocional equilibrado",
        summary="O aprendizado segue estavel, com espaco para variacoes leves de desafio.",
        tone="neutral",
    )


def _dropout_card(dropout_risk: float) -> InsightCard:
    if dropout_risk >= 0.7:
        return InsightCard(
            title="Engajamento pede atencao",
            summary="Ha sinais de afastamento da rotina. Uma meta curta hoje pode reativar o interesse.",
            tone="attention",
        )
    if dropout_risk >= 0.45:
        return InsightCard(
            title="Engajamento em observacao",
            summary="Sem risco alto, mas a consistencia ainda precisa de acompanhamento.",
            tone="neutral",
        )
    return InsightCard(
        title="Engajamento saudavel",
        summary="A crianca segue conectada com a trilha e tende a manter o progresso.",
        tone="positive",
    )


def _skill_strength_note(skill_name: str) -> str:
    return f"{skill_name} aparece como ponto forte no momento."


def _skill_reinforcement_note(skill_name: str) -> str:
    return f"{skill_name} pode ganhar reforco com revisoes curtas e frequentes."


def _recent_achievements(db: Session, *, user_id: int, limit: int = 3) -> list[str]:
    rows = db.execute(
        select(Achievement.title)
        .select_from(UserAchievement)
        .join(Achievement, Achievement.id == UserAchievement.achievement_id)
        .where(UserAchievement.user_id == user_id)
        .order_by(UserAchievement.unlocked_at.desc())
        .limit(limit)
    ).all()
    return [str(row[0]) for row in rows if row[0]]


def _build_parent_actions(
    *,
    rhythm_score: float,
    frustration_score: float,
    dropout_risk: float,
    achievements: list[str],
) -> list[str]:
    actions: list[str] = []
    if frustration_score >= 0.7:
        actions.append("Reserve 10 minutos para estudar junto e celebrar cada acerto.")
        actions.append("Prefira sessoes curtas com temas que a crianca ja domina.")
    if rhythm_score < 0.45:
        actions.append("Combine um horario fixo diario para uma licao curta.")
    if dropout_risk >= 0.6:
        actions.append("Ative uma meta de 1 licao hoje com pequena recompensa combinada.")
    if achievements:
        actions.append(f"Reconheca a conquista recente: {achievements[0]}.")
    if not actions:
        actions.append("Mantenha o apoio com check-ins curtos e elogios especificos.")
    return actions[:4]


def get_parent_axion_insights(
    db: Session,
    *,
    user_id: int,
) -> ParentAxionInsightsSnapshot:
    metrics = get_behavior_metrics(db, user_id=user_id)
    if metrics is None:
        metrics = compute_behavior_metrics(db, user_id=user_id)

    learning_snapshot = get_learning_insights(db, user_id=user_id)
    strengths = [
        InsightSkillItem(
            skill_name=item.skill_name,
            subject_name=item.subject_name,
            explanation=_skill_strength_note(item.skill_name),
        )
        for item in learning_snapshot.strongest_skills[:5]
    ]
    reinforcement = [
        InsightSkillItem(
            skill_name=item.skill_name,
            subject_name=item.subject_name,
            explanation=_skill_reinforcement_note(item.skill_name),
        )
        for item in learning_snapshot.practice_skills[:5]
    ]
    achievements = _recent_achievements(db, user_id=user_id)

    return ParentAxionInsightsSnapshot(
        learning_rhythm=_learning_rhythm_card(float(metrics.rhythm_score), metrics.inputs or {}),
        emotional_trend=_emotional_trend_card(
            float(metrics.frustration_score),
            float(metrics.confidence_score),
            float(metrics.learning_momentum),
        ),
        strength_skills=strengths,
        reinforcement_skills=reinforcement,
        dropout_risk=_dropout_card(float(metrics.dropout_risk)),
        suggested_parental_actions=_build_parent_actions(
            rhythm_score=float(metrics.rhythm_score),
            frustration_score=float(metrics.frustration_score),
            dropout_risk=float(metrics.dropout_risk),
            achievements=achievements,
        ),
    )
