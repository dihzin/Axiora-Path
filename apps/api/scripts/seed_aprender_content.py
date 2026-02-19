from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select, text

from app.db.session import SessionLocal
from app.models import (
    Lesson,
    LessonContent,
    LessonContentType,
    LessonDifficulty,
    LessonType,
    Unit,
)


@dataclass(frozen=True)
class SubjectSeed:
    age_group: str
    name: str
    icon: str
    color: str
    order: int


@dataclass(frozen=True)
class UnitBlueprint:
    title: str
    description: str
    motivational_subtitle: str


AGE_GROUPS: tuple[str, ...] = ("6-8", "9-12", "13-15")

SUBJECTS_BY_AGE: dict[str, list[tuple[str, str, str]]] = {
    "6-8": [
        ("Matemática", "calculator", "#22C55E"),
        ("Português", "book-open", "#0EA5E9"),
        ("Ciências", "leaf", "#F59E0B"),
        ("Educação Financeira", "piggy-bank", "#F97316"),
    ],
    "9-12": [
        ("Matemática", "function-square", "#10B981"),
        ("Português", "pen-tool", "#3B82F6"),
        ("Inglês", "languages", "#F97316"),
        ("Educação Financeira", "wallet", "#D97706"),
    ],
    "13-15": [
        ("Matemática", "sigma", "#059669"),
        ("Português", "scroll-text", "#2563EB"),
        ("Inglês", "globe-2", "#EA580C"),
        ("Educação Financeira", "line-chart", "#B45309"),
    ],
}

