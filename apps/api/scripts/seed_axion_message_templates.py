from __future__ import annotations

import json
from collections import Counter

from sqlalchemy import text

from app.db.session import SessionLocal


CONTEXTS = [
    "child_tab",
    "before_learning",
    "after_learning",
    "games_tab",
    "wallet_tab",
]

TONES = ["CALM", "ENCOURAGE", "CHALLENGE", "CELEBRATE", "SUPPORT"]


def _pg_text_array(values: list[str]) -> str:
    escaped = [value.replace('"', '\\"') for value in values]
    return "{" + ",".join(f'"{item}"' for item in escaped) + "}"


def _tone(context_index: int, item_index: int) -> str:
    # Balanced deterministic distribution across contexts.
    return TONES[(context_index + item_index) % len(TONES)]


def _template(
    *,
    context: str,
    tone: str,
    text_value: str,
    condition: dict[str, object],
    tags: list[str],
    weight: int,
) -> dict[str, object]:
    return {
        "context": context,
        "tone": tone,
        "tags": tags,
        "conditions": condition,
        "text": text_value[:220],
        "weight": weight,
        "enabled": True,
    }


def _child_tab_templates(context: str, context_index: int) -> list[dict[str, object]]:
    data = [
        ("Você está com {{streak}} dias. Que tal manter o ritmo agora? || {{name}}, seu ritmo está vivo. Vamos para mais um passo?", {"streak": {"gte": 1}}, ["rhythm"]),
        ("Há {{dueReviews}} revisão(ões) te esperando. Faz uma rodada curta? || Revisar 3 minutos agora deixa a próxima lição mais leve.", {"dueReviews": {"gte": 1}}, ["review"]),
        ("{{name}}, foco em {{skill}} por 2 minutos já faz diferença. || Um passo curto em {{skill}} agora vale muito.", {}, ["focus"]),
        ("Seu ponto forte é {{strongSkill}}. Quer usar isso a favor hoje? || Você já manda bem em {{strongSkill}}. Vamos aproveitar essa confiança?", {"confidenceScore": {"gte": 0.55}}, ["strength"]),
        ("Energia em {{energy}}. Dá para encaixar um desafio rápido. || Com {{energy}} de energia, cabe uma missão curtinha.", {"energy": {"gte": 1}}, ["energy"]),
        ("{{name}}, sua trilha em {{unit}} está pronta para o próximo nó. || Seu mapa está te esperando em {{unit}}.", {}, ["path"]),
        ("Se {{skill}} travar, tudo bem: começamos fácil e avançamos juntos. || Sem pressa: um acerto por vez em {{skill}}.", {"frustrationScore": {"gte": 0.55}}, ["support"]),
        ("Quer fechar o dia com uma vitória rápida em {{lesson}}? || Uma missão curta em {{lesson}} e você encerra bem.", {}, ["closure"]),
        ("Seu ritmo da semana está crescendo. Vamos consolidar hoje? || Hoje é um ótimo dia para reforçar {{skill}}.", {"learningMomentum": {"gt": 0.03}}, ["momentum"]),
        ("{{name}}, quando você aparece, seu progresso responde. Bora? || Presença diária cria resultado. Vamos nessa.", {}, ["consistency"]),
        ("Você tem base para um desafio maior em {{lesson}}. || Topa subir um nível em {{lesson}} agora?", {"confidenceScore": {"gte": 0.75}}, ["challenge"]),
        ("{{dueReviews}} revisão(ões) hoje evitam acúmulo amanhã. || Limpar revisões agora deixa o caminho livre.", {"dueReviews": {"gte": 3}}, ["review_gate"]),
        ("Seu objetivo está perto: mais uma sessão curta. || Falta pouco para avançar de verdade.", {}, ["goal"]),
        ("Se pintar cansaço, fazemos uma sessão leve e eficiente. || Curto, calmo e produtivo: esse é o plano.", {"frustrationScore": {"gte": 0.65}}, ["calm"]),
        ("{{name}}, você já ganhou tração. Não para agora. || Seu progresso em {{skill}} está aparecendo.", {"learningMomentum": {"gt": 0.05}}, ["traction"]),
        ("Mini missão: 1 rodada e depois pausa. || Dois minutos com foco em {{skill}} e missão cumprida.", {}, ["micro"]),
    ]
    return [
        _template(
            context=context,
            tone=_tone(context_index, idx),
            text_value=text_value,
            condition=condition,
            tags=["axion", context, *tags],
            weight=1 + (idx % 3),
        )
        for idx, (text_value, condition, tags) in enumerate(data)
    ]


