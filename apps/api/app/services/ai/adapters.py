from __future__ import annotations

from dataclasses import dataclass

from app.models import EventLog, MoodType, Recommendation


@dataclass(slots=True)
class CoachContext:
    mode: str
    message: str | None
    events: list[EventLog]
    recommendations: list[Recommendation]
    last_mood: MoodType | None
    streak_current: int
    freeze_used_today: bool
    weekly_completion_rate: float
    active_saving_goals_count: int


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

        mood_messages = {
            MoodType.HAPPY: "Humor de hoje: feliz. Energia otima para manter a rotina.",
            MoodType.OK: "Humor de hoje: ok. Vamos com passos pequenos e consistentes.",
            MoodType.SAD: "Humor de hoje: triste. Foco em uma tarefa simples para ganhar tracao.",
            MoodType.ANGRY: "Humor de hoje: irritado. Comece por algo curto para aliviar a tensao.",
            MoodType.TIRED: "Humor de hoje: cansado. Priorize tarefas leves e pausas curtas.",
        }
        if context.last_mood is not None:
            reply_parts.append(mood_messages[context.last_mood])

        if marked == 0:
            reply_parts.append("Nao ha marcacoes recentes.")
        else:
            reply_parts.append(f"Foram {marked} marcacoes recentes, com {approved} aprovacoes e {rejected} rejeicoes.")

        if context.streak_current >= 30:
            reply_parts.append("Marco de streak: 30+ dias. Excelente consistencia.")
        elif context.streak_current >= 14:
            reply_parts.append("Marco de streak: 14+ dias. Muito bom progresso.")
        elif context.streak_current >= 7:
            reply_parts.append("Marco de streak: 7+ dias. Sequencia firme.")
        if context.freeze_used_today:
            reply_parts.append("Freeze usado hoje para proteger a sequencia.")

        reply_parts.append(f"Taxa de conclusao semanal: {context.weekly_completion_rate:.0f}%.")
        if context.active_saving_goals_count > 0:
            reply_parts.append(f"Metas de economia ativas: {context.active_saving_goals_count}.")

        if sorted_recs:
            top = sorted_recs[0]
            reply_parts.append(f"Prioridade atual: {top.title}.")

        if context.message:
            reply_parts.append(f"Mensagem recebida: {context.message.strip()[:120]}")

        actions: list[str] = []
        if context.weekly_completion_rate < 50:
            actions.append("Nudge: concluir ao menos 1 tarefa agora para subir a taxa semanal.")
        elif context.weekly_completion_rate < 80:
            actions.append("Nudge: manter 2 tarefas aprovadas hoje para encostar no alvo de 80%.")

        if context.last_mood in {MoodType.SAD, MoodType.ANGRY, MoodType.TIRED}:
            actions.append("Escolher a tarefa mais curta e finalizar em 10 minutos.")
        elif context.last_mood == MoodType.HAPPY:
            actions.append("Aproveitar o bom humor para tentar uma tarefa de maior peso.")

        if context.streak_current in {7, 14, 30}:
            actions.append("Celebrar o marco de streak e manter a mesma rotina amanha.")

        if marked == 0:
            actions.append("Marcar pelo menos 1 tarefa hoje.")
        if rejected >= 3:
            actions.append("Revisar criterios das tarefas com mais rejeicoes.")
        if approved > 0:
            actions.append("Manter tarefas aprovadas no mesmo horario para reforcar consistencia.")
        if sorted_recs:
            actions.extend([f"{item.title}" for item in sorted_recs[:2]])
        if context.active_saving_goals_count > 0:
            actions.append("Conectar a proxima tarefa a uma meta de economia ativa.")
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