UNIT_LIBRARY: dict[str, list[UnitBlueprint]] = {
    "Matemática": [
        UnitBlueprint("Fundamentos Numéricos", "Reconhecer padrões, sequências e relações entre números.", "Cada número entendido vira uma chave para novos desafios."),
        UnitBlueprint("Operações com Estratégia", "Praticar adição, subtração, multiplicação e divisão em situações reais.", "Pensar antes de calcular torna você mais rápido e confiante."),
        UnitBlueprint("Frações e Partes do Todo", "Explorar frações, equivalências e representações visuais.", "Dividir com lógica ajuda a resolver problemas do dia a dia."),
        UnitBlueprint("Geometria em Movimento", "Identificar formas, ângulos e propriedades geométricas no cotidiano.", "Seu olhar matemático está ficando cada vez mais afiado."),
        UnitBlueprint("Medidas e Grandezas", "Relacionar tempo, massa, comprimento e capacidade com contextos práticos.", "Medir bem é tomar decisões com mais precisão."),
        UnitBlueprint("Expressões e Padrões", "Construir raciocínio algébrico com padrões e expressões.", "Quando você encontra o padrão, o desafio fica mais simples."),
        UnitBlueprint("Resolução de Problemas", "Aplicar etapas de leitura, estratégia e conferência de resultados.", "Errar, revisar e tentar de novo acelera seu aprendizado."),
        UnitBlueprint("Dados e Probabilidade", "Interpretar gráficos, tabelas e noções iniciais de chance.", "Você está treinando o pensamento de quem analisa o mundo com dados."),
        UnitBlueprint("Projeto Matemático", "Integrar conteúdos para resolver missões completas e contextualizadas.", "Chegou a hora de mostrar seu poder matemático em ação."),
    ],
    "Português": [
        UnitBlueprint("Leitura Atenta", "Desenvolver compreensão de textos curtos e identificação de ideias centrais.", "Ler com atenção faz sua imaginação e seu raciocínio crescerem."),
        UnitBlueprint("Palavras e Significados", "Ampliar vocabulário com contexto, sinônimos e antônimos.", "Cada palavra nova amplia suas formas de se expressar."),
        UnitBlueprint("Frases e Pontuação", "Construir frases claras usando pontuação adequada.", "Uma frase bem escrita transmite sua ideia com força."),
        UnitBlueprint("Gêneros Textuais", "Reconhecer características de narrativas, bilhetes, notícias e poemas.", "Você está aprendendo a linguagem certa para cada situação."),
        UnitBlueprint("Gramática em Uso", "Aplicar classes gramaticais em situações de produção textual.", "Gramática é ferramenta para comunicar melhor."),
        UnitBlueprint("Interpretação Profunda", "Relacionar informações explícitas e implícitas em textos diversos.", "Perceber detalhes transforma você em leitor estratégico."),
        UnitBlueprint("Produção Escrita", "Planejar, escrever e revisar textos com começo, meio e fim.", "Seu texto ganha vida quando você revisa com calma."),
        UnitBlueprint("Argumentação e Opinião", "Defender ideias com exemplos e argumentos consistentes.", "Sua voz fica mais forte quando vem com bons argumentos."),
        UnitBlueprint("Projeto de Comunicação", "Produzir textos finais conectando leitura, gramática e criatividade.", "Você está pronto para comunicar com clareza e propósito."),
    ],
    "Ciências": [
        UnitBlueprint("Observando a Natureza", "Explorar seres vivos, ambientes e ciclos naturais.", "A curiosidade científica começa quando você observa com cuidado."),
        UnitBlueprint("Corpo Humano e Saúde", "Compreender sistemas do corpo e hábitos saudáveis.", "Conhecer seu corpo é cuidar melhor de você."),
        UnitBlueprint("Matéria e Transformações", "Investigar estados físicos e mudanças da matéria.", "Pequenas experiências revelam grandes descobertas."),
        UnitBlueprint("Energia no Cotidiano", "Identificar fontes de energia e usos responsáveis.", "Usar energia com consciência é atitude de futuro."),
        UnitBlueprint("Terra e Universo", "Estudar fenômenos da Terra, clima e sistema solar.", "Olhar para o céu também ensina sobre a vida na Terra."),
        UnitBlueprint("Ecossistemas e Sustentabilidade", "Relacionar cadeias alimentares, equilíbrio ambiental e impactos humanos.", "Cada escolha consciente ajuda a proteger o planeta."),
        UnitBlueprint("Método Científico", "Formular hipóteses, testar ideias e analisar resultados.", "Testar, registrar e concluir: você pensa como cientista."),
        UnitBlueprint("Tecnologia e Sociedade", "Analisar como ciência e tecnologia afetam a vida diária.", "Ciência aplicada transforma problemas em soluções."),
        UnitBlueprint("Projeto Investigativo", "Conduzir missão científica com perguntas, evidências e conclusão.", "Seu projeto mostra que aprender ciência é agir no mundo."),
    ],
    "Inglês": [
        UnitBlueprint("Hello World", "Aprender cumprimentos, apresentações e expressões básicas.", "Cada palavra em inglês abre uma nova porta."),
        UnitBlueprint("My Routine", "Descrever rotina, horários e atividades frequentes.", "Falar sobre seu dia é um ótimo treino de fluência."),
        UnitBlueprint("Places and Directions", "Usar vocabulário de lugares e orientações.", "Você já está se comunicando em contextos reais."),
        UnitBlueprint("Food and Shopping", "Praticar inglês em situações de compra, cardápio e escolhas.", "Aprender com situações reais torna tudo mais natural."),
        UnitBlueprint("Reading for Meaning", "Ler textos curtos e identificar informações principais.", "Entender textos em inglês aumenta sua autonomia."),
        UnitBlueprint("Grammar in Context", "Aplicar estruturas gramaticais em frases úteis.", "Gramática com contexto torna o idioma vivo."),
        UnitBlueprint("Listening and Speaking", "Treinar compreensão oral e resposta rápida.", "Ouvir com atenção melhora sua pronúncia e confiança."),
        UnitBlueprint("Projects and Dialogues", "Criar diálogos e miniapresentações em inglês.", "Praticar em voz alta acelera seu progresso."),
        UnitBlueprint("Global Communication", "Integrar leitura, escrita, escuta e fala em desafios completos.", "Você está pronto para se comunicar além das fronteiras."),
    ],
    "Educação Financeira": [
        UnitBlueprint("Dinheiro e Escolhas", "Entender valor do dinheiro e decisões de consumo.", "Escolhas conscientes hoje constroem resultados amanhã."),
        UnitBlueprint("Planejamento de Gastos", "Organizar prioridades e diferenciar necessidade de desejo.", "Planejar antes de gastar é superpoder financeiro."),
        UnitBlueprint("Poupar com Objetivo", "Criar metas e estratégias de economia.", "Guardar um pouco por vez leva você mais longe."),
        UnitBlueprint("Consumo Inteligente", "Comparar preços, qualidade e custo-benefício.", "Pesquisar antes de comprar evita arrependimentos."),
        UnitBlueprint("Orçamento Pessoal", "Montar orçamento simples com entradas e saídas.", "Quem controla o orçamento controla melhor o futuro."),
        UnitBlueprint("Riscos e Decisões", "Avaliar riscos, impulsos e consequências financeiras.", "Decidir com calma protege seu dinheiro."),
        UnitBlueprint("Empreendedorismo Criativo", "Explorar ideias de geração de valor com responsabilidade.", "Criatividade e planejamento andam juntos no empreendedorismo."),
        UnitBlueprint("Cidadania Financeira", "Relacionar finanças com ética, comunidade e sustentabilidade.", "Boas decisões financeiras também ajudam o coletivo."),
        UnitBlueprint("Projeto de Vida Financeiro", "Conectar hábitos, metas e estratégia de longo prazo.", "Você está construindo uma mentalidade financeira forte."),
    ],
}