def _before_learning_templates(context: str, context_index: int) -> list[dict[str, object]]:
    data = [
        ("Antes de começar: aquecimento rápido em {{skill}}? || Vamos com 2 minutos de aquecimento em {{skill}}.", {}, ["warmup"]),
        ("Hoje sua prioridade é revisão: {{dueReviews}} pendente(s). || Revisão primeiro, avanço depois. Topa?", {"dueReviews": {"gte": 2}}, ["review"]),
        ("{{name}}, plano de hoje: curto e objetivo em {{lesson}}. || Sessão direta em {{lesson}} para ganhar ritmo.", {}, ["plan"]),
        ("Seu foco está bom para desafio em {{unit}}. || Bom momento para subir o nível em {{unit}}.", {"confidenceScore": {"gte": 0.75}}, ["challenge"]),
        ("Se o dia estiver pesado, vamos no modo leve. || Passos curtos hoje também contam muito.", {"frustrationScore": {"gte": 0.6}}, ["gentle"]),
        ("{{streak}} dia(s) de constância. Vamos proteger essa sequência. || Sua sequência merece mais um passo hoje.", {"streak": {"gte": 1}}, ["streak"]),
        ("Energia atual: {{energy}}. Cabe uma missão de 2 minutos. || Com {{energy}} de energia, a meta é simples e possível.", {"energy": {"gte": 1}}, ["energy"]),
        ("Sua melhor rota agora é {{skill}} + revisão curta. || Primeiro {{skill}}, depois revisão para fechar bem.", {"dueReviews": {"gte": 1}}, ["route"]),
        ("Você está perto de consolidar {{strongSkill}}. || Mais uma sessão e {{strongSkill}} fica ainda mais firme.", {"confidenceScore": {"gte": 0.65}}, ["strength"]),
        ("Começar agora reduz a pressão depois. || Uma sessão curta agora deixa o resto do dia mais leve.", {}, ["timing"]),
        ("Se {{skill}} travar, ajustamos a dificuldade com calma. || Vai no seu ritmo: consistência vence pressa.", {"frustrationScore": {"gte": 0.65}}, ["support"]),
        ("Meta de hoje: concluir uma sessão com foco. || Objetivo claro: uma sessão completa em {{lesson}}.", {}, ["objective"]),
        ("Seu momento está bom para ganhar XP limpo. || Você pode avançar com qualidade hoje.", {"learningMomentum": {"gt": 0.04}}, ["xp"]),
        ("Que tal começar por revisão e fechar com desafio? || Ordem inteligente: revisar, praticar, avançar.", {"dueReviews": {"gte": 1}}, ["strategy"]),
        ("Você está pronto para um bloco curto e eficiente. || Dois minutos agora valem muito no fim da semana.", {}, ["efficiency"]),
        ("Início leve, progresso forte: vamos? || Entrar em ação agora facilita o próximo passo.", {}, ["start"]),
    ]
    return [
        _template(
            context=context,
            tone=_tone(context_index, idx),
            text_value=text_value,
            condition=condition,
            tags=["axion", context, *tags],
            weight=1 + (idx % 3),
        )
        for idx, (text_value, condition, tags) in enumerate(data)
    ]


