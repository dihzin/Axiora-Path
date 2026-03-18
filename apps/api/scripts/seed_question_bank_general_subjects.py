from __future__ import annotations

from dataclasses import dataclass
import json

from sqlalchemy import text

from app.db.session import SessionLocal

SEED_TAG = "seed_general_subjects_v2"


@dataclass(frozen=True)
class SkillRow:
    id: str
    age_group: str
    subject_name: str


@dataclass(frozen=True)
class QuestionSeed:
    difficulty: str
    prompt: str
    explanation: str
    correct_option_id: str
    options: tuple[tuple[str, str], ...]


def q(
    difficulty: str,
    prompt: str,
    explanation: str,
    correct_option_id: str,
    options: list[tuple[str, str]],
) -> QuestionSeed:
    return QuestionSeed(
        difficulty=difficulty,
        prompt=prompt,
        explanation=explanation,
        correct_option_id=correct_option_id,
        options=tuple(options),
    )


BANK: dict[tuple[str, str], tuple[QuestionSeed, ...]] = {
    ("Inglês", "6-8"): (
        q("EASY", "How do you say 'cachorro' in English?", "'Cachorro' em ingles e 'dog'.", "b", [("a", "Cat"), ("b", "Dog"), ("c", "Fish")]),
        q("EASY", "What color is a banana?", "A ripe banana is yellow.", "a", [("a", "Yellow"), ("b", "Blue"), ("c", "Black")]),
        q("EASY", "Which word means 'ola' in English?", "'Hello' e usado para cumprimentar.", "c", [("a", "Bye"), ("b", "Thanks"), ("c", "Hello")]),
        q("MEDIUM", "Which word names a school object?", "'Book' nomeia um objeto da escola.", "a", [("a", "Book"), ("b", "Run"), ("c", "Happy")]),
        q("MEDIUM", "Complete: 'I ___ happy.'", "Com 'I', usamos 'am'.", "b", [("a", "is"), ("b", "am"), ("c", "are")]),
        q("MEDIUM", "Which animal says 'meow'?", "Cats say 'meow'.", "a", [("a", "Cat"), ("b", "Cow"), ("c", "Duck")]),
    ),
    ("Inglês", "9-12"): (
        q("EASY", "Choose the correct translation for 'friend'.", "'Friend' significa 'amigo'.", "a", [("a", "Amigo"), ("b", "Professor"), ("c", "Cidade")]),
        q("EASY", "Which sentence is correct?", "The dog is big. has estrutura correta.", "c", [("a", "The dog are big."), ("b", "The dog am big."), ("c", "The dog is big.")]),
        q("MEDIUM", "Choose the past tense of 'play'.", "O passado simples de 'play' e 'played'.", "b", [("a", "playing"), ("b", "played"), ("c", "plays")]),
        q("MEDIUM", "What does 'because' mean in Portuguese?", "'Because' significa 'porque'.", "a", [("a", "Porque"), ("b", "Mas"), ("c", "Antes")]),
        q("HARD", "Which sentence uses the third person correctly?", "Com he/she/it, usamos 'does'.", "c", [("a", "She don't like milk."), ("b", "She not like milk."), ("c", "She doesn't like milk.")]),
        q("HARD", "Choose the best translation for 'I am studying now.'", "A traducao correta usa presente continuo: 'Estou estudando agora'.", "b", [("a", "Eu estudo ontem."), ("b", "Estou estudando agora."), ("c", "Eu estudarei agora.")]),
    ),
    ("Inglês", "13-15"): (
        q("EASY", "Which sentence is in the passive voice?", "Na voz passiva, o sujeito recebe a acao.", "b", [("a", "The scientist wrote the report."), ("b", "The report was written by the scientist."), ("c", "The scientist is writing the report.")]),
        q("MEDIUM", "What is the best synonym for 'improve'?", "'Improve' pode ser substituido por 'enhance'.", "a", [("a", "Enhance"), ("b", "Ignore"), ("c", "Break")]),
        q("MEDIUM", "Choose the sentence with the Present Perfect.", "Present Perfect usa have/has + particpio.", "c", [("a", "I saw that movie yesterday."), ("b", "I seeing that movie now."), ("c", "I have seen that movie before.")]),
        q("HARD", "Which connector best expresses contrast?", "'However' introduz contraste entre ideias.", "b", [("a", "Therefore"), ("b", "However"), ("c", "Because")]),
        q("HARD", "Choose the correct indirect question.", "Em perguntas indiretas, mantemos ordem afirmativa.", "a", [("a", "Can you tell me where she lives?"), ("b", "Can you tell me where does she live?"), ("c", "Can you tell me where lives she?")]),
        q("HARD", "What does the phrasal verb 'give up' mean?", "'Give up' significa desistir.", "c", [("a", "Comecar"), ("b", "Concordar"), ("c", "Desistir")]),
    ),
    ("História", "6-8"): (
        q("EASY", "Para que servem os museus?", "Museus guardam objetos e historias do passado.", "a", [("a", "Para guardar e contar historias do passado"), ("b", "Para vender brinquedos"), ("c", "Para plantar alimentos")]),
        q("EASY", "Quem viveu antes de nos: os avos ou os netos?", "Os avos viveram antes dos netos.", "b", [("a", "Os netos"), ("b", "Os avos"), ("c", "Os dois ao mesmo tempo")]),
        q("MEDIUM", "O que uma fotografia antiga pode mostrar?", "Fotografias antigas mostram como pessoas e lugares eram antes.", "c", [("a", "So desenhos imaginarios"), ("b", "Apenas contas matematicas"), ("c", "Como pessoas e lugares eram no passado")]),
        q("MEDIUM", "Quando estudamos a historia da cidade, queremos entender...", "A historia ajuda a entender mudancas ao longo do tempo.", "a", [("a", "Como a cidade mudou com o tempo"), ("b", "So a previsao do tempo"), ("c", "Apenas receitas antigas")]),
        q("HARD", "Por que os povos registram acontecimentos importantes?", "Registros ajudam a lembrar e aprender com o passado.", "b", [("a", "Para esquecer o que aconteceu"), ("b", "Para lembrar e aprender com o passado"), ("c", "Para acabar com as festas")]),
        q("HARD", "O que e uma linha do tempo?", "Linha do tempo organiza fatos em ordem.", "a", [("a", "Uma forma de organizar fatos em ordem"), ("b", "Um tipo de mapa"), ("c", "Um brinquedo de montar")]),
    ),
    ("História", "9-12"): (
        q("EASY", "O que mudou no Brasil com a chegada da familia real em 1808?", "A presenca da corte trouxe novas instituicoes e abriu portos.", "b", [("a", "O Brasil deixou de ter cidades"), ("b", "Novas instituicoes foram criadas e os portos foram abertos"), ("c", "A escravidao acabou naquele momento")]),
        q("EASY", "Qual fato marcou a Proclamacao da Republica no Brasil?", "A Republica foi proclamada em 1889, encerrando o Imperio.", "c", [("a", "Descobrimento do Brasil"), ("b", "Independencia do Brasil"), ("c", "Fim do Imperio e inicio da Republica")]),
        q("MEDIUM", "Por que a Lei Aurea e importante na historia do Brasil?", "Ela aboliu oficialmente a escravidao em 1888.", "a", [("a", "Porque aboliu oficialmente a escravidao"), ("b", "Porque criou a Republica"), ("c", "Porque iniciou o ciclo do ouro")]),
        q("MEDIUM", "O que eram as capitanias hereditarias?", "Eram grandes faixas de terra entregues pela Coroa para administracao.", "b", [("a", "Escolas militares"), ("b", "Divisoes de terra administradas por donatarios"), ("c", "Leis da Independencia")]),
        q("HARD", "Por que a Revolucao Industrial transformou a sociedade?", "Ela alterou a producao, o trabalho e a vida nas cidades.", "c", [("a", "Porque acabou com todo o comercio"), ("b", "Porque proibiu o uso de maquinas"), ("c", "Porque mudou a producao, o trabalho e as cidades")]),
        q("HARD", "O que caracteriza um processo de colonizacao?", "Colonizacao envolve ocupacao, exploracao e imposicao de poder sobre um territorio.", "a", [("a", "Ocupacao e controle de um territorio por outro povo ou pais"), ("b", "Apenas a construcao de estradas"), ("c", "Somente a troca de cartas")]),
    ),
    ("História", "13-15"): (
        q("EASY", "Qual foi um dos efeitos da Revolucao Francesa?", "A Revolucao Francesa fortaleceu ideias de cidadania e igualdade juridica.", "b", [("a", "Fim imediato de todas as monarquias"), ("b", "Difusao de ideias de cidadania e direitos"), ("c", "Criacao da internet")]),
        q("EASY", "Por que o imperialismo do seculo XIX gerou conflitos?", "A disputa por territorios e recursos aumentou tensoes entre potencias.", "a", [("a", "Porque ampliou a disputa por territorios e recursos"), ("b", "Porque eliminou todas as rivalidades"), ("c", "Porque acabou com o comercio")]),
        q("MEDIUM", "O que foi a Guerra Fria?", "Foi uma disputa politica, economica e ideologica entre EUA e URSS.", "c", [("a", "Uma guerra apenas no inverno"), ("b", "Um conflito entre Brasil e Argentina"), ("c", "Uma disputa ideologica entre EUA e URSS")]),
        q("MEDIUM", "Qual foi a principal marca do nazifascismo?", "O nazifascismo combinou autoritarismo, perseguicao e nacionalismo extremo.", "b", [("a", "Democracia direta"), ("b", "Autoritarismo e perseguicao"), ("c", "Defesa da liberdade de imprensa")]),
        q("HARD", "Por que a descolonizacao da Africa e da Asia foi importante no seculo XX?", "Ela redefiniu fronteiras, identidades nacionais e relacoes internacionais.", "a", [("a", "Porque criou novos paises e alterou a ordem internacional"), ("b", "Porque restaurou os imperios coloniais"), ("c", "Porque acabou com a ONU")]),
        q("HARD", "O que o conceito de memoria historica ajuda a compreender?", "Ajuda a analisar como grupos lembram e interpretam o passado.", "c", [("a", "Somente datas de batalhas"), ("b", "Apenas documentos oficiais"), ("c", "Como grupos lembram e interpretam o passado")]),
    ),
    ("Geografia", "6-8"): (
        q("EASY", "Para que serve um globo terrestre?", "O globo ajuda a representar a Terra.", "a", [("a", "Para representar a Terra"), ("b", "Para medir a chuva"), ("c", "Para cozinhar")]),
        q("EASY", "Qual lugar costuma aparecer em um mapa da escola?", "Mapas mostram lugares como salas, patio e biblioteca.", "c", [("a", "Somente planetas"), ("b", "Apenas animais"), ("c", "Salas, patio e outros lugares")]),
        q("MEDIUM", "O que encontramos em um bairro?", "Bairros tem casas, ruas, pracas e servicos.", "b", [("a", "So rios"), ("b", "Casas, ruas e servicos"), ("c", "Apenas fazendas")]),
        q("MEDIUM", "Para que serve a rosa dos ventos?", "Ela ajuda a indicar direcoes.", "a", [("a", "Para indicar direcoes"), ("b", "Para marcar pontos de jogo"), ("c", "Para contar pessoas")]),
        q("HARD", "O que significa cuidar do lugar onde vivemos?", "Significa manter ruas, pracas e natureza limpas e preservadas.", "b", [("a", "Jogar lixo no chao"), ("b", "Conservar e manter limpo"), ("c", "Fechar todas as pracas")]),
        q("HARD", "O que um mapa pode mostrar?", "Mapas mostram localizacao e caminhos.", "c", [("a", "So historias inventadas"), ("b", "Apenas receitas"), ("c", "Lugares, caminhos e localizacao")]),
    ),
    ("Geografia", "9-12"): (
        q("EASY", "O que e clima?", "Clima e o comportamento medio do tempo atmosferico ao longo de muitos anos.", "b", [("a", "Apenas a chuva de hoje"), ("b", "As condicoes medias do tempo de uma regiao"), ("c", "O relevo de uma cidade")]),
        q("EASY", "O que e relevo?", "Relevo e o conjunto de formas da superficie terrestre.", "a", [("a", "As formas da superficie terrestre"), ("b", "Os rios subterraneos"), ("c", "As leis de um pais")]),
        q("MEDIUM", "Por que os rios sao importantes para as cidades?", "Eles ajudam no abastecimento, transporte e atividades economicas.", "c", [("a", "Porque impedem a agricultura"), ("b", "Porque servem apenas para lazer"), ("c", "Porque ajudam no abastecimento e nas atividades humanas")]),
        q("MEDIUM", "O que e populacao urbana?", "Populacao urbana vive em cidades.", "b", [("a", "Pessoas que vivem em florestas"), ("b", "Pessoas que vivem nas cidades"), ("c", "Animais de uma regiao")]),
        q("HARD", "O que significa uma regiao ter diferentes paisagens?", "Significa que ela apresenta combinacoes variadas de elementos naturais e humanos.", "a", [("a", "Que possui elementos naturais e humanos variados"), ("b", "Que nunca mudou"), ("c", "Que nao aparece em mapas")]),
        q("HARD", "Por que a preservacao das nascentes e importante?", "Porque elas ajudam a manter os rios e o abastecimento de agua.", "c", [("a", "Porque aumentam o lixo"), ("b", "Porque impedem a chuva"), ("c", "Porque ajudam a manter rios e agua disponivel")]),
    ),
    ("Geografia", "13-15"): (
        q("EASY", "O que e urbanizacao?", "Urbanizacao e o crescimento das cidades e da populacao urbana.", "a", [("a", "Crescimento das cidades"), ("b", "Diminuicao das estradas"), ("c", "Formacao de montanhas")]),
        q("EASY", "O que mede o IDH?", "O IDH combina renda, educacao e longevidade.", "b", [("a", "Somente a quantidade de carros"), ("b", "Aspectos de renda, educacao e longevidade"), ("c", "Apenas a extensao territorial")]),
        q("MEDIUM", "Por que a globalizacao altera os habitos de consumo?", "Ela conecta mercados, informacoes e produtos em escala mundial.", "c", [("a", "Porque encerra o comercio"), ("b", "Porque elimina a tecnologia"), ("c", "Porque conecta mercados e circulacao de produtos")]),
        q("MEDIUM", "O que e segregacao socioespacial?", "E a separacao de grupos sociais em diferentes areas da cidade.", "a", [("a", "Separacao de grupos em espacos urbanos distintos"), ("b", "Mistura completa de renda na cidade"), ("c", "Apenas a divisao de bairros por rios")]),
        q("HARD", "Como a matriz energetica influencia um pais?", "Ela afeta custos, impactos ambientais e seguranca no abastecimento.", "b", [("a", "Nao influencia economia nem ambiente"), ("b", "Influencia economia, ambiente e abastecimento"), ("c", "Serve apenas para transporte individual")]),
        q("HARD", "O que caracteriza uma rede urbana?", "Rede urbana e o conjunto de cidades conectadas por fluxos de pessoas, mercadorias e informacoes.", "c", [("a", "Apenas ruas dentro de um bairro"), ("b", "Somente estradas federais"), ("c", "Conjunto de cidades conectadas por fluxos")]),
    ),
    ("Ciências", "6-8"): (
        q("EASY", "Para que servem os ossos no corpo?", "Os ossos ajudam a sustentar e proteger o corpo.", "a", [("a", "Sustentar e proteger o corpo"), ("b", "Somente colorir a pele"), ("c", "Fazer o cabelo crescer")]),
        q("EASY", "O que precisamos fazer antes de comer?", "Lavar as maos ajuda a evitar doencas.", "b", [("a", "Correr bastante"), ("b", "Lavar as maos"), ("c", "Apagar a luz")]),
        q("MEDIUM", "Qual parte da planta costuma ficar no solo?", "As raizes ficam no solo e ajudam a absorver agua.", "c", [("a", "As flores"), ("b", "As folhas"), ("c", "As raizes")]),
        q("MEDIUM", "Por que precisamos dormir?", "Dormir ajuda o corpo e o cerebro a descansar.", "a", [("a", "Para descansar e recuperar energia"), ("b", "Para aprender menos"), ("c", "Para parar de respirar")]),
        q("HARD", "O que acontece com o gelo fora da geladeira?", "Ele derrete e vira agua liquida.", "b", [("a", "Vira pedra"), ("b", "Derrete e vira liquido"), ("c", "Desaparece sem deixar nada")]),
        q("HARD", "Por que separar o lixo pode ajudar o planeta?", "A separacao facilita reciclagem e reduz desperdicio.", "c", [("a", "Porque aumenta a sujeira"), ("b", "Porque mistura tudo de novo"), ("c", "Porque ajuda na reciclagem e no cuidado ambiental")]),
    ),
    ("Ciências", "9-12"): (
        q("EASY", "Qual orgao bombeia sangue para o corpo?", "O coracao bombeia sangue.", "b", [("a", "Pulmao"), ("b", "Coracao"), ("c", "Estomago")]),
        q("EASY", "O que acontece na evaporacao?", "Na evaporacao, um liquido passa ao estado gasoso.", "a", [("a", "O liquido vira gas"), ("b", "O gas vira liquido"), ("c", "O sol esfria a agua")]),
        q("MEDIUM", "Por que a alimentacao equilibrada e importante?", "Ela fornece nutrientes para crescimento e funcionamento do corpo.", "c", [("a", "Porque elimina a necessidade de agua"), ("b", "Porque substitui o sono"), ("c", "Porque fornece nutrientes para o corpo")]),
        q("MEDIUM", "O que e cadeia alimentar?", "E a relacao de alimentacao entre seres vivos.", "b", [("a", "Um conjunto de correntes de metal"), ("b", "Relacao de alimentacao entre seres vivos"), ("c", "Um tipo de relevo")]),
        q("HARD", "Por que a vacinacao e importante?", "Vacinas ajudam a prevenir doencas e proteger a comunidade.", "a", [("a", "Porque ajuda a prevenir doencas"), ("b", "Porque substitui toda higiene"), ("c", "Porque evita o crescimento")]),
        q("HARD", "O que significa biodiversidade?", "Biodiversidade e a variedade de seres vivos em um ambiente.", "c", [("a", "Apenas plantas de uma horta"), ("b", "A quantidade de carros em uma cidade"), ("c", "A variedade de seres vivos de um ambiente")]),
    ),
    ("Ciências", "13-15"): (
        q("EASY", "O que e selecao natural?", "Selecao natural favorece caracteristicas que aumentam sobrevivencia e reproducao.", "b", [("a", "Escolha humana de especies"), ("b", "Processo em que caracteristicas vantajosas tendem a permanecer"), ("c", "Mistura de rochas")]),
        q("EASY", "Qual a funcao dos ribossomos?", "Ribossomos participam da sintese de proteinas.", "a", [("a", "Produzir proteinas"), ("b", "Armazenar sangue"), ("c", "Formar planetas")]),
        q("MEDIUM", "O que diferencia uma mudanca fisica de uma mudanca quimica?", "Na mudanca quimica surgem novas substancias.", "c", [("a", "Nao existe diferenca"), ("b", "Mudanca fisica cria atomos novos"), ("c", "Mudanca quimica forma novas substancias")]),
        q("MEDIUM", "Por que os ecossistemas dependem de equilibrio?", "Porque alteracoes em uma parte afetam todo o sistema.", "b", [("a", "Porque cada especie vive isolada"), ("b", "Porque alteracoes afetam todo o sistema"), ("c", "Porque energia nao circula")]),
        q("HARD", "O que e mutacao genetica?", "Mutacao e uma alteracao no material genetico.", "a", [("a", "Alteracao no material genetico"), ("b", "Uma vacina"), ("c", "Uma fase da Lua")]),
        q("HARD", "Por que o metodo cientifico e importante?", "Ele organiza investigacao, evidencia e verificacao.", "c", [("a", "Porque dispensa testes"), ("b", "Porque substitui observacao"), ("c", "Porque ajuda a investigar com evidencias")]),
    ),
    ("Física", "6-8"): (
        q("EASY", "O que faz um objeto com rodas se mover mais facil?", "Rodas ajudam a diminuir o esforco para mover um objeto.", "a", [("a", "As rodas"), ("b", "A chuva"), ("c", "O escuro")]),
        q("EASY", "Quando empurramos uma caixa, estamos usando...", "Empurrar e aplicar uma forca.", "b", [("a", "Somente luz"), ("b", "Forca"), ("c", "Somente som")]),
        q("MEDIUM", "O que faz uma bola descer uma rampa?", "A gravidade puxa a bola para baixo.", "c", [("a", "O vento"), ("b", "A cor da bola"), ("c", "A gravidade")]),
        q("MEDIUM", "Qual exemplo mostra luz?", "A luz do Sol ilumina objetos.", "a", [("a", "A claridade do Sol"), ("b", "O cheiro do bolo"), ("c", "O gosto da fruta")]),
        q("HARD", "Por que um cobertor aquece?", "Ele ajuda a conservar o calor do corpo.", "b", [("a", "Porque cria fogo"), ("b", "Porque ajuda a conservar o calor"), ("c", "Porque pesa mais")]),
        q("HARD", "O que acontece quando batemos palmas?", "Produzimos som por vibracao do ar.", "a", [("a", "Produzimos som"), ("b", "Apagamos a luz"), ("c", "Mudamos a gravidade")]),
    ),
    ("Física", "9-12"): (
        q("EASY", "O que e atrito?", "Atrito e a forca que dificulta o movimento entre superficies.", "b", [("a", "Uma forma de energia eletrica"), ("b", "Uma forca que dificulta o movimento"), ("c", "Um tipo de luz")]),
        q("EASY", "Quando a velocidade de um objeto aumenta, dizemos que ele...", "Quando a velocidade aumenta, ha aceleracao.", "c", [("a", "Parou"), ("b", "Resfriou"), ("c", "Acelerou")]),
        q("MEDIUM", "Por que um cinto de seguranca e importante?", "Ele ajuda a reduzir o impacto sobre o corpo em uma freada.", "a", [("a", "Porque protege o corpo em freagens e colisao"), ("b", "Porque faz o carro andar mais"), ("c", "Porque substitui o freio")]),
        q("MEDIUM", "O que e um circuito eletrico simples?", "E um caminho fechado por onde a corrente pode passar.", "b", [("a", "Um desenho sem energia"), ("b", "Um caminho fechado para a corrente eletrica"), ("c", "Apenas uma pilha solta")]),
        q("HARD", "Por que espelhos mudam a direcao da luz?", "Porque refletem os raios luminosos.", "c", [("a", "Porque absorvem toda a luz"), ("b", "Porque apagam a imagem"), ("c", "Porque refletem a luz")]),
        q("HARD", "O que significa densidade de um material?", "Densidade relaciona massa e volume.", "a", [("a", "Relacao entre massa e volume"), ("b", "Quantidade de calor"), ("c", "Rapidez de um som")]),
    ),
    ("Física", "13-15"): (
        q("EASY", "O que e trabalho mecanico na Fisica?", "Trabalho ocorre quando uma forca provoca deslocamento.", "a", [("a", "Acao de uma forca com deslocamento"), ("b", "Apenas estar cansado"), ("c", "Qualquer movimento sem forca")]),
        q("EASY", "O que representa a aceleracao?", "Representa a variacao da velocidade no tempo.", "c", [("a", "A posicao final do objeto"), ("b", "A energia do objeto"), ("c", "A variacao da velocidade no tempo")]),
        q("MEDIUM", "Por que a energia mecanica pode se conservar?", "Quando nao ha perdas relevantes, a soma de energias cinetica e potencial se mantem.", "b", [("a", "Porque a massa some"), ("b", "Porque a soma das energias pode permanecer constante"), ("c", "Porque o tempo para")]),
        q("MEDIUM", "O que e inducao eletromagnetica?", "E a geracao de corrente por variacao de campo magnetico.", "a", [("a", "Geracao de corrente por variacao do campo magnetico"), ("b", "Apenas aquecimento por atrito"), ("c", "Quebra de atomos")]),
        q("HARD", "Em um grafico velocidade x tempo, o que a area pode representar?", "A area sob a curva pode representar o deslocamento.", "c", [("a", "A massa"), ("b", "A densidade"), ("c", "O deslocamento")]),
        q("HARD", "Por que a segunda lei de Newton e importante?", "Ela relaciona forca resultante, massa e aceleracao.", "b", [("a", "Porque explica apenas a luz"), ("b", "Porque relaciona forca, massa e aceleracao"), ("c", "Porque substitui a energia")]),
    ),
    ("Química", "6-8"): (
        q("EASY", "Quando misturamos agua e achocolatado, estamos fazendo...", "Estamos formando uma mistura.", "a", [("a", "Uma mistura"), ("b", "Uma planta"), ("c", "Uma estrela")]),
        q("EASY", "O que acontece com o chocolate em po ao mexer no leite?", "Ele se espalha pelo liquido.", "b", [("a", "Vira pedra"), ("b", "Se mistura ao leite"), ("c", "Desaparece do copo")]),
        q("MEDIUM", "Qual material costuma ser transparente?", "O vidro costuma ser transparente.", "c", [("a", "Madeira"), ("b", "Ferro"), ("c", "Vidro")]),
        q("MEDIUM", "O que muda quando a agua congela?", "Ela muda de estado fisico e vira solido.", "a", [("a", "O estado fisico"), ("b", "O planeta"), ("c", "A gravidade")]),
        q("HARD", "Por que nao devemos misturar produtos de limpeza sem orientacao?", "Porque a mistura pode ser perigosa.", "b", [("a", "Porque sempre vira agua"), ("b", "Porque pode causar reacoes perigosas"), ("c", "Porque perde a cor")]),
        q("HARD", "O que e dissolver uma substancia?", "E quando uma substancia se espalha em outra formando uma mistura uniforme.", "c", [("a", "Quebrar um brinquedo"), ("b", "Congelar um liquido"), ("c", "Espalhar uma substancia em outra de forma uniforme")]),
    ),
    ("Química", "9-12"): (
        q("EASY", "O que e materia?", "Materia e tudo o que tem massa e ocupa lugar no espaco.", "a", [("a", "Tudo o que tem massa e ocupa espaco"), ("b", "Somente liquidos"), ("c", "Apenas metais")]),
        q("EASY", "Qual exemplo representa uma substancia pura?", "Agua destilada e um exemplo de substancia pura.", "b", [("a", "Salada"), ("b", "Agua destilada"), ("c", "Suco com gelo")]),
        q("MEDIUM", "O que diferencia mistura homogenea de heterogenea?", "Na homogenea, os componentes nao sao distinguidos facilmente.", "c", [("a", "Mistura heterogenea tem apenas agua"), ("b", "Homogenea sempre tem cor azul"), ("c", "Na homogenea os componentes parecem formar uma fase unica")]),
        q("MEDIUM", "Para que serve a tabela periodica?", "Ela organiza os elementos quimicos.", "a", [("a", "Para organizar os elementos quimicos"), ("b", "Para medir a velocidade"), ("c", "Para localizar paises")]),
        q("HARD", "O que e uma reacao quimica?", "E uma transformacao em que novas substancias podem ser formadas.", "b", [("a", "Apenas mudanca de tamanho"), ("b", "Transformacao que pode formar novas substancias"), ("c", "Qualquer movimento no espaco")]),
        q("HARD", "Por que a conservacao da massa e importante em Quimica?", "Ela indica que a massa total se mantem em sistema fechado.", "c", [("a", "Porque a massa desaparece"), ("b", "Porque a massa sempre dobra"), ("c", "Porque a massa total se conserva em sistema fechado")]),
    ),
    ("Química", "13-15"): (
        q("EASY", "O que caracteriza uma ligacao ionica?", "Ela envolve transferencia de eletrons entre atomos.", "b", [("a", "Compartilhamento igual de calor"), ("b", "Transferencia de eletrons"), ("c", "Apenas contato fisico")]),
        q("EASY", "O que significa pH menor que 7?", "Indica acidez.", "a", [("a", "Solucao acida"), ("b", "Solucao basica"), ("c", "Solucao neutra")]),
        q("MEDIUM", "O que e concentracao de uma solucao?", "E a relacao entre quantidade de soluto e volume de solucao.", "c", [("a", "Somente a cor da mistura"), ("b", "A massa do recipiente"), ("c", "A relacao entre soluto e solucao")]),
        q("MEDIUM", "Por que a eletronegatividade importa nas ligacoes?", "Ela ajuda a prever como os eletrons serao atraidos.", "b", [("a", "Porque mede apenas a temperatura"), ("b", "Porque indica a atracao por eletrons"), ("c", "Porque substitui a tabela periodica")]),
        q("HARD", "O que e mol na Quimica?", "Mol e unidade de quantidade de materia.", "a", [("a", "Unidade de quantidade de materia"), ("b", "Tipo de atomo instavel"), ("c", "Volume padrao de qualquer liquido")]),
        q("HARD", "Por que o equilibrio quimico nao significa ausencia de reacao?", "Porque as reacoes direta e inversa continuam ocorrendo com mesma velocidade.", "c", [("a", "Porque tudo para completamente"), ("b", "Porque nao ha substancias presentes"), ("c", "Porque as reacoes continuam com velocidades iguais")]),
    ),
    ("Filosofia", "6-8"): (
        q("EASY", "O que significa ouvir o colega com respeito?", "Significa prestar atencao sem interromper o tempo todo.", "a", [("a", "Escutar com atencao e respeito"), ("b", "Falar sozinho sempre"), ("c", "Ignorar a outra pessoa")]),
        q("EASY", "Quando pensamos antes de agir, estamos...", "Estamos refletindo sobre a acao.", "b", [("a", "Dormindo"), ("b", "Refletindo"), ("c", "Esquecendo tudo")]),
        q("MEDIUM", "Por que combinar regras em um jogo pode ser importante?", "Porque regras ajudam a convivencia e a justica entre todos.", "c", [("a", "Para ninguem jogar"), ("b", "Para mudar a brincadeira toda hora"), ("c", "Para todos saberem como participar")]),
        q("MEDIUM", "O que e fazer uma boa pergunta?", "E perguntar para entender melhor algo.", "a", [("a", "Perguntar para compreender"), ("b", "Responder sem pensar"), ("c", "Ficar sempre em silencio")]),
        q("HARD", "Por que podemos ter opinioes diferentes?", "Porque pessoas observam e pensam de modos diferentes.", "b", [("a", "Porque apenas uma pessoa pensa"), ("b", "Porque pessoas podem pensar de modos diferentes"), ("c", "Porque opiniao e sempre um erro")]),
        q("HARD", "O que e ser justo?", "Ser justo e considerar todos com equilibrio e respeito.", "c", [("a", "Escolher sempre o mesmo amigo"), ("b", "Mandar nos outros"), ("c", "Tratar as pessoas com equilibrio e respeito")]),
    ),
    ("Filosofia", "9-12"): (
        q("EASY", "O que e argumentar?", "Argumentar e defender uma ideia com razoes.", "a", [("a", "Defender uma ideia com razoes"), ("b", "Gritar mais alto"), ("c", "Copiar qualquer opiniao")]),
        q("EASY", "Por que o dialogo e importante?", "Porque ajuda a ouvir, responder e construir entendimento.", "b", [("a", "Porque evita pensar"), ("b", "Porque ajuda a compreender diferentes pontos de vista"), ("c", "Porque sempre termina em disputa")]),
        q("MEDIUM", "O que e etica?", "Etica estuda valores e escolhas sobre o bem agir.", "c", [("a", "Apenas etiqueta social"), ("b", "Uma lista de materias escolares"), ("c", "Reflexao sobre valores e escolhas")]),
        q("MEDIUM", "Quando uma opiniao precisa de justificativa?", "Quando queremos defendela de forma clara e racional.", "a", [("a", "Quando queremos defende-la com clareza"), ("b", "Nunca"), ("c", "So em provas de matematica")]),
        q("HARD", "Por que uma regra pode ser questionada filosoficamente?", "Porque podemos analisar se ela e justa, util e respeitosa.", "b", [("a", "Porque toda regra e perfeita"), ("b", "Porque podemos discutir se ela e justa"), ("c", "Porque regras nao afetam ninguem")]),
        q("HARD", "O que e coerencia em um argumento?", "E quando as ideias fazem sentido entre si e nao se contradizem.", "c", [("a", "Mudar de ideia a cada frase"), ("b", "Usar palavras dificeis"), ("c", "Manter ideias consistentes sem contradicao")]),
    ),
    ("Filosofia", "13-15"): (
        q("EASY", "O que e epistemologia?", "Epistemologia investiga o conhecimento e como o justificamos.", "a", [("a", "Estudo do conhecimento"), ("b", "Estudo apenas da politica"), ("c", "Tecnica de memorizacao")]),
        q("EASY", "Qual pergunta e tipica da etica?", "A etica pergunta como devemos agir.", "b", [("a", "Qual e a formula da area?"), ("b", "Como devemos agir?"), ("c", "Quantos continentes existem?")]),
        q("MEDIUM", "O que significa dizer que uma ideia e um argumento valido?", "Significa que a conclusao decorre das premissas.", "c", [("a", "Que a ideia e popular"), ("b", "Que a ideia e antiga"), ("c", "Que a conclusao decorre das premissas")]),
        q("MEDIUM", "Por que o conceito de liberdade e debatido na Filosofia?", "Porque envolve escolhas, limites e responsabilidade.", "a", [("a", "Porque envolve escolhas e responsabilidade"), ("b", "Porque so existe em livros"), ("c", "Porque nao afeta a vida social")]),
        q("HARD", "O que e utilitarismo?", "E a teoria que avalia a acao por suas consequencias e pelo bem-estar gerado.", "b", [("a", "Teoria que rejeita qualquer regra"), ("b", "Teoria que avalia a acao pelo bem-estar gerado"), ("c", "Teoria que afirma que nada pode ser conhecido")]),
        q("HARD", "Por que a Filosofia Politica discute o Estado?", "Porque analisa poder, direitos, deveres e organizacao social.", "c", [("a", "Porque trata apenas da economia familiar"), ("b", "Porque elimina o debate sobre direitos"), ("c", "Porque analisa poder, direitos e organizacao social")]),
    ),
    ("Artes", "6-8"): (
        q("EASY", "O que podemos misturar para criar novas cores?", "Misturar tintas pode criar novas cores.", "a", [("a", "Tintas"), ("b", "Pedras"), ("c", "Sombras")]),
        q("EASY", "Qual material pode ser usado para desenhar?", "Lapis de cor pode ser usado para desenhar.", "c", [("a", "Talher"), ("b", "Toalha"), ("c", "Lapis de cor")]),
        q("MEDIUM", "O que e ritmo em uma musica?", "Ritmo e a organizacao dos tempos e batidas.", "b", [("a", "A cor do instrumento"), ("b", "A organizacao das batidas"), ("c", "O tamanho do palco")]),
        q("MEDIUM", "Por que um artista observa o mundo ao redor?", "Para criar obras inspiradas em pessoas, lugares e sentimentos.", "a", [("a", "Para criar a partir do que ve e sente"), ("b", "Para nunca imaginar nada"), ("c", "Para copiar tudo sem pensar")]),
        q("HARD", "O que uma escultura pode ocupar no espaco?", "Esculturas ocupam volume no espaco.", "b", [("a", "Somente um papel"), ("b", "Volume e espaco"), ("c", "Apenas som")]),
        q("HARD", "Por que uma apresentacao artistica pode contar uma historia?", "Porque movimentos, sons e imagens comunicam ideias.", "c", [("a", "Porque arte nao comunica nada"), ("b", "Porque depende so de numeros"), ("c", "Porque arte comunica ideias e sentimentos")]),
    ),
    ("Artes", "9-12"): (
        q("EASY", "O que e contraste nas artes visuais?", "Contraste destaca diferencas de cor, luz ou forma.", "a", [("a", "Diferenca que destaca elementos"), ("b", "Ausencia de cor"), ("c", "Som muito baixo")]),
        q("EASY", "Para que servem os ensaios em uma apresentacao?", "Ensaios ajudam a preparar e melhorar a execucao.", "b", [("a", "Para decorar a sala"), ("b", "Para preparar melhor a apresentacao"), ("c", "Para substituir o publico")]),
        q("MEDIUM", "O que uma trilha sonora faz em um filme?", "Ela ajuda a criar clima e emocao.", "c", [("a", "Apaga as imagens"), ("b", "Substitui os atores"), ("c", "Ajuda a criar clima e emocao")]),
        q("MEDIUM", "Por que a arte pode representar a cultura de um povo?", "Porque ela expressa costumes, valores e visoes de mundo.", "a", [("a", "Porque expressa costumes e valores"), ("b", "Porque nao tem relacao com a sociedade"), ("c", "Porque serve so para decorar")]),
        q("HARD", "O que e perspectiva em um desenho?", "Perspectiva cria sensacao de profundidade.", "b", [("a", "Uma forma de apagar linhas"), ("b", "Um recurso para criar profundidade"), ("c", "Apenas o uso de tinta preta")]),
        q("HARD", "Por que um movimento artistico costuma surgir?", "Porque artistas respondem a contextos historicos e culturais.", "c", [("a", "Porque todos sempre repetem o mesmo estilo"), ("b", "Porque a arte nao muda com o tempo"), ("c", "Porque artistas respondem ao seu contexto")]),
    ),
    ("Artes", "13-15"): (
        q("EASY", "O que e linguagem artistica?", "E o conjunto de formas de expressao como musica, teatro, danca e artes visuais.", "a", [("a", "Forma de expressao artistica"), ("b", "Apenas um idioma"), ("c", "Somente a escrita formal")]),
        q("EASY", "Por que a arte contemporanea pode usar materiais incomuns?", "Porque busca ampliar formas de expressao.", "b", [("a", "Porque nao precisa ter sentido"), ("b", "Porque amplia possibilidades de expressao"), ("c", "Porque proibe pintura")]),
        q("MEDIUM", "O que uma curadoria faz em uma exposicao?", "A curadoria seleciona e organiza obras de acordo com uma proposta.", "c", [("a", "Pinta os quadros"), ("b", "Substitui os artistas"), ("c", "Seleciona e organiza obras")]),
        q("MEDIUM", "Por que analisar contexto historico ajuda a interpretar uma obra?", "Porque a obra dialoga com o tempo em que foi criada.", "a", [("a", "Porque a obra dialoga com seu tempo"), ("b", "Porque toda obra e igual"), ("c", "Porque so importa a moldura")]),
        q("HARD", "O que diferencia forma e conteudo em uma obra?", "Forma e como a obra se organiza; conteudo e o que ela comunica.", "b", [("a", "Nao existe diferenca"), ("b", "Forma e organizacao; conteudo e sentido"), ("c", "Forma e sempre mais importante que conteudo")]),
        q("HARD", "Por que a arte pode ser vista como critica social?", "Porque pode questionar valores, injusticas e relacoes de poder.", "c", [("a", "Porque evita qualquer debate"), ("b", "Porque serve apenas para decorar"), ("c", "Porque pode questionar a sociedade")]),
    ),
    ("Educação Financeira", "6-8"): (
        q("EASY", "O que significa guardar moedas para depois?", "Significa economizar para usar em outro momento.", "a", [("a", "Economizar"), ("b", "Perder dinheiro"), ("c", "Jogar fora")]),
        q("EASY", "Quando pensamos antes de comprar um brinquedo, estamos...", "Estamos fazendo uma escolha com cuidado.", "b", [("a", "Esquecendo do valor"), ("b", "Pensando antes de gastar"), ("c", "Gastando sem olhar")]),
        q("MEDIUM", "Por que nao podemos comprar tudo ao mesmo tempo?", "Porque o dinheiro e limitado e precisamos escolher.", "c", [("a", "Porque nao existem lojas"), ("b", "Porque todos os brinquedos acabam"), ("c", "Porque o dinheiro e limitado")]),
        q("MEDIUM", "O que e compartilhar recursos com a familia?", "E usar com responsabilidade o que todos precisam.", "a", [("a", "Usar com responsabilidade o que a familia tem"), ("b", "Esconder tudo"), ("c", "Gastar escondido")]),
        q("HARD", "Por que ter um objetivo ajuda a economizar?", "Porque fica mais facil decidir guardar para algo importante.", "b", [("a", "Porque faz tudo ficar gratis"), ("b", "Porque ajuda a guardar para uma meta"), ("c", "Porque o dinheiro se multiplica sozinho")]),
        q("HARD", "O que e uma escolha inteligente com dinheiro?", "E pensar no que realmente precisamos ou planejamos.", "c", [("a", "Comprar sem olhar o preco"), ("b", "Gastar so porque deu vontade"), ("c", "Pensar antes e escolher com responsabilidade")]),
    ),
    ("Educação Financeira", "9-12"): (
        q("EASY", "O que e um gasto necessario?", "E um gasto importante para necessidades reais.", "a", [("a", "Um gasto com algo importante"), ("b", "Qualquer gasto impulsivo"), ("c", "Um gasto invisivel")]),
        q("EASY", "Por que anotar entradas e saidas de dinheiro ajuda?", "Ajuda a entender para onde o dinheiro vai.", "b", [("a", "Porque aumenta automaticamente a renda"), ("b", "Porque ajuda a controlar o uso do dinheiro"), ("c", "Porque elimina todos os gastos")]),
        q("MEDIUM", "O que e um orçamento?", "Orcamento e um planejamento de ganhos e gastos.", "c", [("a", "Uma lista de sonhos"), ("b", "Um tipo de conta bancaria"), ("c", "Um planejamento de ganhos e gastos")]),
        q("MEDIUM", "Por que comparar precos e importante?", "Porque ajuda a comprar melhor e evitar desperdicios.", "a", [("a", "Porque ajuda a fazer escolhas melhores"), ("b", "Porque todo produto tem o mesmo preco"), ("c", "Porque o mais caro e sempre melhor")]),
        q("HARD", "O que significa consumo consciente?", "Significa pensar no impacto da compra e evitar excessos.", "b", [("a", "Comprar sem refletir"), ("b", "Pensar no impacto e evitar excessos"), ("c", "Gastar para acabar logo com o dinheiro")]),
        q("HARD", "Por que uma reserva ajuda em imprevistos?", "Porque dinheiro guardado pode ser usado em emergencias.", "c", [("a", "Porque impede qualquer problema"), ("b", "Porque elimina a necessidade de planejar"), ("c", "Porque ajuda a lidar com emergencias")]),
    ),
    ("Educação Financeira", "13-15"): (
        q("EASY", "O que e juros?", "Juros sao valores cobrados ou recebidos pelo uso do dinheiro no tempo.", "a", [("a", "Valor relacionado ao uso do dinheiro no tempo"), ("b", "Apenas o preco de um produto"), ("c", "Uma taxa de energia")]),
        q("EASY", "Por que parcelar uma compra exige cuidado?", "Porque parcelas afetam o orçamento futuro.", "b", [("a", "Porque o produto some"), ("b", "Porque compromete parte da renda futura"), ("c", "Porque sempre sai de graca")]),
        q("MEDIUM", "O que significa diversificar investimentos?", "Significa distribuir recursos para reduzir riscos.", "c", [("a", "Colocar tudo em uma unica opcao"), ("b", "Parar de investir"), ("c", "Distribuir recursos entre opcoes diferentes")]),
        q("MEDIUM", "Como a inflacao afeta o poder de compra?", "Com inflacao alta, o mesmo dinheiro compra menos.", "a", [("a", "O dinheiro passa a comprar menos"), ("b", "Tudo fica mais barato"), ("c", "O salario sempre dobra")]),
        q("HARD", "Por que analisar risco e retorno e importante?", "Porque decisoes financeiras envolvem ganhos possiveis e perdas possiveis.", "b", [("a", "Porque risco nunca existe"), ("b", "Porque toda decisao envolve possiveis ganhos e perdas"), ("c", "Porque retorno alto e sempre garantido")]),
        q("HARD", "O que uma taxa de juros elevada pode causar em um emprestimo?", "Pode aumentar muito o valor total pago.", "c", [("a", "Reduzir automaticamente a divida"), ("b", "Eliminar as parcelas"), ("c", "Aumentar o custo total do emprestimo")]),
    ),
    ("Lógica", "6-8"): (
        q("EASY", "Qual figura vem depois de triangulo, quadrado, triangulo, quadrado...?", "A sequencia alterna triangulo e quadrado.", "a", [("a", "Triangulo"), ("b", "Circulo"), ("c", "Estrela")]),
        q("EASY", "Se hoje e dia de aula, amanha e mais provavel ser...", "Depois de um dia, vem o dia seguinte.", "b", [("a", "Ontem"), ("b", "Amanha"), ("c", "Ano passado")]),
        q("MEDIUM", "Se todos os gatos sao animais e Mimi e um gato, Mimi e...", "Se Mimi e um gato, entao tambem e um animal.", "c", [("a", "Uma planta"), ("b", "Um brinquedo"), ("c", "Um animal")]),
        q("MEDIUM", "Qual objeto nao combina com os outros: maca, banana, cenoura?", "Cenoura nao e fruta como as outras.", "a", [("a", "Cenoura"), ("b", "Maca"), ("c", "Banana")]),
        q("HARD", "Se uma regra diz 'so entra quem tem cracha', o que e preciso para entrar?", "E preciso ter cracha.", "b", [("a", "Correr ate a porta"), ("b", "Ter cracha"), ("c", "Levar um brinquedo")]),
        q("HARD", "Quando resolvemos um problema passo a passo, estamos usando...", "Estamos usando raciocinio logico.", "c", [("a", "So sorte"), ("b", "Somente memoria"), ("c", "Raciocinio logico")]),
    ),
    ("Lógica", "9-12"): (
        q("EASY", "Se Ana e mais alta que Bia e Bia e mais alta que Caio, Ana e...", "Ana e mais alta que Caio.", "a", [("a", "Mais alta que Caio"), ("b", "Mais baixa que Caio"), ("c", "Da mesma altura que todos")]),
        q("EASY", "Qual numero completa a sequencia 5, 10, 15, ...?", "A sequencia cresce de 5 em 5.", "b", [("a", "18"), ("b", "20"), ("c", "25")]),
        q("MEDIUM", "O que e uma condicao necessaria em um problema?", "E algo que precisa acontecer para o resultado ser possivel.", "c", [("a", "Algo sem importancia"), ("b", "Uma opiniao qualquer"), ("c", "Algo que precisa ocorrer para o resultado acontecer")]),
        q("MEDIUM", "Se uma afirmacao e falsa, sua negacao sera...", "A negacao de uma afirmacao falsa e verdadeira.", "a", [("a", "Verdadeira"), ("b", "Tambem falsa"), ("c", "Sempre impossivel")]),
        q("HARD", "O que e um padrao em uma sequencia?", "E uma regra que ajuda a prever os proximos elementos.", "b", [("a", "Uma excecao aleatoria"), ("b", "Uma regra de repeticao ou variacao"), ("c", "Um erro no exercicio")]),
        q("HARD", "Por que organizar informacoes em tabelas ou diagramas pode ajudar?", "Porque facilita comparar dados e encontrar relacoes.", "c", [("a", "Porque deixa tudo mais confuso"), ("b", "Porque elimina a necessidade de pensar"), ("c", "Porque ajuda a comparar e encontrar relacoes")]),
    ),
    ("Lógica", "13-15"): (
        q("EASY", "Se p e verdadeiro e q e falso, qual o valor de p e q (p e q)?", "A conjuncao so e verdadeira quando as duas partes sao verdadeiras.", "b", [("a", "Verdadeiro"), ("b", "Falso"), ("c", "Indefinido")]),
        q("EASY", "O que e uma premissa em um argumento?", "Premissa e uma afirmacao usada para sustentar a conclusao.", "a", [("a", "Afirmacao que sustenta a conclusao"), ("b", "A conclusao final"), ("c", "Um erro de digitacao")]),
        q("MEDIUM", "Qual e a negacao de 'Todos os alunos passaram'?", "A negacao correta afirma que pelo menos um nao passou.", "c", [("a", "Nenhum aluno passou"), ("b", "Todos os alunos reprovaram"), ("c", "Pelo menos um aluno nao passou")]),
        q("MEDIUM", "O que torna um argumento dedutivo valido?", "A validade depende da conclusao decorrer logicamente das premissas.", "b", [("a", "Ser popular"), ("b", "A conclusao seguir das premissas"), ("c", "Ter palavras dificeis")]),
        q("HARD", "O que e uma falacia?", "Falacia e um erro de raciocinio que parece convincente.", "a", [("a", "Erro de raciocinio com aparencia de argumento"), ("b", "Um teorema matematico"), ("c", "Uma conclusao sempre verdadeira")]),
        q("HARD", "Por que simbolos logicos ajudam na analise de argumentos?", "Porque deixam a estrutura do raciocinio mais clara.", "c", [("a", "Porque substituem todo o significado"), ("b", "Porque eliminam premissas"), ("c", "Porque ajudam a ver a estrutura do argumento")]),
    ),
    ("Programação básica", "6-8"): (
        q("EASY", "O que um robo precisa para saber o que fazer?", "Ele precisa de instrucoes.", "a", [("a", "Instrucoes"), ("b", "Magica"), ("c", "Sono")]),
        q("EASY", "Quando seguimos passos para montar algo, estamos usando...", "Estamos seguindo uma sequencia de passos.", "b", [("a", "Apenas sorte"), ("b", "Uma sequencia de instrucoes"), ("c", "Um desenho aleatorio")]),
        q("MEDIUM", "O que significa repetir uma acao varias vezes em um programa?", "Significa executar novamente um mesmo passo ou bloco.", "c", [("a", "Apagar tudo"), ("b", "Trocar a tela de lugar"), ("c", "Repetir o mesmo comando")]),
        q("MEDIUM", "Se um personagem deve andar 3 passos e depois pular, o programa precisa...", "Precisa seguir a ordem correta dos comandos.", "a", [("a", "Organizar os comandos na ordem certa"), ("b", "Escolher qualquer ordem"), ("c", "Retirar o pulo")]),
        q("HARD", "O que um erro em um programa pode causar?", "Pode fazer o programa agir de forma diferente do esperado.", "b", [("a", "Transformar o computador em brinquedo"), ("b", "Fazer o programa funcionar errado"), ("c", "Criar energia")]),
        q("HARD", "Para que serve testar um programa?", "Serve para verificar se ele funciona como esperado.", "c", [("a", "Para desligar o computador"), ("b", "Para esconder os comandos"), ("c", "Para conferir se esta funcionando certo")]),
    ),
    ("Programação básica", "9-12"): (
        q("EASY", "O que e um algoritmo?", "Algoritmo e uma sequencia de passos para resolver um problema.", "a", [("a", "Sequencia de passos para resolver um problema"), ("b", "Apenas uma tela colorida"), ("c", "Um tipo de cabo")]),
        q("EASY", "O que e uma variavel em programacao?", "Variavel guarda um valor que pode mudar.", "b", [("a", "Um erro permanente"), ("b", "Um espaco para armazenar valor"), ("c", "Uma pasta do sistema")]),
        q("MEDIUM", "O que faz um condicional (if)?", "Ele permite executar acoes dependendo de uma condicao.", "c", [("a", "Repete para sempre"), ("b", "Apaga todos os dados"), ("c", "Toma decisao com base em uma condicao")]),
        q("MEDIUM", "Por que comentarios no codigo podem ajudar?", "Eles explicam a intencao do programa.", "a", [("a", "Porque explicam partes do codigo"), ("b", "Porque executam o programa"), ("c", "Porque substituem testes")]),
        q("HARD", "O que significa depurar um programa?", "Significa investigar e corrigir erros.", "b", [("a", "Copiar o codigo"), ("b", "Encontrar e corrigir erros"), ("c", "Desenhar a interface")]),
        q("HARD", "Por que dividir um problema em partes menores ajuda a programar?", "Porque facilita compreender, testar e resolver.", "c", [("a", "Porque aumenta os erros"), ("b", "Porque elimina a necessidade de planejar"), ("c", "Porque facilita resolver e testar")]),
    ),
    ("Programação básica", "13-15"): (
        q("EASY", "O que e uma funcao em programacao?", "Funcao e um bloco de codigo reutilizavel que realiza uma tarefa.", "a", [("a", "Bloco reutilizavel que executa uma tarefa"), ("b", "Apenas um erro de sintaxe"), ("c", "Um tipo de navegador")]),
        q("EASY", "O que significa tipo de dado?", "Tipo de dado indica a natureza da informacao armazenada.", "b", [("a", "A cor do programa"), ("b", "A natureza da informacao armazenada"), ("c", "A velocidade do processador")]),
        q("MEDIUM", "Por que estruturas de repeticao sao uteis?", "Porque automatizam tarefas repetidas.", "c", [("a", "Porque deixam o programa mais lento sempre"), ("b", "Porque servem apenas para textos"), ("c", "Porque automatizam repeticoes")]),
        q("MEDIUM", "O que diferencia compilacao de interpretacao?", "Compilacao traduz antes da execucao; interpretacao executa e traduz passo a passo.", "a", [("a", "Compilacao traduz antes; interpretacao executa passo a passo"), ("b", "Nao existe diferenca"), ("c", "Interpretacao sempre cria aplicativo final")]),
        q("HARD", "O que e recursao?", "Recursao acontece quando uma funcao chama a si mesma em um caso controlado.", "b", [("a", "Uma tela duplicada"), ("b", "Quando uma funcao chama a si mesma"), ("c", "A troca de linguagem de programacao")]),
        q("HARD", "Por que testes automatizados ajudam no desenvolvimento?", "Porque verificam comportamentos e reduzem regressao.", "c", [("a", "Porque substituem todo planejamento"), ("b", "Porque evitam qualquer manutencao"), ("c", "Porque ajudam a detectar regressoes e validar comportamentos")]),
    ),
    ("Redação", "6-8"): (
        q("EASY", "O que uma frase precisa para fazer sentido?", "Uma frase precisa comunicar uma ideia completa.", "a", [("a", "Expressar uma ideia compreensivel"), ("b", "Ter letras aleatorias"), ("c", "Ser sempre muito longa")]),
        q("EASY", "Por que colocamos espacos entre as palavras?", "Os espacos ajudam a leitura.", "b", [("a", "Para gastar mais papel"), ("b", "Para facilitar a leitura"), ("c", "Para esconder palavras")]),
        q("MEDIUM", "O que ajuda a contar uma historia curta?", "Pensar em comeco, meio e fim ajuda a organizar.", "c", [("a", "Escrever sem ordem nenhuma"), ("b", "Usar apenas nomes"), ("c", "Organizar comeco, meio e fim")]),
        q("MEDIUM", "Por que reler o que escrevemos e importante?", "Ajuda a corrigir e melhorar o texto.", "a", [("a", "Porque ajuda a melhorar o texto"), ("b", "Porque apaga tudo"), ("c", "Porque substitui a escrita")]),
        q("HARD", "O que um titulo pode fazer em um texto?", "O titulo apresenta o assunto ao leitor.", "b", [("a", "Esconder o assunto"), ("b", "Apresentar o assunto do texto"), ("c", "Servir apenas como enfeite")]),
        q("HARD", "Por que usar ponto final ajuda?", "Ele mostra onde uma ideia termina.", "c", [("a", "Porque deixa a frase sem sentido"), ("b", "Porque substitui as palavras"), ("c", "Porque indica o fim de uma ideia")]),
    ),
    ("Redação", "9-12"): (
        q("EASY", "O que e paragrafar um texto?", "E separar ideias em blocos organizados.", "a", [("a", "Separar ideias em paragrafos"), ("b", "Apagar os titulos"), ("c", "Escrever tudo em uma linha")]),
        q("EASY", "Por que conectivos ajudam na escrita?", "Eles ligam ideias e melhoram a fluidez.", "b", [("a", "Porque substituem todo o conteudo"), ("b", "Porque ligam ideias do texto"), ("c", "Porque servem so para enfeitar")]),
        q("MEDIUM", "O que e coesao textual?", "E a ligacao adequada entre partes do texto.", "c", [("a", "Apenas a quantidade de linhas"), ("b", "O tema do texto"), ("c", "A ligacao adequada entre frases e paragrafos")]),
        q("MEDIUM", "Por que revisar a pontuacao e importante?", "Porque pontuacao muda clareza e sentido.", "a", [("a", "Porque ajuda na clareza e no sentido"), ("b", "Porque sempre aumenta o tamanho do texto"), ("c", "Porque substitui os paragrafos")]),
        q("HARD", "O que significa adequar a linguagem ao leitor?", "Significa escolher vocabulario e tom apropriados ao publico.", "b", [("a", "Usar palavras aleatorias"), ("b", "Escolher linguagem apropriada ao publico"), ("c", "Escrever sempre do mesmo jeito")]),
        q("HARD", "Por que exemplos fortalecem um texto explicativo?", "Porque ajudam o leitor a entender a ideia principal.", "c", [("a", "Porque deixam o texto mais confuso"), ("b", "Porque substituem a ideia principal"), ("c", "Porque ajudam a esclarecer o que foi dito")]),
    ),
    ("Redação", "13-15"): (
        q("EASY", "O que e uma tese em um texto argumentativo?", "Tese e a ideia principal defendida pelo autor.", "a", [("a", "A ideia principal defendida"), ("b", "A lista de referencias"), ("c", "O titulo apenas")]),
        q("EASY", "Por que um argumento precisa de sustentacao?", "Porque precisa de dados, exemplos ou explicacoes para convencer.", "b", [("a", "Porque argumento sem base sempre basta"), ("b", "Porque precisa de sustentacao para convencer"), ("c", "Porque so a opiniao pessoal importa")]),
        q("MEDIUM", "O que e repertorio sociocultural em uma redacao?", "E o uso pertinente de conhecimentos externos para enriquecer a argumentacao.", "c", [("a", "So decorar frases prontas"), ("b", "Copiar um texto inteiro"), ("c", "Usar conhecimentos externos de forma pertinente")]),
        q("MEDIUM", "Por que contra-argumentos podem fortalecer a escrita?", "Porque mostram analise mais completa do tema.", "a", [("a", "Porque mostram analise mais ampla"), ("b", "Porque enfraquecem qualquer tese"), ("c", "Porque impedem conclusao")]),
        q("HARD", "O que torna uma conclusao eficaz?", "Ela retoma a tese e fecha o raciocinio com coerencia.", "b", [("a", "Introduzir temas sem relacao"), ("b", "Retomar a tese e fechar o raciocinio"), ("c", "Repetir palavras sem objetivo")]),
        q("HARD", "Por que adequacao ao genero textual e importante?", "Porque cada genero tem finalidade, estrutura e linguagem esperadas.", "c", [("a", "Porque todos os generos sao iguais"), ("b", "Porque basta escrever muito"), ("c", "Porque cada genero tem finalidade e estrutura proprias")]),
    ),
}