def _build_subjects() -> list[SubjectSeed]:
    out: list[SubjectSeed] = []
    for age_group in AGE_GROUPS:
        subject_rows = SUBJECTS_BY_AGE[age_group]
        for order, (name, icon, color) in enumerate(subject_rows, start=1):
            out.append(
                SubjectSeed(
                    age_group=age_group,
                    name=name,
                    icon=icon,
                    color=color,
                    order=order,
                )
            )
    return out


SUBJECTS = _build_subjects()


def _difficulty_for(*, age_group: str, unit_order: int, lesson_order: int) -> LessonDifficulty:
    if age_group == "6-8":
        return LessonDifficulty.EASY if unit_order <= 6 else LessonDifficulty.MEDIUM
    if age_group == "9-12":
        if unit_order <= 3:
            return LessonDifficulty.EASY
        if unit_order <= 7:
            return LessonDifficulty.MEDIUM
        return LessonDifficulty.HARD if lesson_order >= 4 else LessonDifficulty.MEDIUM
    if unit_order <= 2:
        return LessonDifficulty.MEDIUM
    return LessonDifficulty.HARD


def _age_tone(age_group: str) -> str:
    if age_group == "6-8":
        return "de forma lúdica, com exemplos simples da rotina da criança"
    if age_group == "9-12":
        return "com desafios progressivos e conexão com escola, casa e comunidade"
    return "com contexto real, pensamento crítico e autonomia para decisões"