def _after_learning_templates(context: str, context_index: int) -> list[dict[str, object]]:
    data = [
        ("Boa sessão! Quer fechar com revisão curta? || Excelente bloco. Mais 2 minutos de revisão e fecha redondo.", {}, ["close"]),
        ("Seu avanço em {{skill}} foi consistente hoje. || {{name}}, progresso claro em {{skill}} nesta sessão.", {}, ["progress"]),
        ("Se sobrou energia, dá para fazer um desafio rápido. || Ainda há gás para mais uma rodada curta.", {"energy": {"gte": 2}}, ["extra"]),
        ("{{streak}} dia(s) em sequência: isso constrói resultado. || Sua constância está funcionando.", {"streak": {"gte": 1}}, ["streak"]),
        ("Hoje foi forte em {{strongSkill}}. Amanhã reforçamos {{skill}}. || Equilíbrio perfeito: força + reforço.", {"confidenceScore": {"gte": 0.6}}, ["balance"]),
        ("Se a sessão foi difícil, está tudo certo. Vamos simplificar a próxima. || Você não precisa correr: progresso é passo a passo.", {"frustrationScore": {"gte": 0.6}}, ["comfort"]),
        ("Ainda há {{dueReviews}} revisão(ões) para limpar. || Revisão pendente: 3 minutos resolvem boa parte.", {"dueReviews": {"gte": 1}}, ["review"]),
        ("Mandou bem em {{lesson}}. Quer salvar esse ritmo? || Um bloco curto agora mantém a curva de aprendizado.", {}, ["rhythm"]),
        ("Seu mapa em {{unit}} avançou hoje. || Mais uma sessão e você abre caminho novo em {{unit}}.", {}, ["map"]),
        ("Você está ganhando segurança em {{skill}}. || A base de {{skill}} está ficando firme.", {"confidenceScore": {"gte": 0.65}}, ["confidence"]),
        ("Hoje já contou. Amanhã seguimos com foco. || Encerramento inteligente: consistência acima de tudo.", {}, ["closure"]),
        ("Se quiser, faço um plano rápido para a próxima sessão. || Próximo passo sugerido: revisão leve + desafio curto.", {}, ["plan"]),
        ("Seu ritmo semanal está reagindo bem. || Curva da semana em alta: mantenha blocos curtos.", {"learningMomentum": {"gt": 0.03}}, ["momentum"]),
        ("Parabéns pela entrega de hoje. || Resultado de hoje: avanço com qualidade.", {}, ["celebrate"]),
        ("Uma pausa estratégica agora também é progresso. || Descansar bem ajuda seu próximo acerto.", {}, ["rest"]),
        ("Quer aproveitar e concluir uma micro missão? || Fechamento premium: missão curta e objetivo cumprido.", {}, ["mission"]),
    ]
    return [
        _template(
            context=context,
            tone=_tone(context_index, idx),
            text_value=text_value,
            condition=condition,
            tags=["axion", context, *tags],
            weight=1 + (idx % 3),
        )
        for idx, (text_value, condition, tags) in enumerate(data)
    ]