def _fetch_skills(subject_name: str, age_group: str) -> list[SkillRow]:
    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT sk.id::text AS id,
                       s.age_group::text AS age_group,
                       s.name AS subject_name
                FROM skills sk
                JOIN subjects s ON s.id = sk.subject_id
                WHERE s.name = :subject_name
                  AND s.age_group::text = :age_group
                ORDER BY sk."order" ASC
                """
            ),
            {"subject_name": subject_name, "age_group": age_group},
        ).all()
    return [SkillRow(id=str(row.id), age_group=str(row.age_group), subject_name=str(row.subject_name)) for row in rows]


def _clear_previous_seed() -> tuple[int, int]:
    with SessionLocal() as db:
        question_ids = db.execute(
            text("SELECT id::text FROM questions WHERE :seed_tag = ANY(tags)"),
            {"seed_tag": SEED_TAG},
        ).scalars().all()
        if not question_ids:
            return 0, 0
        history_deleted = db.execute(
            text("DELETE FROM user_question_history WHERE question_id = ANY(CAST(:question_ids AS uuid[]))"),
            {"question_ids": question_ids},
        ).rowcount or 0
        questions_deleted = db.execute(
            text("DELETE FROM questions WHERE id = ANY(CAST(:question_ids AS uuid[]))"),
            {"question_ids": question_ids},
        ).rowcount or 0
        db.commit()
    return int(questions_deleted), int(history_deleted)


def _insert_question(*, skill_id: str, seed: QuestionSeed, tags: list[str]) -> None:
    metadata = json.dumps(
        {
            "options": [{"id": opt_id, "label": label} for opt_id, label in seed.options],
            "correctOptionId": seed.correct_option_id,
        }
    )
    with SessionLocal() as db:
        db.execute(
            text(
                """
                INSERT INTO questions (skill_id, lesson_id, type, difficulty, prompt, explanation, metadata, tags)
                VALUES (
                    CAST(:skill_id AS uuid),
                    NULL,
                    CAST('MCQ' AS question_type),
                    CAST(:difficulty AS question_difficulty),
                    :prompt,
                    :explanation,
                    CAST(:metadata AS jsonb),
                    CAST(:tags AS text[])
                )
                """
            ),
            {
                "skill_id": skill_id,
                "difficulty": seed.difficulty,
                "prompt": seed.prompt,
                "explanation": seed.explanation,
                "metadata": metadata,
                "tags": tags,
            },
        )
        db.commit()


def run_seed() -> None:
    deleted_questions, deleted_history = _clear_previous_seed()
    inserted = 0
    skills_seen = 0

    for (subject_name, age_group), questions in BANK.items():
        skills = _fetch_skills(subject_name=subject_name, age_group=age_group)
        if not skills:
            print(f"Sem skills para {subject_name} {age_group}. Rode os seeds estruturais antes.")
            continue
        skills_seen += len(skills)
        for index, seed in enumerate(questions):
            skill = skills[index % len(skills)]
            tags = [
                SEED_TAG,
                "general_subject_bank",
                f"subject:{subject_name.lower()}",
                f"age:{age_group}",
                f"difficulty:{seed.difficulty.lower()}",
            ]
            _insert_question(skill_id=skill.id, seed=seed, tags=tags)
            inserted += 1

    print("=== GENERAL SUBJECT BANK SEED RESULT ===")
    print(f"deleted_questions: {deleted_questions}")
    print(f"deleted_history_rows: {deleted_history}")
    print(f"skills_seen: {skills_seen}")
    print(f"questions_inserted: {inserted}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