def _lesson_blueprint(
    *,
    subject_name: str,
    age_group: str,
    unit_title: str,
    unit_description: str,
    motivational_subtitle: str,
    unit_order: int,
    lesson_order: int,
) -> tuple[str, int, LessonType, LessonDifficulty, list[tuple[LessonContentType, dict[str, object], int]]]:
    difficulty = _difficulty_for(age_group=age_group, unit_order=unit_order, lesson_order=lesson_order)
    xp_reward = 18 + (unit_order * 4) + (lesson_order * 2)
    tone = _age_tone(age_group)

    if lesson_order == 1:
        title = f"História de Missão: {unit_title}"
        contents = [
            (
                LessonContentType.TEXT,
                {
                    "title": f"Axion apresenta {unit_title}",
                    "body": (
                        f"Nesta missão de {subject_name}, você vai aprender {tone}. "
                        f"{unit_description} Vamos juntos com calma e curiosidade."
                    ),
                    "subtitle": motivational_subtitle,
                },
                1,
            ),
            (
                LessonContentType.IMAGE,
                {
                    "title": "Cena da missão",
                    "illustrationUrl": "/axiora/moods/happy.svg",
                    "body": "Observe os elementos da cena e conte o que ajudaria Axion a resolver o desafio.",
                },
                2,
            ),
        ]
        return title, xp_reward, LessonType.STORY, difficulty, contents

    if lesson_order == 2:
        title = f"Escolha Certa: {unit_title}"
        contents = [
            (
                LessonContentType.QUESTION,
                {
                    "prompt": f"Em {subject_name}, qual atitude leva ao melhor resultado nesta missão?",
                    "options": [
                        {"id": "a", "label": "Ler com atenção e resolver por etapas"},
                        {"id": "b", "label": "Responder rápido sem revisar"},
                        {"id": "c", "label": "Parar na primeira dificuldade"},
                    ],
                    "correctOptionId": "a",
                },
                1,
            ),
            (
                LessonContentType.TEXT,
                {
                    "title": "Dica de progresso",
                    "body": "Você evolui mais quando observa, testa e confere sua resposta.",
                },
                2,
            ),
        ]
        return title, xp_reward, LessonType.MULTIPLE_CHOICE, difficulty, contents

    if lesson_order == 3:
        title = f"Conexões em Ação: {unit_title}"
        contents = [
            (
                LessonContentType.QUESTION,
                {
                    "variant": "DRAG_DROP",
                    "prompt": "Arraste cada situação para a estratégia mais adequada.",
                    "pairs": [
                        {"itemId": "i1", "itemLabel": "Problema novo", "targetId": "t1", "targetLabel": "Observar e planejar"},
                        {"itemId": "i2", "itemLabel": "Resultado errado", "targetId": "t2", "targetLabel": "Revisar e ajustar"},
                        {"itemId": "i3", "itemLabel": "Dúvida no meio", "targetId": "t3", "targetLabel": "Pedir ajuda e continuar"},
                    ],
                },
                1,
            ),
        ]
        return title, xp_reward, LessonType.DRAG_DROP, difficulty, contents

    if lesson_order == 4:
        title = f"Desafio Interativo: {unit_title}"
        contents = [
            (
                LessonContentType.IMAGE,
                {
                    "mode": "IMAGE_SELECTION",
                    "prompt": f"Qual cena representa uma boa decisão em {subject_name}?",
                    "options": [
                        {"id": "a", "label": "Planejamento", "imageUrl": "/axiora/moods/happy.svg"},
                        {"id": "b", "label": "Impulso", "imageUrl": "/axiora/moods/angry.svg"},
                        {"id": "c", "label": "Desânimo", "imageUrl": "/axiora/moods/sad.svg"},
                    ],
                    "correctOptionId": "a",
                },
                1,
            ),
            (
                LessonContentType.TEXT,
                {
                    "title": "Feedback positivo",
                    "body": "Excelente! Escolhas conscientes ajudam você a aprender com segurança e autonomia.",
                },
                2,
            ),
        ]
        return title, xp_reward, LessonType.INTERACTIVE, difficulty, contents

    title = f"Checkpoint da Unidade: {unit_title}"
    contents = [
        (
            LessonContentType.QUESTION,
            {
                "prompt": f"Qual resumo melhor representa o objetivo desta unidade de {subject_name}?",
                "options": [
                    {"id": "a", "label": "Aplicar o conteúdo em situações reais"},
                    {"id": "b", "label": "Memorizar sem contexto"},
                    {"id": "c", "label": "Evitar novos desafios"},
                ],
                "correctOptionId": "a",
            },
            1,
        ),
        (
            LessonContentType.TEXT,
            {
                "title": "Parabéns, missão concluída",
                "body": (
                    f"Você concluiu {unit_title} com evolução consistente. "
                    "Continue praticando: seu progresso está cada vez mais forte."
                ),
            },
            2,
        ),
    ]
    return title, xp_reward + 4, LessonType.MULTIPLE_CHOICE, difficulty, contents


