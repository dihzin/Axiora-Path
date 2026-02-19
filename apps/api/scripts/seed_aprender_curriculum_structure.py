from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text

from app.db.session import SessionLocal


@dataclass(frozen=True)
class SubjectSeed:
    age_group: str
    order: int
    name: str
    icon: str
    color: str


@dataclass(frozen=True)
class SkillSeed:
    order: int
    name: str
    description: str


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
        ("Inglês", "languages", "#FB923C"),
        ("Educação Financeira", "wallet", "#D97706"),
    ],
    "13-15": [
        ("Matemática", "sigma", "#059669"),
        ("Português", "scroll-text", "#2563EB"),
        ("Inglês", "globe-2", "#EA580C"),
        ("Educação Financeira", "line-chart", "#B45309"),
    ],
}

UNITS_PER_SUBJECT = 10  # 8-12 requerido; 10 garante 120+ units no total
LESSONS_PER_UNIT = 6  # 5-8 requerido

WEIGHTS_BY_COUNT: dict[int, list[float]] = {
    2: [0.650, 0.350],
    3: [0.500, 0.300, 0.200],
    4: [0.400, 0.300, 0.200, 0.100],
}


SKILLS_BY_SUBJECT: dict[str, list[tuple[str, str]]] = {
    "Matemática": [
        ("Raciocínio Numérico", "Compreender números, comparações e sequências de forma progressiva."),
        ("Operações Fundamentais", "Resolver adição, subtração, multiplicação e divisão com estratégia."),
        ("Resolução de Problemas", "Interpretar enunciados e escolher métodos eficientes."),
        ("Frações e Proporções", "Relacionar partes, equivalências e proporções em contextos reais."),
        ("Geometria e Espaço", "Reconhecer formas, ângulos e relações espaciais."),
        ("Medidas e Grandezas", "Aplicar tempo, comprimento, massa e capacidade em situações cotidianas."),
        ("Álgebra Inicial", "Modelar padrões e expressões com linguagem matemática."),
        ("Leitura de Dados", "Interpretar tabelas, gráficos e informações quantitativas."),
        ("Pensamento Lógico", "Construir argumentos coerentes e validar resultados."),
        ("Aplicação Prática", "Usar matemática em decisões escolares, domésticas e sociais."),
    ],
    "Português": [
        ("Compreensão Leitora", "Identificar ideias centrais e informações implícitas em textos."),
        ("Vocabulário em Contexto", "Ampliar repertório lexical e uso adequado das palavras."),
        ("Ortografia e Acentuação", "Aplicar convenções ortográficas em escrita consciente."),
        ("Gramática Funcional", "Usar classes gramaticais para comunicar com clareza."),
        ("Coesão e Coerência", "Organizar textos com lógica e continuidade de ideias."),
        ("Interpretação Crítica", "Analisar intencionalidade e argumentos em diferentes gêneros."),
        ("Produção Textual", "Planejar, redigir e revisar textos com propósito."),
        ("Oralidade e Escuta", "Expressar opiniões e escutar com atenção e respeito."),
        ("Gêneros Textuais", "Reconhecer estruturas e finalidades de múltiplos gêneros."),
        ("Comunicação Criativa", "Produzir mensagens claras, criativas e contextualizadas."),
    ],
    "Ciências": [
        ("Observação Científica", "Investigar fenômenos por observação e registro."),
        ("Seres Vivos e Ecossistemas", "Relacionar organismos, ambientes e equilíbrio ecológico."),
        ("Corpo Humano e Saúde", "Compreender hábitos saudáveis e funcionamento do corpo."),
        ("Matéria e Transformações", "Analisar estados físicos e mudanças da matéria."),
        ("Energia e Movimento", "Identificar fontes de energia e transformações."),
        ("Terra e Universo", "Compreender clima, ciclos naturais e sistema solar."),
        ("Método Científico", "Formular hipóteses, testar e concluir com evidências."),
        ("Tecnologia e Sociedade", "Conectar avanços científicos ao cotidiano."),
        ("Sustentabilidade", "Avaliar impacto ambiental e decisões responsáveis."),
        ("Projeto Investigativo", "Integrar conteúdos em missões científicas práticas."),
    ],
    "Inglês": [
        ("Vocabulário Básico", "Construir repertório para contextos pessoais e escolares."),
        ("Leitura em Inglês", "Compreender textos curtos e mensagens do dia a dia."),
        ("Listening", "Desenvolver escuta ativa em diálogos e áudios simples."),
        ("Speaking", "Praticar fala com pronúncia funcional e confiança."),
        ("Grammar in Use", "Aplicar gramática em situações reais de comunicação."),
        ("Writing", "Escrever frases e pequenos textos com clareza."),
        ("Everyday Communication", "Usar inglês em rotinas, compras e deslocamentos."),
        ("Interpretation", "Interpretar contexto, intenção e informações implícitas."),
        ("Collaborative Dialogue", "Interagir em pares com respeito e cooperação."),
        ("Global Citizenship", "Conectar inglês a cultura, tecnologia e mundo global."),
    ],
    "Educação Financeira": [
        ("Consciência de Valor", "Entender valor do dinheiro e impacto das escolhas."),
        ("Planejamento de Gastos", "Organizar prioridades entre necessidade e desejo."),
        ("Hábito de Poupar", "Criar rotina de economia com metas alcançáveis."),
        ("Orçamento Pessoal", "Controlar entradas e saídas de forma simples."),
        ("Consumo Inteligente", "Comparar opções com foco em custo-benefício."),
        ("Decisão e Risco", "Avaliar consequências antes de gastar ou investir."),
        ("Empreendedorismo", "Planejar soluções e geração de valor responsável."),
        ("Finanças e Sociedade", "Relacionar dinheiro, ética e impacto social."),
        ("Metas de Longo Prazo", "Definir objetivos financeiros sustentáveis."),
        ("Autonomia Financeira", "Aplicar aprendizagem financeira no cotidiano."),
    ],
}