def _games_tab_templates(context: str, context_index: int) -> list[dict[str, object]]:
    data = [
        ("Jogo curto e estratégico para aquecer? || Uma partida rápida pode ligar seu foco.", {}, ["warmup"]),
        ("Se quiser variar, jogue 1 partida e volte para {{skill}}. || Pausa ativa: jogo breve e retorno ao estudo.", {}, ["balance"]),
        ("{{name}}, jogo com objetivo claro rende mais. || Defina meta da partida e execute.", {}, ["objective"]),
        ("Seu ritmo está bom para desafio tático. || Momento ideal para uma partida estratégica.", {"confidenceScore": {"gte": 0.7}}, ["challenge"]),
        ("Se estiver cansado, escolha modo leve. || Jogue curto, respire e mantenha o controle.", {"frustrationScore": {"gte": 0.6}}, ["calm"]),
        ("Uma vitória rápida pode elevar sua confiança. || Partida curta, foco alto, resultado claro.", {}, ["confidence"]),
        ("Depois da partida, fazemos 1 revisão em {{skill}}. || Feche o ciclo: jogar, revisar, avançar.", {}, ["loop"]),
        ("Use o jogo para treinar atenção e decisão. || Estratégia no jogo ajuda no aprendizado.", {}, ["transfer"]),
        ("Você está em {{streak}} dia(s) de constância. Jogo curto pode manter o ritmo. || Pausa inteligente sem quebrar sequência.", {"streak": {"gte": 1}}, ["streak"]),
        ("Hoje vale jogo rápido com foco em tomada de decisão. || Uma partida objetiva e pronto.", {}, ["decision"]),
        ("Se perdeu foco, 2 minutos de jogo podem resetar sua mente. || Reinício leve: partida curta e retorno.", {"frustrationScore": {"gte": 0.55}}, ["reset"]),
        ("Seu desempenho permite um modo mais desafiador. || Topa aumentar a dificuldade da partida?", {"confidenceScore": {"gte": 0.78}}, ["difficulty"]),
        ("Jogo bom é jogo com começo, meio e fim. || Faça uma rodada completa e encerre bem.", {}, ["completion"]),
        ("Partida curta agora, missão de estudo depois. || Sequência recomendada: jogo + revisão.", {}, ["sequence"]),
        ("Você está evoluindo em consistência. Use o jogo sem exagero. || Dose certa de jogo mantém seu ritmo forte.", {"rhythmScore": {"gte": 0.5}}, ["consistency"]),
        ("Quer uma pausa ativa sem perder o dia? || Uma partida estratégica resolve.", {}, ["active_break"]),
    ]
    return [
        _template(
            context=context,
            tone=_tone(context_index, idx),
            text_value=text_value,
            condition=condition,
            tags=["axion", context, *tags],
            weight=1 + (idx % 3),
        )
        for idx, (text_value, condition, tags) in enumerate(data)
    ]


def _wallet_tab_templates(context: str, context_index: int) -> list[dict[str, object]]:
    data = [
        ("Você tem {{coins}} moedas. Quer usar com estratégia? || Salvar uma parte hoje ajuda metas maiores.", {"coins": {"gte": 1}}, ["coins"]),
        ("Antes de gastar, uma missão curta pode render mais. || Faça uma lição rápida e volte com mais saldo.", {}, ["earn_first"]),
        ("Seu progresso em {{skill}} pode virar boas recompensas. || Aprender bem também melhora suas escolhas na loja.", {}, ["link_learning"]),
        ("Use as moedas com plano: guardar, gastar e comparar. || Decisão inteligente hoje evita arrependimento depois.", {}, ["planning"]),
        ("{{name}}, sua sequência de {{streak}} dia(s) merece decisão consciente. || Consistência no estudo, inteligência no uso das moedas.", {"streak": {"gte": 1}}, ["streak"]),
        ("Se faltar motivação, abra uma micro missão antes da compra. || 2 minutos de foco podem liberar mais ganhos.", {}, ["micro"]),
        ("Quer acelerar? Conclua uma sessão e volte para a loja. || Estudo curto agora, escolha melhor depois.", {}, ["flow"]),
        ("Você está indo bem em {{strongSkill}}. Invista moedas com calma. || Boa fase para decidir sem pressa.", {"confidenceScore": {"gte": 0.65}}, ["confidence"]),
        ("Revisão pendente também ajuda seu saldo no longo prazo. || Limpar {{dueReviews}} revisão(ões) fortalece sua evolução.", {"dueReviews": {"gte": 1}}, ["review"]),
        ("Pense em objetivo: o que você quer conquistar com suas moedas? || Meta clara = decisão melhor.", {}, ["goal"]),
        ("Hoje vale economizar parte e seguir o plano. || Guardar um pouco agora dá mais liberdade depois.", {"coins": {"gte": 5}}, ["save"]),
        ("Sua carteira cresce quando seu ritmo cresce. || Mantenha o foco em {{lesson}} e colha resultado.", {}, ["momentum"]),
        ("Uma compra boa combina com progresso real. || Avance em {{unit}} e depois decida.", {}, ["timing"]),
        ("Sem pressa para gastar: escolha com intenção. || Decisão tranquila costuma ser decisão melhor.", {}, ["calm"]),
        ("Você está a um passo de destravar mais valor. || Sessão curta agora, decisão inteligente depois.", {}, ["next_step"]),
        ("Quer dica prática? Primeiro missão, depois loja. || Essa ordem costuma render mais.", {}, ["coach"]),
    ]
    return [
        _template(
            context=context,
            tone=_tone(context_index, idx),
            text_value=text_value,
            condition=condition,
            tags=["axion", context, *tags],
            weight=1 + (idx % 3),
        )
        for idx, (text_value, condition, tags) in enumerate(data)
    ]


