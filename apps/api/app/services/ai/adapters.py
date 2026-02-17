from __future__ import annotations

from dataclasses import dataclass

from app.models import EventLog, Recommendation


@dataclass(slots=True)
class CoachContext:
    mode: str
    message: str | None
    events: list[EventLog]
    recommendations: list[Recommendation]


@dataclass(slots=True)
class CoachResult:
    reply: str
    suggested_actions: list[str]
    tone: str


class CoachAdapter:
    def generate(self, context: CoachContext) -> CoachResult:
        raise NotImplementedError


class RuleBasedCoachAdapter(CoachAdapter):
    SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

    def generate(self, context: CoachContext) -> CoachResult:
        approved = sum(1 for item in context.events if item.type == "routine.approved")
        rejected = sum(1 for item in context.events if item.type == "routine.rejected")
        marked = sum(1 for item in context.events if item.type == "routine.marked")

        sorted_recs = sorted(
            context.recommendations,
            key=lambda item: (self.SEVERITY_ORDER.get(item.severity, 99), item.created_at, item.id),
        )

        tone = "playful" if context.mode == "CHILD" else "supportive"

        reply_parts: list[str] = []
        if context.mode == "CHILD":
            reply_parts.append("Vamos manter o ritmo hoje.")
        else:
            reply_parts.append("Aqui vai um resumo objetivo para apoiar a rotina.")

        if marked == 0:
            reply_parts.append("Nao ha marcacoes recentes.")
        else:
            reply_parts.append(f"Foram {marked} marcacoes recentes, com {approved} aprovacoes e {rejected} rejeicoes.")

        if sorted_recs:
            top = sorted_recs[0]
            reply_parts.append(f"Prioridade atual: {top.title}.")

        if context.message:
            reply_parts.append(f"Mensagem recebida: {context.message.strip()[:120]}")

        actions: list[str] = []
        if marked == 0:
            actions.append("Marcar pelo menos 1 tarefa hoje.")
        if rejected >= 3:
            actions.append("Revisar criterios das tarefas com mais rejeicoes.")
        if approved > 0:
            actions.append("Manter tarefas aprovadas no mesmo horario para reforcar consistencia.")
        if sorted_recs:
            actions.extend([f"{item.title}" for item in sorted_recs[:2]])
        if not actions:
            actions.append("Continuar rotina atual e reavaliar amanha.")

        deduped_actions: list[str] = []
        seen: set[str] = set()
        for action in actions:
            if action in seen:
                continue
            seen.add(action)
            deduped_actions.append(action)

        return CoachResult(
            reply=" ".join(reply_parts),
            suggested_actions=deduped_actions[:5],
            tone=tone,
        )