UNIT_THEMES_BY_SUBJECT: dict[str, list[str]] = {
    "Matemática": [
        "Fundamentos Numéricos",
        "Operações Inteligentes",
        "Frações no Dia a Dia",
        "Geometria Aplicada",
        "Medidas e Escalas",
        "Padrões e Álgebra",
        "Dados e Probabilidade",
        "Estratégias de Problemas",
        "Desafios Integrados",
        "Projeto Final Matemático",
    ],
    "Português": [
        "Leitura e Significado",
        "Palavras e Contexto",
        "Frase e Pontuação",
        "Gramática em Ação",
        "Gêneros e Linguagem",
        "Interpretação Avançada",
        "Argumentação e Opinião",
        "Escrita Criativa",
        "Revisão e Refinamento",
        "Projeto Final de Comunicação",
    ],
    "Ciências": [
        "Descobertas da Natureza",
        "Vida e Ambiente",
        "Corpo e Saúde",
        "Matéria em Transformação",
        "Energia e Tecnologia",
        "Terra e Clima",
        "Universo e Exploração",
        "Método Científico",
        "Sustentabilidade em Ação",
        "Projeto Final Investigativo",
    ],
    "Inglês": [
        "Greetings and Identity",
        "Daily Routine",
        "Places and Directions",
        "Food and Choices",
        "Grammar in Context",
        "Reading and Listening",
        "Speaking Practice",
        "Project Dialogues",
        "Cultural Connections",
        "Final Communication Project",
    ],
    "Educação Financeira": [
        "Dinheiro e Escolhas",
        "Planejamento Inteligente",
        "Economia no Cotidiano",
        "Orçamento e Controle",
        "Consumo Consciente",
        "Risco e Decisão",
        "Empreender com Propósito",
        "Cidadania Financeira",
        "Metas de Futuro",
        "Projeto de Vida Financeiro",
    ],
}


def _lesson_type_by_order(lesson_order: int) -> str:
    sequence = ("STORY", "MULTIPLE_CHOICE", "DRAG_DROP", "INTERACTIVE", "MULTIPLE_CHOICE", "INTERACTIVE")
    return sequence[(lesson_order - 1) % len(sequence)]


def _lesson_difficulty(age_group: str, unit_order: int, lesson_order: int) -> str:
    if age_group == "6-8":
        return "EASY" if unit_order <= 5 else "MEDIUM"
    if age_group == "9-12":
        if unit_order <= 3:
            return "EASY"
        if unit_order <= 8:
            return "MEDIUM"
        return "HARD" if lesson_order >= 4 else "MEDIUM"
    if unit_order <= 2:
        return "MEDIUM"
    return "HARD"


def _subject_rows() -> list[SubjectSeed]:
    rows: list[SubjectSeed] = []
    for age_group in AGE_GROUPS:
        for order, (name, icon, color) in enumerate(SUBJECTS_BY_AGE[age_group], start=1):
            rows.append(
                SubjectSeed(
                    age_group=age_group,
                    order=order,
                    name=name,
                    icon=icon,
                    color=color,
                )
            )
    return rows


