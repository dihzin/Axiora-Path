"""replace placeholder seed questions with real age-appropriate content

Revision ID: 0109_real_question_seed
Revises: 0108_games_league_engine
Create Date: 2026-03-17 00:00:00.000000

Migration 0092 inserted placeholder questions with text like
'[Matemática] Pergunta essencial (EASY).' to avoid empty trails.
This migration replaces every such placeholder with a real,
age-appropriate, educationally correct question.
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision: str = "0109_real_question_seed"
down_revision: str | None = "0108_games_league_engine"
branch_labels = None
depends_on = None

# ─── Question bank ────────────────────────────────────────────────────────────
# Structure: (subject_name, age_group) → list of (difficulty, prompt, explanation, correct_option_id, options)
# options: list of (id, label)

_Q: dict[tuple[str, str], list[tuple[str, str, str, str, list[tuple[str, str]]]]] = {
    # ── Matemática ────────────────────────────────────────────────────────────
    ("Matemática", "6-8"): [
        ("EASY",   "Quanto é 3 + 4?",
         "Somamos 3 com 4 e chegamos a 7.",
         "a", [("a","7"),("b","6"),("c","8")]),
        ("MEDIUM", "Maria tem 10 balas e come 4. Quantas sobram?",
         "10 − 4 = 6 balas.",
         "b", [("a","5"),("b","6"),("c","7")]),
        ("HARD",   "Se você dividir 12 laranjas igualmente entre 3 amigos, quantas cada um recebe?",
         "12 ÷ 3 = 4 laranjas cada um.",
         "c", [("a","3"),("b","5"),("c","4")]),
    ],
    ("Matemática", "9-12"): [
        ("EASY",   "Quanto é 6 × 7?",
         "6 × 7 = 42.",
         "a", [("a","42"),("b","36"),("c","48")]),
        ("MEDIUM", "Qual é 25% de 80?",
         "25% de 80 = 80 × 0,25 = 20.",
         "b", [("a","15"),("b","20"),("c","25")]),
        ("HARD",   "Se x + 8 = 15, qual é o valor de x?",
         "x = 15 − 8 = 7.",
         "a", [("a","7"),("b","8"),("c","6")]),
    ],
    ("Matemática", "13-15"): [
        ("EASY",   "Quanto é 2³?",
         "2³ = 2 × 2 × 2 = 8.",
         "c", [("a","6"),("b","9"),("c","8")]),
        ("MEDIUM", "Qual é a raiz quadrada de 144?",
         "√144 = 12, pois 12 × 12 = 144.",
         "a", [("a","12"),("b","11"),("c","13")]),
        ("HARD",   "Em uma PA com primeiro termo 3 e razão 4, qual é o 5º termo?",
         "a₅ = 3 + (5−1)×4 = 3 + 16 = 19.",
         "b", [("a","15"),("b","19"),("c","23")]),
    ],
    # ── Português ────────────────────────────────────────────────────────────
    ("Português", "6-8"): [
        ("EASY",   "Qual dessas palavras começa com a letra 'B'?",
         "Bola começa com a letra B.",
         "a", [("a","Bola"),("b","Casa"),("c","Dado")]),
        ("MEDIUM", "Quantas sílabas tem a palavra 'borboleta'?",
         "bor-bo-le-ta = 4 sílabas.",
         "b", [("a","3"),("b","4"),("c","5")]),
        ("HARD",   "Qual é o plural de 'flor'?",
         "O plural de flor é flores.",
         "a", [("a","flores"),("b","flors"),("c","floris")]),
    ],
    ("Português", "9-12"): [
        ("EASY",   "Qual dessas palavras é um substantivo?",
         "Alegria é um substantivo; correr é verbo; bonito é adjetivo.",
         "a", [("a","Alegria"),("b","Correr"),("c","Bonito")]),
        ("MEDIUM", "Qual é o sinônimo de 'feliz'?",
         "Contente tem o mesmo sentido de feliz.",
         "c", [("a","Triste"),("b","Cansado"),("c","Contente")]),
        ("HARD",   "Em qual frase o sujeito está oculto (elíptico)?",
         "Em 'Cheguei cedo.' o sujeito 'eu' está oculto mas identificável pela desinência verbal.",
         "b", [("a","O aluno estudou."),("b","Cheguei cedo."),("c","Ela cantou muito.")]),
    ],
    ("Português", "13-15"): [
        ("EASY",   "Qual é a função do pronome relativo?",
         "O pronome relativo retoma (substitui) um termo anterior na oração.",
         "a", [("a","Retomar um termo anterior"),("b","Indicar posse"),("c","Expressar dúvida")]),
        ("MEDIUM", "Qual das alternativas usa a crase corretamente?",
         "Crase ocorre antes de palavras femininas que aceitam artigo 'a': 'Fui à escola.'",
         "b", [("a","Fui a escola."),("b","Fui à escola."),("c","Fui á escola.")]),
        ("HARD",   "Qual figura de linguagem está em 'O tempo é dinheiro'?",
         "Metáfora: compara dois elementos diferentes sem usar 'como'.",
         "a", [("a","Metáfora"),("b","Metonímia"),("c","Hipérbole")]),
    ],
    # ── Inglês ───────────────────────────────────────────────────────────────
    ("Inglês", "6-8"): [
        ("EASY",   "How do you say 'gato' in English?",
         "'Gato' in English is 'cat'.",
         "a", [("a","Cat"),("b","Dog"),("c","Bird")]),
        ("MEDIUM", "Which color is the sky on a sunny day?",
         "The sky is blue on a sunny day.",
         "b", [("a","Red"),("b","Blue"),("c","Green")]),
        ("HARD",   "What is the plural of 'child'?",
         "The irregular plural of 'child' is 'children'.",
         "c", [("a","Childs"),("b","Childrens"),("c","Children")]),
    ],
    ("Inglês", "9-12"): [
        ("EASY",   "Which verb is in the past simple tense?",
         "'Walked' is the past simple form of 'walk'.",
         "a", [("a","Walked"),("b","Walk"),("c","Walking")]),
        ("MEDIUM", "Choose the grammatically correct sentence:",
         "'She doesn't like coffee.' uses the correct negative form for the third person singular.",
         "b", [("a","She don't like coffee."),("b","She doesn't like coffee."),("c","She not like coffee.")]),
        ("HARD",   "What does 'although' mean in Portuguese?",
         "'Although' means 'embora' (introduces a concessive clause).",
         "a", [("a","Embora"),("b","Portanto"),("c","Porém")]),
    ],
    ("Inglês", "13-15"): [
        ("EASY",   "Which sentence uses the Present Perfect correctly?",
         "'I have already eaten.' uses 'have + past participle', the Present Perfect structure.",
         "c", [("a","I already ate."),("b","I have eat."),("c","I have already eaten.")]),
        ("MEDIUM", "What is a synonym for 'intelligent'?",
         "'Clever' means intelligent; 'dull' means boring; 'lazy' means preguiçoso.",
         "a", [("a","Clever"),("b","Dull"),("c","Lazy")]),
        ("HARD",   "Which sentence uses the passive voice?",
         "In passive voice the subject receives the action: 'The book was written by her.'",
         "b", [("a","She wrote the book."),("b","The book was written by her."),("c","She has written the book.")]),
    ],
    # ── História ─────────────────────────────────────────────────────────────
    ("História", "6-8"): [
        ("EASY",   "Quem descobriu o Brasil?",
         "Pedro Álvares Cabral chegou ao Brasil em 1500 a serviço de Portugal.",
         "a", [("a","Os portugueses"),("b","Os espanhóis"),("c","Os ingleses")]),
        ("MEDIUM", "Em que ano o Brasil foi descoberto pelos europeus?",
         "Pedro Álvares Cabral chegou ao Brasil em 22 de abril de 1500.",
         "b", [("a","1492"),("b","1500"),("c","1600")]),
        ("HARD",   "O que os indígenas usavam como principal meio de comunicação?",
         "Os povos indígenas desenvolveram línguas próprias e usavam gestos e pinturas corporais.",
         "c", [("a","Telefone"),("b","Internet"),("c","Línguas próprias e gestos")]),
    ],
    ("História", "9-12"): [
        ("EASY",   "Qual foi o principal produto econômico do Brasil no século XVIII?",
         "O ciclo do ouro dominou a economia brasileira no século XVIII.",
         "b", [("a","Café"),("b","Ouro"),("c","Borracha")]),
        ("MEDIUM", "Em que data o Brasil proclamou sua independência?",
         "A Independência do Brasil foi proclamada em 7 de setembro de 1822.",
         "a", [("a","7 de setembro de 1822"),("b","15 de novembro de 1889"),("c","22 de abril de 1500")]),
        ("HARD",   "Qual movimento histórico culminou na abolição da escravidão no Brasil?",
         "O Abolicionismo foi o movimento que lutou e conquistou o fim da escravidão com a Lei Áurea (1888).",
         "c", [("a","Republicanismo"),("b","Positivismo"),("c","Abolicionismo")]),
    ],
    ("História", "13-15"): [
        ("EASY",   "Qual foi a causa imediata da Primeira Guerra Mundial?",
         "O assassinato do arquiduque Franz Ferdinand em 1914 desencadeou a Primeira Guerra Mundial.",
         "b", [("a","A Revolução Bolchevique"),("b","O assassinato do arquiduque Franz Ferdinand"),("c","A crise econômica de 1929")]),
        ("MEDIUM", "O que foi o Iluminismo?",
         "O Iluminismo foi um movimento filosófico do século XVIII que defendia a razão, a liberdade e o progresso.",
         "a", [("a","Movimento filosófico que defendia a razão e a liberdade"),("b","Movimento religioso medieval"),("c","Período de expansão marítima")]),
        ("HARD",   "Qual foi o principal objetivo do Plano Marshall?",
         "O Plano Marshall (1948) foi um programa de ajuda econômica dos EUA para reconstruir a Europa devastada pela Segunda Guerra.",
         "c", [("a","Conter o comunismo na Ásia"),("b","Criar a ONU"),("c","Reconstruir a Europa após a Segunda Guerra Mundial")]),
    ],
    # ── Geografia ────────────────────────────────────────────────────────────
    ("Geografia", "6-8"): [
        ("EASY",   "Qual é o maior país da América do Sul?",
         "O Brasil é o maior país da América do Sul em extensão territorial.",
         "a", [("a","Brasil"),("b","Argentina"),("c","Peru")]),
        ("MEDIUM", "Qual é a capital do Brasil?",
         "Brasília é a capital federal do Brasil desde 1960.",
         "b", [("a","São Paulo"),("b","Brasília"),("c","Rio de Janeiro")]),
        ("HARD",   "O que é um mapa?",
         "Um mapa é uma representação gráfica e reduzida da superfície terrestre ou de parte dela.",
         "a", [("a","Representação gráfica da superfície terrestre"),("b","Um livro de histórias"),("c","Um instrumento de medição")]),
    ],
    ("Geografia", "9-12"): [
        ("EASY",   "Em qual continente fica o Brasil?",
         "O Brasil está localizado na América do Sul.",
         "c", [("a","Europa"),("b","África"),("c","América do Sul")]),
        ("MEDIUM", "Qual é o maior rio do mundo em volume de água?",
         "O Rio Amazonas detém o maior volume de água doce do mundo.",
         "a", [("a","Rio Amazonas"),("b","Rio Nilo"),("c","Rio Mississippi")]),
        ("HARD",   "O que é latitude?",
         "Latitude é a distância angular de um ponto ao norte ou ao sul do Equador.",
         "b", [("a","Distância da Terra ao Sol"),("b","Distância angular ao norte ou ao sul do Equador"),("c","Altitude de uma montanha")]),
    ],
    ("Geografia", "13-15"): [
        ("EASY",   "O que é o PIB?",
         "PIB significa Produto Interno Bruto: a soma de todos os bens e serviços produzidos num país.",
         "a", [("a","Produto Interno Bruto"),("b","Produto Internacional Básico"),("c","Planejamento Integrado de Bens")]),
        ("MEDIUM", "O que caracteriza um país desenvolvido?",
         "Países desenvolvidos têm alto IDH, renda per capita elevada e indicadores sociais satisfatórios.",
         "c", [("a","Grande território e população numerosa"),("b","Clima tropical e recursos naturais"),("c","Alto IDH e renda per capita elevada")]),
        ("HARD",   "O que é globalização?",
         "Globalização é o processo de integração econômica, cultural e política entre países, intensificado pelo avanço tecnológico.",
         "b", [("a","Divisão do mundo em blocos econômicos isolados"),("b","Processo de integração econômica, cultural e política entre países"),("c","Expansão das fronteiras territoriais")]),
    ],
    # ── Ciências ─────────────────────────────────────────────────────────────
    ("Ciências", "6-8"): [
        ("EASY",   "Qual animal produz mel?",
         "As abelhas coletam néctar das flores e produzem mel nas colmeias.",
         "b", [("a","Formiga"),("b","Abelha"),("c","Borboleta")]),
        ("MEDIUM", "O que as plantas precisam para fazer fotossíntese?",
         "A fotossíntese usa luz solar, água e gás carbônico para produzir energia.",
         "a", [("a","Luz solar, água e gás carbônico"),("b","Apenas água"),("c","Apenas luz solar")]),
        ("HARD",   "Qual é o estado físico da água a 100°C ao nível do mar?",
         "A 100°C (ponto de ebulição), a água se transforma em vapor (estado gasoso).",
         "c", [("a","Sólido"),("b","Líquido"),("c","Gasoso (vapor)")]),
    ],
    ("Ciências", "9-12"): [
        ("EASY",   "Qual gás os seres humanos precisam respirar para sobreviver?",
         "Os seres vivos aeróbicos dependem do oxigênio para a respiração celular.",
         "a", [("a","Oxigênio"),("b","Nitrogênio"),("c","Gás carbônico")]),
        ("MEDIUM", "O que é célula?",
         "A célula é a menor unidade estrutural e funcional dos seres vivos.",
         "b", [("a","Tipo de tecido"),("b","Unidade básica da vida"),("c","Órgão do corpo")]),
        ("HARD",   "Qual é a fórmula química da água?",
         "A água é formada por 2 átomos de Hidrogênio e 1 de Oxigênio: H₂O.",
         "a", [("a","H₂O"),("b","CO₂"),("c","NaCl")]),
    ],
    ("Ciências", "13-15"): [
        ("EASY",   "Qual é a velocidade aproximada da luz no vácuo?",
         "A luz percorre aproximadamente 300.000 km por segundo no vácuo.",
         "c", [("a","30.000 km/s"),("b","3.000.000 km/s"),("c","300.000 km/s")]),
        ("MEDIUM", "O que é DNA?",
         "DNA (ácido desoxirribonucleico) é a molécula que armazena as informações genéticas dos seres vivos.",
         "b", [("a","Uma proteína do núcleo celular"),("b","Ácido desoxirribonucleico que armazena informações genéticas"),("c","Um tipo de vitamina")]),
        ("HARD",   "Qual lei de Newton relaciona força, massa e aceleração (F = ma)?",
         "A Segunda Lei de Newton (F = ma) estabelece que a força resultante é igual ao produto da massa pela aceleração.",
         "a", [("a","Segunda lei"),("b","Primeira lei"),("c","Terceira lei")]),
    ],
    # ── Física ───────────────────────────────────────────────────────────────
    ("Física", "6-8"): [
        ("EASY",   "O que é energia?",
         "Energia é a capacidade de realizar trabalho ou provocar transformações.",
         "b", [("a","Tipo de força"),("b","Capacidade de realizar trabalho"),("c","Material condutor")]),
        ("MEDIUM", "Qual dessas é uma fonte de energia renovável?",
         "A energia solar vem do Sol e é inesgotável na escala humana.",
         "a", [("a","Energia solar"),("b","Petróleo"),("c","Carvão mineral")]),
        ("HARD",   "O que acontece quando você esfrega dois materiais diferentes, como plástico e lã?",
         "O atrito pode transferir elétrons entre os materiais, causando eletrização por atrito.",
         "c", [("a","Nada acontece"),("b","Os materiais derretem"),("c","Pode ocorrer eletrização")]),
    ],
    ("Física", "9-12"): [
        ("EASY",   "Qual é a unidade de medida da força no Sistema Internacional?",
         "A força é medida em Newton (N), em homenagem a Isaac Newton.",
         "a", [("a","Newton"),("b","Joule"),("c","Pascal")]),
        ("MEDIUM", "O que é velocidade média?",
         "Velocidade média = espaço percorrido ÷ tempo gasto.",
         "b", [("a","Força dividida pela massa"),("b","Espaço percorrido dividido pelo tempo"),("c","Energia dividida pelo tempo")]),
        ("HARD",   "Qual princípio explica a sustentação de um avião?",
         "O Princípio de Bernoulli diz que onde a velocidade do fluido é maior, a pressão é menor — isso gera sustentação.",
         "c", [("a","Lei de Boyle"),("b","Princípio de Arquimedes"),("c","Princípio de Bernoulli")]),
    ],
    ("Física", "13-15"): [
        ("EASY",   "Qual é a fórmula da Energia Cinética?",
         "Ec = mv²/2, onde m é a massa e v é a velocidade do objeto.",
         "a", [("a","Ec = mv²/2"),("b","Ep = mgh"),("c","E = mc²")]),
        ("MEDIUM", "O que é um campo magnético?",
         "Campo magnético é a região do espaço onde forças magnéticas atuam sobre cargas em movimento ou outros ímãs.",
         "b", [("a","Tipo de onda eletromagnética"),("b","Região onde forças magnéticas atuam sobre cargas em movimento"),("c","Corrente elétrica contínua")]),
        ("HARD",   "O que descreve a equação E = mc²?",
         "A equação de Einstein mostra que energia e massa são equivalentes e intercambiáveis.",
         "c", [("a","A velocidade de propagação da luz"),("b","A força gravitacional entre dois corpos"),("c","A equivalência entre energia e massa")]),
    ],
    # ── Química ──────────────────────────────────────────────────────────────
    ("Química", "6-8"): [
        ("EASY",   "O que é uma mistura?",
         "Mistura é a união de duas ou mais substâncias sem reação química entre elas.",
         "a", [("a","União de duas ou mais substâncias"),("b","Uma substância pura"),("c","Um elemento químico")]),
        ("MEDIUM", "Qual dessas é uma transformação química?",
         "Queimar madeira é uma reação química (combustão); derreter e dissolver são mudanças físicas.",
         "b", [("a","Derreter gelo"),("b","Queimar madeira"),("c","Dissolver açúcar na água")]),
        ("HARD",   "Quantos estados físicos da matéria são reconhecidos atualmente?",
         "São 4 estados clássicos: sólido, líquido, gasoso e plasma.",
         "c", [("a","2"),("b","3"),("c","4 (sólido, líquido, gasoso e plasma)")]),
    ],
    ("Química", "9-12"): [
        ("EASY",   "O que é um átomo?",
         "O átomo é a menor partícula de um elemento químico que mantém suas propriedades.",
         "a", [("a","Unidade básica da matéria"),("b","Tipo de molécula"),("c","Fórmula química")]),
        ("MEDIUM", "Qual é o símbolo químico do ouro?",
         "O símbolo do ouro é Au, do latim 'Aurum'.",
         "b", [("a","Go"),("b","Au"),("c","Or")]),
        ("HARD",   "O que ocorre em uma reação de oxidação?",
         "Na oxidação, uma substância perde elétrons (aumenta seu número de oxidação).",
         "a", [("a","Perda de elétrons por uma substância"),("b","Ganho de elétrons por uma substância"),("c","Quebra de uma molécula")]),
    ],
    ("Química", "13-15"): [
        ("EASY",   "Qual é o pH de uma solução neutra?",
         "pH 7 indica neutralidade; abaixo de 7 é ácido, acima é básico.",
         "b", [("a","0"),("b","7"),("c","14")]),
        ("MEDIUM", "O que são isômeros?",
         "Isômeros são compostos com a mesma fórmula molecular mas arranjo estrutural diferente.",
         "c", [("a","Elementos da mesma família na tabela periódica"),("b","Compostos com o mesmo número de elétrons"),("c","Compostos com a mesma fórmula molecular mas estruturas diferentes")]),
        ("HARD",   "O que é entalpia (H) em termodinâmica?",
         "Entalpia é a energia total de um sistema termodinâmico a pressão constante, relacionada ao calor trocado.",
         "a", [("a","Energia total de um sistema termodinâmico"),("b","Velocidade de uma reação química"),("c","Concentração de uma solução")]),
    ],
    # ── Filosofia ────────────────────────────────────────────────────────────
    ("Filosofia", "6-8"): [
        ("EASY",   "O que é amizade?",
         "Amizade é uma relação de afeto, confiança e respeito entre pessoas.",
         "c", [("a","Um tipo de jogo"),("b","Uma matéria escolar"),("c","Relação de afeto e confiança entre pessoas")]),
        ("MEDIUM", "O que significa ser justo?",
         "Ser justo significa tratar as pessoas de forma igualitária, dando a cada um o que é seu.",
         "a", [("a","Tratar as pessoas de forma igualitária"),("b","Ganhar sempre"),("c","Ser o mais forte")]),
        ("HARD",   "O que os filósofos fazem?",
         "Filósofos pensam, questionam e buscam respostas sobre a natureza da realidade, da moral e do conhecimento.",
         "b", [("a","Inventam máquinas"),("b","Pensam e questionam sobre a vida e o mundo"),("c","Cuidam de animais")]),
    ],
    ("Filosofia", "9-12"): [
        ("EASY",   "Quem foi Sócrates?",
         "Sócrates foi um filósofo grego (469–399 a.C.) que usava o diálogo e perguntas para buscar a verdade.",
         "a", [("a","Filósofo grego que usava perguntas para buscar a verdade"),("b","Um imperador romano"),("c","Um artista renascentista")]),
        ("MEDIUM", "O que é ética?",
         "Ética é o ramo da filosofia que estuda o que é certo e errado, o bem e o mal no comportamento humano.",
         "b", [("a","Estudo do passado"),("b","Estudo do que é certo e errado"),("c","Conjunto de leis")]),
        ("HARD",   "O que significa o imperativo categórico de Immanuel Kant?",
         "Kant propõe agir segundo máximas que possam ser universalizadas como lei para todos os seres racionais.",
         "c", [("a","Busque o prazer acima de tudo"),("b","Obedeça sempre a autoridade"),("c","Age de acordo com uma máxima que possa ser uma lei universal")]),
    ],
    ("Filosofia", "13-15"): [
        ("EASY",   "O que é metafísica?",
         "Metafísica é o ramo da filosofia que investiga a natureza fundamental da realidade.",
         "a", [("a","Área da filosofia que estuda a natureza da realidade"),("b","Tipo de física experimental"),("c","Estudo de fenômenos sobrenaturais")]),
        ("MEDIUM", "O que é o existencialismo?",
         "O existencialismo (Sartre, Camus) afirma que a existência precede a essência: somos definidos por nossas escolhas.",
         "b", [("a","Filosofia que defende o coletivismo"),("b","Corrente filosófica que afirma que a existência precede a essência"),("c","Escola filosófica que nega o livre-arbítrio")]),
        ("HARD",   "Qual é a principal tese do utilitarismo?",
         "Para Mill e Bentham, a ação correta é aquela que produz o maior bem para o maior número de pessoas.",
         "c", [("a","A virtude é o único bem"),("b","O dever moral é absoluto e incondicional"),("c","A ação correta maximiza a felicidade do maior número de pessoas")]),
    ],
    # ── Artes ────────────────────────────────────────────────────────────────
    ("Artes", "6-8"): [
        ("EASY",   "Quais são as cores primárias da pintura?",
         "As cores primárias são vermelho, azul e amarelo — não podem ser obtidas misturando outras cores.",
         "a", [("a","Vermelho, azul e amarelo"),("b","Verde, laranja e roxo"),("c","Preto, branco e cinza")]),
        ("MEDIUM", "O que é uma escultura?",
         "Escultura é uma obra de arte tridimensional, criada moldando ou esculpindo materiais.",
         "b", [("a","Pintura em tela"),("b","Obra de arte tridimensional"),("c","Tipo de dança")]),
        ("HARD",   "Quem pintou a Mona Lisa?",
         "A Mona Lisa foi pintada por Leonardo da Vinci, entre 1503 e 1519.",
         "c", [("a","Michelangelo"),("b","Rafael"),("c","Leonardo da Vinci")]),
    ],
    ("Artes", "9-12"): [
        ("EASY",   "O que é ritmo na música?",
         "Ritmo é a organização dos sons e silêncios no tempo.",
         "a", [("a","Organização do som no tempo"),("b","Tipo de instrumento"),("c","Volume do som")]),
        ("MEDIUM", "Qual período artístico é caracterizado por distorção emocional e subjetividade?",
         "O Expressionismo (início do séc. XX) distorce a realidade para expressar emoções intensas.",
         "b", [("a","Renascimento"),("b","Expressionismo"),("c","Impressionismo")]),
        ("HARD",   "O que caracteriza a arte barroca?",
         "O Barroco (séc. XVII) se distingue pelo movimento dramático, detalhamento rico e forte contraste entre luz e sombra (chiaroscuro).",
         "c", [("a","Formas geométricas simples e cores primárias"),("b","Cenas do cotidiano com luz natural"),("c","Movimento exagerado, detalhamento e contraste entre luz e sombra")]),
    ],
    ("Artes", "13-15"): [
        ("EASY",   "O que é perspectiva em artes visuais?",
         "Perspectiva é a técnica que cria a ilusão de profundidade e tridimensionalidade numa superfície plana.",
         "a", [("a","Técnica que cria ilusão de profundidade em superfície plana"),("b","Tipo de tinta usada em quadros"),("c","Estilo de música clássica")]),
        ("MEDIUM", "Qual movimento artístico valorizou a emoção, a natureza e reagiu ao racionalismo iluminista?",
         "O Romantismo (séc. XIX) opôs-se ao Iluminismo enfatizando sentimento, natureza e nacionalismo.",
         "b", [("a","Realismo"),("b","Romantismo"),("c","Cubismo")]),
        ("HARD",   "O que é Dadaísmo?",
         "O Dadaísmo (1916) foi uma vanguarda artística que rejeitava a razão, a lógica e a estética burguesa, celebrando o absurdo.",
         "c", [("a","Corrente artística que representava a realidade objetivamente"),("b","Estilo arquitetônico do século XX"),("c","Movimento artístico de vanguarda que rejeitava a razão e celebrava o absurdo")]),
    ],
    # ── Educação Financeira ───────────────────────────────────────────────────
    ("Educação Financeira", "6-8"): [
        ("EASY",   "Para que serve o dinheiro?",
         "O dinheiro é um meio de troca: usamos ele para comprar bens e serviços.",
         "b", [("a","Para ser guardado embaixo do colchão"),("b","Para comprar bens e serviços"),("c","Apenas para pagar impostos")]),
        ("MEDIUM", "Para que serve uma poupança?",
         "Poupança é reservar parte do dinheiro para usar no futuro.",
         "a", [("a","Guardar dinheiro para usar no futuro"),("b","Gastar tudo o que você tem"),("c","Pedir emprestado ao banco")]),
        ("HARD",   "Se você tem R$ 10,00 e gasta R$ 4,00, quanto sobra?",
         "R$ 10,00 − R$ 4,00 = R$ 6,00.",
         "c", [("a","R$ 5,00"),("b","R$ 7,00"),("c","R$ 6,00")]),
    ],
    ("Educação Financeira", "9-12"): [
        ("EASY",   "O que é uma despesa?",
         "Despesa é qualquer gasto com bens ou serviços necessários ou desejados.",
         "a", [("a","Gasto com algo necessário ou desejado"),("b","Dinheiro que você recebe"),("c","Dinheiro guardado no banco")]),
        ("MEDIUM", "O que significa ter um orçamento equilibrado?",
         "Orçamento equilibrado é quando as receitas cobrem todas as despesas.",
         "b", [("a","Quando você gasta mais do que ganha"),("b","Quando as receitas são iguais ou maiores que as despesas"),("c","Quando você não tem nenhuma despesa")]),
        ("HARD",   "O que é juros compostos?",
         "Juros compostos são calculados sobre o capital inicial mais os juros já acumulados (juros sobre juros).",
         "c", [("a","Taxa fixa cobrada por um serviço"),("b","Juros calculados apenas sobre o capital inicial"),("c","Juros calculados sobre o capital mais os juros acumulados")]),
    ],
    ("Educação Financeira", "13-15"): [
        ("EASY",   "O que é inflação?",
         "Inflação é o aumento generalizado e persistente dos preços de bens e serviços.",
         "a", [("a","Aumento generalizado dos preços"),("b","Redução da taxa de juros"),("c","Aumento do salário mínimo")]),
        ("MEDIUM", "O que é investimento?",
         "Investimento é a aplicação de recursos com expectativa de retorno futuro (lucro ou renda).",
         "b", [("a","Gasto com bens de consumo"),("b","Aplicação de recursos com expectativa de retorno futuro"),("c","Dívida contraída junto ao banco")]),
        ("HARD",   "O que é diversificação de investimentos?",
         "Diversificar significa distribuir o capital em diferentes ativos para reduzir o risco de perdas.",
         "c", [("a","Investir todo o dinheiro em uma única empresa"),("b","Manter o dinheiro apenas na poupança"),("c","Distribuir o capital em diferentes tipos de ativos para reduzir riscos")]),
    ],
    # ── Lógica ───────────────────────────────────────────────────────────────
    ("Lógica", "6-8"): [
        ("EASY",   "Qual número vem a seguir na sequência: 2, 4, 6, ___?",
         "A sequência aumenta de 2 em 2 (números pares): 2, 4, 6, 8.",
         "a", [("a","8"),("b","7"),("c","9")]),
        ("MEDIUM", "Se todos os gatos são animais, e Mimi é um gato, então Mimi é…?",
         "Por silogismo: todos os gatos são animais → Mimi (gato) é um animal.",
         "b", [("a","Uma planta"),("b","Um animal"),("c","Um mineral")]),
        ("HARD",   "Qual forma geométrica tem 4 lados iguais e 4 ângulos retos?",
         "O quadrado tem 4 lados iguais e todos os ângulos são de 90°.",
         "c", [("a","Triângulo"),("b","Círculo"),("c","Quadrado")]),
    ],
    ("Lógica", "9-12"): [
        ("EASY",   "Se A > B e B > C, então A é ___ que C?",
         "Por transitividade: se A > B e B > C, então A > C.",
         "a", [("a","Maior"),("b","Menor"),("c","Igual")]),
        ("MEDIUM", "Qual é a próxima letra na sequência: A, C, E, G, ___?",
         "A sequência pula uma letra do alfabeto: A, C, E, G, I.",
         "b", [("a","H"),("b","I"),("c","J")]),
        ("HARD",   "Se todos os A são B, e alguns B são C, qual conclusão é válida?",
         "Não podemos concluir que todos os A são C, mas é possível que alguns A sejam C.",
         "c", [("a","Todos os A são C"),("b","Nenhum A é C"),("c","Alguns A podem ser C")]),
    ],
    ("Lógica", "13-15"): [
        ("EASY",   "Qual é o valor de verdade de 'V ∧ F' (V E F)?",
         "A conjunção (∧) só é verdadeira quando ambas as proposições são verdadeiras. V ∧ F = Falso.",
         "b", [("a","Verdadeiro"),("b","Falso"),("c","Indefinido")]),
        ("MEDIUM", "Qual é a negação de 'Todos os alunos passaram'?",
         "A negação de 'todos' é 'existe pelo menos um que não': 'Algum aluno não passou.'",
         "a", [("a","Algum aluno não passou"),("b","Nenhum aluno passou"),("c","Todos os alunos reprovaram")]),
        ("HARD",   "Em lógica, o que é um silogismo?",
         "Silogismo é um argumento dedutivo com duas premissas e uma conclusão necessária (ex.: Aristóteles).",
         "c", [("a","Tipo de paradoxo"),("b","Negação de uma proposição composta"),("c","Argumento com duas premissas e uma conclusão")]),
    ],
    # ── Programação básica ────────────────────────────────────────────────────
    ("Programação básica", "6-8"): [
        ("EASY",   "O que um computador precisa para funcionar?",
         "Computadores precisam de energia elétrica para funcionar.",
         "c", [("a","Água"),("b","Luz do sol"),("c","Energia elétrica")]),
        ("MEDIUM", "O que é um algoritmo?",
         "Algoritmo é uma sequência de passos ordenados para resolver um problema.",
         "a", [("a","Sequência de passos para resolver um problema"),("b","Um tipo de vírus"),("c","Uma marca de computador")]),
        ("HARD",   "Qual dessas é uma linguagem de programação?",
         "Python é uma linguagem de programação; Excel é uma planilha e Google é um buscador.",
         "b", [("a","Excel"),("b","Python"),("c","Google")]),
    ],
    ("Programação básica", "9-12"): [
        ("EASY",   "O que significa 'bug' em programação?",
         "Bug é um erro ou falha no código que causa comportamento inesperado no programa.",
         "a", [("a","Erro no código"),("b","Tipo de inseto"),("c","Comando de computador")]),
        ("MEDIUM", "O que faz uma estrutura de repetição (loop) em programação?",
         "Um loop executa repetidamente um bloco de código enquanto uma condição for verdadeira.",
         "b", [("a","Encerra o programa"),("b","Repete um bloco de código várias vezes"),("c","Apaga dados do computador")]),
        ("HARD",   "O que é uma variável em programação?",
         "Uma variável é um espaço nomeado na memória que armazena um valor que pode mudar durante a execução.",
         "c", [("a","Um tipo de função matemática"),("b","Uma instrução de entrada de dados"),("c","Espaço na memória para guardar um valor")]),
    ],
    ("Programação básica", "13-15"): [
        ("EASY",   "O que é uma função em programação?",
         "Função é um bloco de código nomeado e reutilizável que executa uma tarefa específica.",
         "a", [("a","Bloco de código reutilizável que realiza uma tarefa"),("b","Tipo de loop infinito"),("c","Instrução de saída de dados")]),
        ("MEDIUM", "Qual é a diferença entre compilação e interpretação?",
         "Na compilação, o código é traduzido inteiramente antes de executar. Na interpretação, é traduzido linha a linha durante a execução.",
         "b", [("a","Não há diferença"),("b","Na compilação o código é traduzido antes; na interpretação é traduzido durante a execução"),("c","Compilação é sempre mais lenta")]),
        ("HARD",   "O que é recursão em programação?",
         "Recursão é quando uma função chama a si mesma, devendo sempre ter uma condição de parada.",
         "c", [("a","Quando um loop nunca termina"),("b","Quando dois programas se comunicam"),("c","Quando uma função chama a si mesma")]),
    ],
    # ── Redação ──────────────────────────────────────────────────────────────
    ("Redação", "6-8"): [
        ("EASY",   "O que é uma frase?",
         "Frase é um enunciado com sentido completo, podendo ser formada por uma ou mais palavras.",
         "b", [("a","Uma letra isolada"),("b","Conjunto de palavras com sentido"),("c","Um parágrafo longo")]),
        ("MEDIUM", "Qual das opções é o início típico de uma história infantil?",
         "'Era uma vez...' é a fórmula clássica de abertura de histórias e contos de fadas.",
         "a", [("a","Era uma vez..."),("b","...e viveram felizes para sempre."),("c","Portanto, concluímos que...")]),
        ("HARD",   "O que é um parágrafo?",
         "Parágrafo é um trecho de texto que desenvolve uma ideia central, delimitado por recuo ou linha em branco.",
         "c", [("a","Uma frase isolada"),("b","Título de um texto"),("c","Trecho de texto que desenvolve uma ideia")]),
    ],
    ("Redação", "9-12"): [
        ("EASY",   "Qual é a estrutura básica de uma redação dissertativa?",
         "Toda redação dissertativa tem introdução, desenvolvimento e conclusão.",
         "a", [("a","Introdução, desenvolvimento e conclusão"),("b","Título, corpo e rodapé"),("c","Rima, ritmo e estrofe")]),
        ("MEDIUM", "O que é coesão textual?",
         "Coesão é o conjunto de mecanismos (pronomes, conectivos, sinônimos) que ligam as partes do texto.",
         "b", [("a","Qualidade da letra do autor"),("b","Uso de elementos que conectam as partes do texto"),("c","Número de palavras no texto")]),
        ("HARD",   "O que caracteriza um texto dissertativo-argumentativo?",
         "O texto dissertativo-argumentativo defende uma tese com argumentos e evidências para persuadir o leitor.",
         "c", [("a","Narração de uma história fictícia"),("b","Descrição detalhada de um lugar"),("c","Defesa de um ponto de vista com argumentos e evidências")]),
    ],
    ("Redação", "13-15"): [
        ("EASY",   "O que é tese em um texto argumentativo?",
         "A tese é a posição ou ponto de vista que o autor defende ao longo do texto.",
         "a", [("a","A posição defendida pelo autor"),("b","O conjunto de exemplos usados"),("c","A conclusão do texto")]),
        ("MEDIUM", "O que é um argumento de autoridade?",
         "Argumentos de autoridade citam especialistas, pesquisas ou dados reconhecidos para embasar a tese.",
         "b", [("a","Usar falácias para convencer"),("b","Citar especialistas ou dados confiáveis para embasar a tese"),("c","Repetir a tese várias vezes")]),
        ("HARD",   "O que é intertextualidade?",
         "Intertextualidade é a relação entre textos: um texto dialoga, referencia ou transforma outro.",
         "c", [("a","Uso excessivo de palavras difíceis"),("b","Técnica de criar neologismos"),("c","Relação entre textos onde um dialoga com outro")]),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()

    # Delete all placeholder questions inserted by migration 0092.
    bind.execute(
        sa.text(
            "DELETE FROM questions WHERE prompt LIKE :pattern"
        ),
        {"pattern": "[%] Pergunta essencial (%)"},
    )

    for (subject_name, age_group), questions in _Q.items():
        # Find the first skill for this (subject, age_group).
        skill_id = bind.execute(
            sa.text(
                """
                SELECT sk.id::text
                FROM skills sk
                JOIN subjects s ON s.id = sk.subject_id
                WHERE lower(s.name) = lower(:name)
                  AND s.age_group::text = :age_group
                ORDER BY sk."order" ASC
                LIMIT 1
                """
            ),
            {"name": subject_name, "age_group": age_group},
        ).scalar()

        if skill_id is None:
            continue

        # Find the first lesson for this skill's subject.
        lesson_id = bind.execute(
            sa.text(
                """
                SELECT l.id
                FROM lessons l
                JOIN units u ON u.id = l.unit_id
                JOIN subjects s ON s.id = u.subject_id
                WHERE lower(s.name) = lower(:name)
                  AND s.age_group::text = :age_group
                ORDER BY u."order" ASC, l."order" ASC
                LIMIT 1
                """
            ),
            {"name": subject_name, "age_group": age_group},
        ).scalar()

        for difficulty, prompt, explanation, correct_option_id, options in questions:
            metadata = json.dumps(
                {
                    "options": [{"id": opt_id, "label": label} for opt_id, label in options],
                    "correctOptionId": correct_option_id,
                }
            )
            bind.execute(
                sa.text(
                    """
                    INSERT INTO questions (skill_id, lesson_id, type, difficulty, prompt, explanation, metadata)
                    VALUES (
                        CAST(:skill_id AS uuid),
                        :lesson_id,
                        CAST('MCQ' AS question_type),
                        CAST(:difficulty AS question_difficulty),
                        :prompt,
                        :explanation,
                        CAST(:metadata AS jsonb)
                    )
                    """
                ),
                {
                    "skill_id": skill_id,
                    "lesson_id": lesson_id,
                    "difficulty": difficulty,
                    "prompt": prompt,
                    "explanation": explanation,
                    "metadata": metadata,
                },
            )


def downgrade() -> None:
    # Remove real questions inserted by this migration and restore placeholders.
    bind = op.get_bind()

    # Delete the real questions (identified by NOT matching placeholder pattern).
    # We can't safely restore placeholders without re-running upgrade() of 0092,
    # so downgrade simply removes the content added here.
    # The placeholder guard in lesson_engine.py will prevent empty sessions.
    for (subject_name, age_group), questions in _Q.items():
        for difficulty, prompt, *_ in questions:
            bind.execute(
                sa.text("DELETE FROM questions WHERE prompt = :prompt"),
                {"prompt": prompt},
            )