def _get_or_create_subject(*, seed: SubjectSeed) -> int:
    with SessionLocal() as db:
        subject_id = db.scalar(
            text(
                """
                SELECT id
                FROM subjects
                WHERE age_group = :age_group
                  AND "order" = :order
                LIMIT 1
                """
            ),
            {"age_group": seed.age_group, "order": seed.order},
        )
        if subject_id is None:
            subject_id = db.scalar(
                text(
                    """
                    INSERT INTO subjects (name, age_group, icon, color, "order")
                    VALUES (:name, :age_group, :icon, :color, :order)
                    RETURNING id
                    """
                ),
                {
                    "name": seed.name,
                    "age_group": seed.age_group,
                    "icon": seed.icon,
                    "color": seed.color,
                    "order": seed.order,
                },
            )
        else:
            db.execute(
                text(
                    """
                    UPDATE subjects
                    SET name = :name,
                        icon = :icon,
                        color = :color,
                        "order" = :order
                    WHERE id = :id
                    """
                ),
                {
                    "id": int(subject_id),
                    "name": seed.name,
                    "icon": seed.icon,
                    "color": seed.color,
                    "order": seed.order,
                },
            )
        db.commit()
        return int(subject_id)


def _upsert_content() -> None:
    created_subjects = 0
    created_units = 0
    created_lessons = 0
    created_contents = 0

    for subject_seed in SUBJECTS:
        subject_id = _get_or_create_subject(seed=subject_seed)
        unit_library = UNIT_LIBRARY[subject_seed.name]
        created_subjects += 1

        with SessionLocal() as db:
            for unit_order, unit_blueprint in enumerate(unit_library, start=1):
                title = (
                    f"Missão {unit_order}: {unit_blueprint.title}"
                    if subject_seed.age_group == "6-8"
                    else f"Unidade {unit_order}: {unit_blueprint.title}"
                )
                description = (
                    f"{unit_blueprint.description} "
                    f"Motivação: {unit_blueprint.motivational_subtitle}"
                )

                unit = db.scalar(
                    select(Unit).where(
                        Unit.subject_id == subject_id,
                        Unit.order == unit_order,
                    )
                )
                if unit is None:
                    unit = Unit(
                        subject_id=subject_id,
                        title=title,
                        description=description,
                        order=unit_order,
                        required_level=max(1, unit_order),
                    )
                    db.add(unit)
                    db.flush()
                else:
                    unit.title = title
                    unit.description = description
                    unit.required_level = max(1, unit_order)
                created_units += 1

                for lesson_order in range(1, 6):
                    lesson_title, xp_reward, lesson_type, difficulty, lesson_contents = _lesson_blueprint(
                        subject_name=subject_seed.name,
                        age_group=subject_seed.age_group,
                        unit_title=title,
                        unit_description=unit_blueprint.description,
                        motivational_subtitle=unit_blueprint.motivational_subtitle,
                        unit_order=unit_order,
                        lesson_order=lesson_order,
                    )

                    lesson = db.scalar(
                        select(Lesson).where(
                            Lesson.unit_id == unit.id,
                            Lesson.order == lesson_order,
                        )
                    )
                    if lesson is None:
                        lesson = Lesson(
                            unit_id=unit.id,
                            title=lesson_title,
                            order=lesson_order,
                            xp_reward=xp_reward,
                            difficulty=difficulty,
                            type=lesson_type,
                        )
                        db.add(lesson)
                        db.flush()
                    else:
                        lesson.title = lesson_title
                        lesson.xp_reward = xp_reward
                        lesson.type = lesson_type
                        lesson.difficulty = difficulty
                    created_lessons += 1

                    db.execute(delete(LessonContent).where(LessonContent.lesson_id == lesson.id))
                    for content_type, content_data, content_order in lesson_contents:
                        db.add(
                            LessonContent(
                                lesson_id=lesson.id,
                                content_type=content_type,
                                content_data=content_data,
                                order=content_order,
                            )
                        )
                        created_contents += 1

            db.commit()

    print("=== APRENDER LARGE CURRICULUM SEED RESULT ===")
    print(f"subjects_processed: {created_subjects}")
    print(f"units_processed: {created_units}")
    print(f"lessons_processed: {created_lessons}")
    print(f"lesson_contents_inserted: {created_contents}")


def main() -> None:
    _upsert_content()


if __name__ == "__main__":
    main()