def _skill_rows_for_subject(subject_name: str) -> list[SkillSeed]:
    raw = SKILLS_BY_SUBJECT[subject_name]
    return [
        SkillSeed(order=index + 1, name=item[0], description=item[1])
        for index, item in enumerate(raw)
    ]


def _upsert_subject(*, age_group: str, order: int, name: str, icon: str, color: str) -> int:
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
            {"age_group": age_group, "order": order},
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
                    "name": name,
                    "age_group": age_group,
                    "icon": icon,
                    "color": color,
                    "order": order,
                },
            )
        else:
            db.execute(
                text(
                    """
                    UPDATE subjects
                    SET name = :name,
                        icon = :icon,
                        color = :color
                    WHERE id = :id
                    """
                ),
                {
                    "id": int(subject_id),
                    "name": name,
                    "icon": icon,
                    "color": color,
                },
            )
        db.commit()
        return int(subject_id)


def _upsert_skill(
    *,
    subject_id: int,
    age_group: str,
    order: int,
    name: str,
    description: str,
) -> str:
    with SessionLocal() as db:
        skill_id = db.scalar(
            text(
                """
                SELECT id::text
                FROM skills
                WHERE subject_id = :subject_id
                  AND "order" = :order
                LIMIT 1
                """
            ),
            {"subject_id": subject_id, "order": order},
        )
        if skill_id is None:
            skill_id = db.scalar(
                text(
                    """
                    INSERT INTO skills (subject_id, name, description, age_group, "order")
                    VALUES (:subject_id, :name, :description, :age_group, :order)
                    RETURNING id::text
                    """
                ),
                {
                    "subject_id": subject_id,
                    "name": name,
                    "description": description,
                    "age_group": age_group,
                    "order": order,
                },
            )
        else:
            db.execute(
                text(
                    """
                    UPDATE skills
                    SET name = :name,
                        description = :description,
                        age_group = :age_group
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {
                    "id": skill_id,
                    "name": name,
                    "description": description,
                    "age_group": age_group,
                },
            )
        db.commit()
        return str(skill_id)


def _upsert_unit(
    *,
    subject_id: int,
    order: int,
    title: str,
    description: str,
    required_level: int,
) -> int:
    with SessionLocal() as db:
        unit_id = db.scalar(
            text(
                """
                SELECT id
                FROM units
                WHERE subject_id = :subject_id
                  AND "order" = :order
                LIMIT 1
                """
            ),
            {"subject_id": subject_id, "order": order},
        )
        if unit_id is None:
            unit_id = db.scalar(
                text(
                    """
                    INSERT INTO units (subject_id, title, description, "order", required_level)
                    VALUES (:subject_id, :title, :description, :order, :required_level)
                    RETURNING id
                    """
                ),
                {
                    "subject_id": subject_id,
                    "title": title,
                    "description": description,
                    "order": order,
                    "required_level": required_level,
                },
            )
        else:
            db.execute(
                text(
                    """
                    UPDATE units
                    SET title = :title,
                        description = :description,
                        required_level = :required_level
                    WHERE id = :id
                    """
                ),
                {
                    "id": int(unit_id),
                    "title": title,
                    "description": description,
                    "required_level": required_level,
                },
            )
        db.commit()
        return int(unit_id)


def _upsert_lesson(
    *,
    unit_id: int,
    order: int,
    title: str,
    xp_reward: int,
    lesson_type: str,
    difficulty: str,
) -> int:
    with SessionLocal() as db:
        lesson_id = db.scalar(
            text(
                """
                SELECT id
                FROM lessons
                WHERE unit_id = :unit_id
                  AND "order" = :order
                LIMIT 1
                """
            ),
            {"unit_id": unit_id, "order": order},
        )
        if lesson_id is None:
            lesson_id = db.scalar(
                text(
                    """
                    INSERT INTO lessons (unit_id, title, "order", xp_reward, type, difficulty)
                    VALUES (:unit_id, :title, :order, :xp_reward, :type, :difficulty)
                    RETURNING id
                    """
                ),
                {
                    "unit_id": unit_id,
                    "title": title,
                    "order": order,
                    "xp_reward": xp_reward,
                    "type": lesson_type,
                    "difficulty": difficulty,
                },
            )
        else:
            db.execute(
                text(
                    """
                    UPDATE lessons
                    SET title = :title,
                        xp_reward = :xp_reward,
                        type = :type,
                        difficulty = :difficulty
                    WHERE id = :id
                    """
                ),
                {
                    "id": int(lesson_id),
                    "title": title,
                    "xp_reward": xp_reward,
                    "type": lesson_type,
                    "difficulty": difficulty,
                },
            )
        db.commit()
        return int(lesson_id)


def _replace_lesson_skills(*, lesson_id: int, skill_ids: list[str], weights: list[float]) -> int:
    with SessionLocal() as db:
        db.execute(
            text("DELETE FROM lesson_skills WHERE lesson_id = :lesson_id"),
            {"lesson_id": lesson_id},
        )
        inserted = 0
        for skill_id, weight in zip(skill_ids, weights, strict=True):
            db.execute(
                text(
                    """
                    INSERT INTO lesson_skills (lesson_id, skill_id, weight)
                    VALUES (:lesson_id, CAST(:skill_id AS uuid), :weight)
                    """
                ),
                {
                    "lesson_id": lesson_id,
                    "skill_id": skill_id,
                    "weight": weight,
                },
            )
            inserted += 1
        db.commit()
        return inserted


def _pick_skills_for_lesson(*, skill_ids: list[str], unit_order: int, lesson_order: int) -> tuple[list[str], list[float]]:
    count = 2 + ((unit_order + lesson_order) % 3)  # 2..4
    total = len(skill_ids)
    start = ((unit_order - 1) * 3 + (lesson_order - 1) * 2) % total
    picked: list[str] = []
    cursor = start
    while len(picked) < count:
        current = skill_ids[cursor % total]
        if current not in picked:
            picked.append(current)
        cursor += 1
    return picked, WEIGHTS_BY_COUNT[count]


def run_seed() -> None:
    subjects_processed = 0
    units_processed = 0
    lessons_processed = 0
    skills_processed = 0
    lesson_skills_processed = 0

    for subject in _subject_rows():
        subject_id = _upsert_subject(
            age_group=subject.age_group,
            order=subject.order,
            name=subject.name,
            icon=subject.icon,
            color=subject.color,
        )
        subjects_processed += 1

        skill_rows = _skill_rows_for_subject(subject.name)
        skill_ids_by_order: list[str] = []
        for skill in skill_rows:
            skill_id = _upsert_skill(
                subject_id=subject_id,
                age_group=subject.age_group,
                order=skill.order,
                name=skill.name,
                description=skill.description,
            )
            skills_processed += 1
            skill_ids_by_order.append(skill_id)

        unit_themes = UNIT_THEMES_BY_SUBJECT[subject.name]
        for unit_order in range(1, UNITS_PER_SUBJECT + 1):
            theme = unit_themes[unit_order - 1]
            title = f"Unidade {unit_order}: {theme}"
            description = (
                f"Progressão de {subject.name} para faixa {subject.age_group}. "
                f"Nesta unidade, o foco é {theme.lower()} com aplicações reais e positivas."
            )
            unit_id = _upsert_unit(
                subject_id=subject_id,
                order=unit_order,
                title=title,
                description=description,
                required_level=max(1, unit_order),
            )
            units_processed += 1

            for lesson_order in range(1, LESSONS_PER_UNIT + 1):
                lesson_title = f"Lição {lesson_order}: Missão {theme}"
                xp_reward = 20 + (unit_order * 3) + (lesson_order * 2)
                lesson_type = _lesson_type_by_order(lesson_order)
                difficulty = _lesson_difficulty(subject.age_group, unit_order, lesson_order)
                lesson_id = _upsert_lesson(
                    unit_id=unit_id,
                    order=lesson_order,
                    title=lesson_title,
                    xp_reward=xp_reward,
                    lesson_type=lesson_type,
                    difficulty=difficulty,
                )
                lessons_processed += 1

                picked_skill_ids, weights = _pick_skills_for_lesson(
                    skill_ids=skill_ids_by_order,
                    unit_order=unit_order,
                    lesson_order=lesson_order,
                )
                lesson_skills_processed += _replace_lesson_skills(
                    lesson_id=lesson_id,
                    skill_ids=picked_skill_ids,
                    weights=weights,
                )

    print("=== APRENDER CURRICULUM STRUCTURE SEED RESULT ===")
    print(f"subjects_processed: {subjects_processed}")
    print(f"units_processed: {units_processed}")
    print(f"lessons_processed: {lessons_processed}")
    print(f"skills_processed: {skills_processed}")
    print(f"lesson_skills_processed: {lesson_skills_processed}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