def _template_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    builders = [
        _child_tab_templates,
        _before_learning_templates,
        _after_learning_templates,
        _games_tab_templates,
        _wallet_tab_templates,
    ]
    for index, context in enumerate(CONTEXTS):
        rows.extend(builders[index](context, index))
    return rows


def run_seed() -> None:
    rows = _template_rows()
    inserted = 0
    updated = 0

    with SessionLocal() as db:
        for item in rows:
            existing_id = db.execute(
                text(
                    """
                    SELECT id
                    FROM axion_message_templates
                    WHERE context = :context
                      AND tone = CAST(:tone AS axion_message_tone)
                      AND COALESCE(text, template_text) = :text
                    """
                ),
                {
                    "context": item["context"],
                    "tone": item["tone"],
                    "text": item["text"],
                },
            ).scalar_one_or_none()

            payload = {
                "context": item["context"],
                "tone": item["tone"],
                "tags": _pg_text_array(list(item["tags"])),
                "conditions": json.dumps(item["conditions"], ensure_ascii=False),
                "condition": json.dumps(item["conditions"], ensure_ascii=False),
                "text": item["text"],
                "template_text": item["text"],
                "weight": int(item["weight"]),
                "enabled": bool(item["enabled"]),
            }

            if existing_id is None:
                db.execute(
                    text(
                        """
                        INSERT INTO axion_message_templates
                            (context, tone, tags, conditions, condition, text, template_text, weight, enabled)
                        VALUES
                            (
                                :context,
                                CAST(:tone AS axion_message_tone),
                                CAST(:tags AS text[]),
                                CAST(:conditions AS jsonb),
                                CAST(:condition AS jsonb),
                                :text,
                                :template_text,
                                :weight,
                                :enabled
                            )
                        """
                    ),
                    payload,
                )
                inserted += 1
            else:
                db.execute(
                    text(
                        """
                        UPDATE axion_message_templates
                        SET
                            tags = CAST(:tags AS text[]),
                            conditions = CAST(:conditions AS jsonb),
                            condition = CAST(:condition AS jsonb),
                            template_text = :template_text,
                            weight = :weight,
                            enabled = :enabled
                        WHERE id = :id
                        """
                    ),
                    {**payload, "id": int(existing_id)},
                )
                updated += 1

        db.commit()

    per_context = Counter(str(item["context"]) for item in rows)
    per_tone = Counter(str(item["tone"]) for item in rows)

    print("=== AXION MESSAGE TEMPLATES SEED RESULT ===")
    print(f"inserted: {inserted}")
    print(f"updated: {updated}")
    print(f"total_templates_target: {len(rows)}")
    print(f"per_context: {dict(per_context)}")
    print(f"per_tone: {dict(per_tone)}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
