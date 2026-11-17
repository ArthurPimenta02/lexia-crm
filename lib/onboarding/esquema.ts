// GERADO a partir do formulário de onboarding em uso (forms.speedymediaus.com, 16/11/2026) mais os campos
// novos aprovados pelo Arthur. Gerador: ~/lexia-memoria/onboarding/gerar_esquema_painel.mjs.
// É o CADERNO de perguntas do onboarding: nada do que está aqui pode ficar sem resposta.
//
// modo:  fonte    = a IA procura nas fontes da Etapa 1; a cliente confirma
//        lexia    = a equipe da Lexia preenche na Etapa 1; a cliente confirma
//        cartao   = escolha rápida (com "recomendado" já marcado, quando há)
//        conversa = a entrevistadora pergunta (de preferência por áudio)
//        arquivo  = pedido de arquivo dentro da conversa
// As perguntas ficam em pt-BR de propósito: a entrevista é feita em português do Brasil.

export type ModoDoCampo = "fonte" | "lexia" | "cartao" | "conversa" | "arquivo";
export type CondicaoSimples = { campo: string; valor?: string; diferenteDe?: string };
export type Condicao = CondicaoSimples | { algum: CondicaoSimples[] };
export type CampoOnboarding = {
  chave: string;
  pergunta: string;
  tipo: string;
  obrigatorio: boolean;
  modo: ModoDoCampo;
  opcoes?: string[];
  ajuda?: string;
  quando?: Condicao;
  recomendado?: string | string[];
  novo?: boolean;
  /** Informação de saúde: a tela pede para conferir com atenção. */
  atencao?: boolean;
};
export type GrupoOnboarding = { chave: GrupoQueRepete; titulo: string; obrigatorio: boolean; ajuda?: string; campos: CampoOnboarding[] };
export type SecaoOnboarding = { chave: string; titulo: string; novo?: boolean; campos: CampoOnboarding[]; grupos: GrupoOnboarding[] };
export type GrupoQueRepete = "servicos" | "profissionais" | "faqs" | "objecoes" | "promocoes";

/** 13 seções, 143 campos. */
export const ESQUEMA_ONBOARDING: SecaoOnboarding[] = [
  {
    "chave": "sobre_o_negocio",
    "titulo": "Sobre o negócio",
    "campos": [
      {
        "chave": "nome_do_negocio",
        "pergunta": "Nome do negócio",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "fonte"
      },
      {
        "chave": "nome_do_responsavel",
        "pergunta": "Nome do responsável",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "lexia"
      },
      {
        "chave": "whatsapp_do_responsavel",
        "pergunta": "WhatsApp do responsável",
        "tipo": "phone",
        "obrigatorio": true,
        "modo": "lexia",
        "ajuda": "Seu número pessoal, para contato da nossa equipe."
      },
      {
        "chave": "whatsapp_do_agente",
        "pergunta": "Número de WhatsApp que o agente vai usar",
        "tipo": "phone",
        "obrigatorio": true,
        "modo": "lexia",
        "ajuda": "O número onde a assistente vai atender os clientes. Pode ser o mesmo acima ou outro."
      },
      {
        "chave": "tempo_do_numero",
        "pergunta": "Esse número de WhatsApp é novo ou já é usado há tempo?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "lexia",
        "opcoes": [
          "Novo / criado há menos de 3 meses",
          "Já uso há mais de 3 meses",
          "Já uso há mais de 1 ano"
        ],
        "ajuda": "Números novos têm mais risco de bloqueio pelo WhatsApp. Isso define o quão conservadores seremos nos envios automáticos."
      },
      {
        "chave": "equipe_responde_no_numero",
        "pergunta": "Além do agente, alguém da equipe também responde clientes por esse número?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "lexia",
        "opcoes": [
          "Sim, com frequência",
          "Sim, às vezes",
          "Não, só o agente"
        ],
        "ajuda": "Importante: quando alguém da equipe responde manualmente, o agente pausa e depois retoma a conversa sabendo o que foi combinado."
      },
      {
        "chave": "endereco_completo",
        "pergunta": "Endereço completo",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "fonte"
      },
      {
        "chave": "cidade",
        "pergunta": "Cidade",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "fonte"
      },
      {
        "chave": "estacionamento_ou_acesso",
        "pergunta": "Tem estacionamento ou referência de acesso?",
        "tipo": "text",
        "obrigatorio": false,
        "modo": "fonte"
      },
      {
        "chave": "website",
        "pergunta": "Website",
        "tipo": "url",
        "obrigatorio": false,
        "modo": "fonte"
      },
      {
        "chave": "instagram",
        "pergunta": "Instagram",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "fonte"
      },
      {
        "chave": "tamanho_da_equipe",
        "pergunta": "Tamanho da equipe",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "lexia",
        "opcoes": [
          "Só eu",
          "2 a 3 pessoas",
          "4 a 10",
          "Mais de 10",
          "Outro"
        ]
      },
      {
        "chave": "outro_tamanho_da_equipe",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "tamanho_da_equipe",
          "valor": "Outro"
        }
      },
      {
        "chave": "tempo_do_negocio",
        "pergunta": "Há quanto tempo o negócio existe?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "fonte",
        "opcoes": [
          "Menos de 1 ano",
          "1 a 3 anos",
          "3 a 5 anos",
          "Mais de 5 anos"
        ]
      },
      {
        "chave": "fuso_horario",
        "pergunta": "Fuso horário",
        "tipo": "select",
        "obrigatorio": true,
        "modo": "fonte",
        "opcoes": [
          "America/New_York",
          "America/Chicago",
          "America/Denver",
          "America/Los_Angeles",
          "America/Phoenix",
          "America/Anchorage",
          "Pacific/Honolulu",
          "America/Sao_Paulo",
          "America/Manaus",
          "America/Recife",
          "America/Fortaleza",
          "America/Belem",
          "America/Bahia",
          "America/Cuiaba",
          "America/Porto_Velho",
          "America/Rio_Branco",
          "America/Noronha",
          "America/Toronto",
          "America/Vancouver",
          "Europe/Lisbon",
          "Europe/London",
          "UTC"
        ]
      }
    ],
    "grupos": []
  },
  {
    "chave": "objetivos_do_agente",
    "titulo": "Objetivos do agente",
    "campos": [
      {
        "chave": "objetivos",
        "pergunta": "O que o agente deve fazer?",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Responder dúvidas sobre serviços",
          "Informar preços",
          "Qualificar interessados antes de passar para a equipe",
          "Agendar atendimentos",
          "Fazer follow-up com quem sumiu",
          "Apoiar pós-atendimento",
          "Filtrar curiosos",
          "Outro"
        ],
        "recomendado": [
          "Responder dúvidas sobre serviços",
          "Informar preços",
          "Agendar atendimentos",
          "Fazer follow-up com quem sumiu"
        ]
      },
      {
        "chave": "outro_objetivo",
        "pergunta": "Outro objetivo",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "algum": [
            {
              "campo": "objetivos",
              "valor": "Outro"
            },
            {
              "campo": "objetivo_principal",
              "valor": "Outro"
            }
          ]
        }
      },
      {
        "chave": "objetivo_principal",
        "pergunta": "Dos itens acima, qual é o objetivo nº 1?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Responder dúvidas sobre serviços",
          "Informar preços",
          "Qualificar interessados antes de passar para a equipe",
          "Agendar atendimentos",
          "Fazer follow-up com quem sumiu",
          "Apoiar pós-atendimento",
          "Filtrar curiosos",
          "Outro"
        ],
        "ajuda": "Quando dois objetivos conflitarem, o agente prioriza este.",
        "recomendado": "Agendar atendimentos"
      },
      {
        "chave": "conduzir_ao_agendamento",
        "pergunta": "O agente deve conduzir a conversa até o agendamento sempre que houver interesse?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Sim",
          "Não"
        ],
        "recomendado": "Sim"
      },
      {
        "chave": "perfil_de_venda",
        "pergunta": "Perfil de venda do agente",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Consultivo — entende a necessidade antes de falar de preço",
          "Direto — responde preço e condições na hora",
          "Misto — direto em serviços simples, consultivo nos personalizados",
          "Outro"
        ],
        "recomendado": "Misto — direto em serviços simples, consultivo nos personalizados"
      },
      {
        "chave": "outro_perfil_de_venda",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "perfil_de_venda",
          "valor": "Outro"
        }
      },
      {
        "chave": "sempre_fazer",
        "pergunta": "Algo específico que o agente deve SEMPRE fazer na conversa?",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Ex.: perguntar a queixa principal antes de indicar; oferecer a avaliação quando houver dúvida. Liste no máximo 5 itens."
      },
      {
        "chave": "nunca_fazer",
        "pergunta": "Algo que o agente NUNCA deve fazer?",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Ex.: prometer resultado garantido, dar diagnóstico, insistir com quem disse não."
      }
    ],
    "grupos": []
  },
  {
    "chave": "horarios",
    "titulo": "Horários e atendimento fora de horas",
    "campos": [
      {
        "chave": "dias_de_funcionamento",
        "pergunta": "Dias de funcionamento",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "fonte",
        "opcoes": [
          "Seg",
          "Ter",
          "Qua",
          "Qui",
          "Sex",
          "Sáb",
          "Dom"
        ]
      },
      {
        "chave": "horario_por_dia",
        "pergunta": "Horário de abertura e de fechamento de cada dia",
        "tipo": "horarios",
        "obrigatorio": true,
        "modo": "fonte",
        "ajuda": "Um horário só para todos os dias, ou um por dia quando varia."
      },
      {
        "chave": "somente_horario_marcado",
        "pergunta": "Atende só com horário marcado?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "fonte",
        "opcoes": [
          "Sim",
          "Não"
        ]
      },
      {
        "chave": "atendimento_fora_do_horario",
        "pergunta": "O agente responde fora do horário de funcionamento?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Sim, atende normalmente e registra pedidos para a equipe confirmar depois",
          "Sim, mas avisa que a confirmação vem no próximo horário comercial",
          "Não responde fora de horas",
          "Outro"
        ],
        "ajuda": "Recomendamos a primeira opção: o cliente se sente atendido na hora.",
        "recomendado": "Sim, atende normalmente e registra pedidos para a equipe confirmar depois"
      },
      {
        "chave": "outro_atendimento_fora_do_horario",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "atendimento_fora_do_horario",
          "valor": "Outro"
        }
      },
      {
        "chave": "fechamentos_programados",
        "pergunta": "Fechamentos programados (férias, feriados)?",
        "tipo": "text",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Se não houver, deixe em branco. O agente nunca vai inventar recesso."
      }
    ],
    "grupos": []
  },
  {
    "chave": "tom_e_identidade",
    "titulo": "Tom de voz e identidade",
    "campos": [
      {
        "chave": "nome_do_agente",
        "pergunta": "Nome do agente",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "ajuda": "Ex.: 'Carol, assistente da [negócio]'."
      },
      {
        "chave": "resposta_sobre_ia",
        "pergunta": "Se perguntarem se é um robô/IA, o agente deve:",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Dizer que é o assistente digital do negócio, sem confirmar nem negar",
          "Confirmar que é uma IA",
          "Texto próprio"
        ]
      },
      {
        "chave": "texto_sobre_ia",
        "pergunta": "Texto próprio",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "resposta_sobre_ia",
          "valor": "Texto próprio"
        }
      },
      {
        "chave": "tom_das_mensagens",
        "pergunta": "Tom das mensagens",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Amigável e próximo",
          "Direto e objetivo",
          "Técnico e informativo",
          "Elegante e sofisticado",
          "Outro"
        ],
        "recomendado": [
          "Amigável e próximo"
        ]
      },
      {
        "chave": "outro_tom_das_mensagens",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "tom_das_mensagens",
          "valor": "Outro"
        }
      },
      {
        "chave": "forma_de_tratamento",
        "pergunta": "Forma de tratamento",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Você (informal)",
          "Senhor/Senhora (formal)",
          "Mista, conforme o cliente",
          "Outro"
        ],
        "recomendado": "Você (informal)"
      },
      {
        "chave": "outro_forma_de_tratamento",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "forma_de_tratamento",
          "valor": "Outro"
        }
      },
      {
        "chave": "emojis",
        "pergunta": "Emojis",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Nunca",
          "Raramente (1 por mensagem, no máximo)",
          "Com frequência",
          "Outro"
        ],
        "recomendado": "Raramente (1 por mensagem, no máximo)"
      },
      {
        "chave": "outro_emojis",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "emojis",
          "valor": "Outro"
        }
      },
      {
        "chave": "tamanho_das_mensagens",
        "pergunta": "Tamanho das mensagens",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Curtas (1–2 linhas)",
          "Moderadas (3–5 linhas)",
          "Longas quando necessário",
          "Outro"
        ],
        "recomendado": "Curtas (1–2 linhas)"
      },
      {
        "chave": "outro_tamanho_das_mensagens",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "tamanho_das_mensagens",
          "valor": "Outro"
        }
      },
      {
        "chave": "expressoes_do_negocio",
        "pergunta": "Expressões que têm a cara do negócio",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Liste de 5 a 12 expressões, separadas por vírgula. Ex.: 'Pode deixar!', 'Me conta um pouquinho…'"
      },
      {
        "chave": "expressoes_proibidas",
        "pergunta": "Expressões e comportamentos PROIBIDOS",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Liste palavras/frases que o agente nunca pode usar. Ex.: 'amore', 'imperdível', 'resultado garantido'."
      },
      {
        "chave": "idiomas",
        "pergunta": "Idiomas que o agente atende",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "lexia",
        "opcoes": [
          "Português",
          "Inglês",
          "Espanhol"
        ],
        "ajuda": "O agente detecta o idioma do cliente automaticamente e responde no mesmo idioma, entre os marcados aqui."
      },
      {
        "chave": "idioma_padrao",
        "pergunta": "Idioma padrão",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "lexia"
      },
      {
        "chave": "mensagem_de_boas_vindas",
        "pergunta": "Mensagem de boas-vindas",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "ajuda": "A primeira mensagem quando alguém chama no WhatsApp."
      }
    ],
    "grupos": []
  },
  {
    "chave": "servicos",
    "titulo": "Serviços",
    "campos": [
      {
        "chave": "avaliacao_paga",
        "pergunta": "A avaliação é paga ou gratuita?",
        "tipo": "radio",
        "opcoes": [
          "Gratuita",
          "Paga",
          "Não tem avaliação",
          "Depende do serviço"
        ],
        "obrigatorio": true,
        "modo": "cartao",
        "novo": true
      },
      {
        "chave": "avaliacao_por_servico",
        "pergunta": "Em quais serviços a avaliação é paga e em quais é gratuita?",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "novo": true,
        "quando": {
          "campo": "avaliacao_paga",
          "valor": "Depende do serviço"
        }
      },
      {
        "chave": "servicos_prioritarios",
        "pergunta": "Quais são os serviços que você mais quer vender?",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "ajuda": "O agente prioriza esses quando fizer sentido para o cliente.",
        "novo": true
      },
      {
        "chave": "se_acharem_caro",
        "pergunta": "Quando a cliente acha caro, o que você oferece no lugar? Se mudar de um serviço para outro, conte.",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "novo": true
      }
    ],
    "grupos": [
      {
        "chave": "servicos",
        "titulo": "Serviços",
        "obrigatorio": true,
        "campos": [
          {
            "chave": "nome",
            "pergunta": "Nome do serviço",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "fonte"
          },
          {
            "chave": "tipo_de_preco",
            "pergunta": "Tipo de preço",
            "tipo": "radio",
            "obrigatorio": true,
            "modo": "fonte",
            "opcoes": [
              "Preço fixo",
              "A partir de (preço mínimo)",
              "Sob orçamento — só após avaliação presencial",
              "Outro"
            ]
          },
          {
            "chave": "outro_tipo_de_preco",
            "pergunta": "Outro (especifique)",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa",
            "quando": {
              "campo": "tipo_de_preco",
              "valor": "Outro"
            }
          },
          {
            "chave": "valor",
            "pergunta": "Valor",
            "tipo": "number",
            "obrigatorio": true,
            "modo": "fonte",
            "ajuda": "Se for 'a partir de', informe o valor mínimo.",
            "quando": {
              "campo": "tipo_de_preco",
              "diferenteDe": "Sob orçamento — só após avaliação presencial"
            }
          },
          {
            "chave": "motivo_da_avaliacao",
            "pergunta": "Por que o preço depende de avaliação?",
            "tipo": "long",
            "obrigatorio": true,
            "modo": "conversa",
            "ajuda": "O agente usa essa explicação para o cliente não achar que estamos escondendo preço.",
            "quando": {
              "campo": "tipo_de_preco",
              "valor": "Sob orçamento — só após avaliação presencial"
            }
          },
          {
            "chave": "duracao_media",
            "pergunta": "Duração média",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "fonte"
          },
          {
            "chave": "descricao_e_indicacao",
            "pergunta": "Descrição completa do serviço",
            "tipo": "long",
            "obrigatorio": true,
            "modo": "conversa",
            "ajuda": "Explique tudo o que o agente precisa saber sobre este serviço."
          },
          {
            "chave": "preparo_e_cuidados",
            "pergunta": "Preparo antes e cuidados depois",
            "tipo": "long",
            "obrigatorio": false,
            "modo": "conversa",
            "atencao": true
          },
          {
            "chave": "contraindicacoes",
            "pergunta": "Contraindicações que o agente deve conhecer",
            "tipo": "long",
            "obrigatorio": false,
            "modo": "conversa",
            "atencao": true
          },
          {
            "chave": "numero_de_sessoes",
            "pergunta": "Nº típico de sessões",
            "tipo": "text",
            "obrigatorio": false,
            "modo": "conversa"
          },
          {
            "chave": "para_quem_indicar",
            "pergunta": "Para quem você indica este serviço?",
            "tipo": "long",
            "obrigatorio": true,
            "modo": "conversa",
            "novo": true
          },
          {
            "chave": "variacao_de_preco",
            "pergunta": "Como o preço varia (região, unidade, tamanho)?",
            "tipo": "long",
            "obrigatorio": false,
            "modo": "conversa",
            "novo": true,
            "quando": {
              "campo": "tipo_de_preco",
              "diferenteDe": "Preço fixo"
            }
          }
        ]
      }
    ]
  },
  {
    "chave": "precos_e_pagamento",
    "titulo": "Preços, orçamentos e pagamento",
    "campos": [
      {
        "chave": "resposta_ao_preco",
        "pergunta": "Quando o cliente pergunta \"quanto custa?\" logo de cara, o agente deve:",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Perguntar primeiro qual serviço/região e a necessidade, depois informar",
          "Informar a tabela diretamente",
          "Outro"
        ],
        "ajuda": "Recomendamos a primeira: entender antes de precificar converte mais.",
        "recomendado": "Perguntar primeiro qual serviço/região e a necessidade, depois informar"
      },
      {
        "chave": "outro_resposta_ao_preco",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "resposta_ao_preco",
          "valor": "Outro"
        }
      },
      {
        "chave": "pode_informar_preco_minimo",
        "pergunta": "O agente pode dizer valores \"a partir de X\" por mensagem?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Sim",
          "Não"
        ],
        "recomendado": "Sim"
      },
      {
        "chave": "formas_de_pagamento",
        "pergunta": "Formas de pagamento aceitas",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "fonte",
        "opcoes": [
          "Dinheiro",
          "Cartão de débito",
          "Cartão de crédito",
          "Zelle",
          "Venmo",
          "Cash App",
          "Apple Pay / Google Pay",
          "Cheque",
          "PIX",
          "Outro"
        ]
      },
      {
        "chave": "outro_pagamento",
        "pergunta": "Outro pagamento",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "formas_de_pagamento",
          "valor": "Outro"
        }
      },
      {
        "chave": "parcelamento",
        "pergunta": "Oferece parcelamento?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "conversa",
        "opcoes": [
          "Sim",
          "Não"
        ]
      },
      {
        "chave": "condicoes_de_parcelamento",
        "pergunta": "Em quais condições",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "parcelamento",
          "valor": "Sim"
        }
      },
      {
        "chave": "chaves_e_links_de_pagamento",
        "pergunta": "Chaves/links de pagamento (Zelle, Venmo etc.)",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa"
      },
      {
        "chave": "pedidos_de_desconto",
        "pergunta": "Pedidos de desconto: o que o agente responde?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "conversa",
        "opcoes": [
          "Não dá desconto; valoriza o serviço e oferece alternativas (pacote, outro serviço)",
          "Pode oferecer um desconto padrão de ___%",
          "Encaminha para a equipe decidir",
          "Outro"
        ]
      },
      {
        "chave": "outro_pedidos_de_desconto",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "pedidos_de_desconto",
          "valor": "Outro"
        }
      },
      {
        "chave": "desconto_percentual",
        "pergunta": "Desconto padrão (%)",
        "tipo": "number",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "pedidos_de_desconto",
          "valor": "Pode oferecer um desconto padrão de ___%"
        }
      },
      {
        "chave": "avaliacao_vira_credito",
        "pergunta": "O valor da avaliação é abatido do procedimento quando a cliente fecha?",
        "tipo": "radio",
        "obrigatorio": false,
        "modo": "conversa",
        "opcoes": [
          "Sim",
          "Não"
        ]
      },
      {
        "chave": "valor_da_avaliacao",
        "pergunta": "Quanto custa a avaliação?",
        "tipo": "number",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "avaliacao_vira_credito",
          "valor": "Sim"
        }
      }
    ],
    "grupos": []
  },
  {
    "chave": "agendamento",
    "titulo": "Agendamento",
    "campos": [
      {
        "chave": "sistema_de_agendamento",
        "pergunta": "Como os agendamentos funcionam hoje?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "lexia",
        "opcoes": [
          "Google Calendar",
          "Outro sistema (qual?)",
          "Agenda de papel / WhatsApp mesmo"
        ]
      },
      {
        "chave": "outro_sistema",
        "pergunta": "Qual sistema?",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "lexia",
        "quando": {
          "campo": "sistema_de_agendamento",
          "valor": "Outro sistema (qual?)"
        }
      },
      {
        "chave": "email_google_calendar",
        "pergunta": "E-mail da conta Google Calendar",
        "tipo": "email",
        "obrigatorio": true,
        "modo": "lexia",
        "quando": {
          "campo": "sistema_de_agendamento",
          "valor": "Google Calendar"
        }
      },
      {
        "chave": "quantidade_de_profissionais",
        "pergunta": "Quantos profissionais atendem?",
        "tipo": "number",
        "obrigatorio": true,
        "modo": "conversa"
      },
      {
        "chave": "agendas_separadas",
        "pergunta": "Cada um tem agenda separada?",
        "tipo": "radio",
        "obrigatorio": false,
        "modo": "conversa",
        "opcoes": [
          "Sim",
          "Não"
        ]
      },
      {
        "chave": "intervalo_entre_atendimentos",
        "pergunta": "Intervalo entre atendimentos (buffer)",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Nenhum",
          "10 min",
          "15 min",
          "30 min",
          "Outro"
        ]
      },
      {
        "chave": "outro_intervalo_entre_atendimentos",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "intervalo_entre_atendimentos",
          "valor": "Outro"
        }
      },
      {
        "chave": "antecedencia_minima",
        "pergunta": "Antecedência mínima para agendar",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Mesmo dia",
          "1 dia",
          "2 dias",
          "Outro"
        ]
      },
      {
        "chave": "outro_antecedencia_minima",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "antecedencia_minima",
          "valor": "Outro"
        }
      },
      {
        "chave": "antecedencia_maxima",
        "pergunta": "Antecedência máxima",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "30 dias",
          "60 dias",
          "90 dias",
          "Outro"
        ],
        "recomendado": "60 dias"
      },
      {
        "chave": "outro_antecedencia_maxima",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "antecedencia_maxima",
          "valor": "Outro"
        }
      },
      {
        "chave": "modo_de_agendamento",
        "pergunta": "O agente marca direto na agenda ou só registra o pedido para a equipe confirmar?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Marca direto quando houver horário livre",
          "Só registra; a equipe confirma",
          "Outro"
        ],
        "ajuda": "Marcar direto responde o cliente na hora, mas exige agenda sempre atualizada.",
        "recomendado": "Marca direto quando houver horário livre"
      },
      {
        "chave": "outro_modo_de_agendamento",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "modo_de_agendamento",
          "valor": "Outro"
        }
      },
      {
        "chave": "politica_de_cancelamento",
        "pergunta": "Política de cancelamento/remarcação",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "ajuda": "Ex.: remarcar até 24h antes sem custo."
      },
      {
        "chave": "sinal_antecipado",
        "pergunta": "Exige pagamento antecipado/sinal para confirmar?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "conversa",
        "opcoes": [
          "Sim — quanto e como",
          "Não"
        ]
      },
      {
        "chave": "sinal_detalhes",
        "pergunta": "Quanto e como",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "sinal_antecipado",
          "valor": "Sim — quanto e como"
        }
      },
      {
        "chave": "lembretes",
        "pergunta": "Lembretes automáticos de agendamento",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "48h antes",
          "24h antes",
          "2h antes",
          "Outro"
        ],
        "ajuda": "Recomendamos 24h + 2h.",
        "recomendado": [
          "24h antes",
          "2h antes"
        ]
      },
      {
        "chave": "outro_lembretes",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "lembretes",
          "valor": "Outro"
        }
      },
      {
        "chave": "mensagem_de_confirmacao",
        "pergunta": "Mensagem de confirmação de agendamento",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Se deixar em branco, usamos um modelo padrão."
      }
    ],
    "grupos": [
      {
        "chave": "profissionais",
        "titulo": "Nome e especialidade de cada profissional",
        "obrigatorio": false,
        "campos": [
          {
            "chave": "nome",
            "pergunta": "Nome",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          },
          {
            "chave": "especialidade",
            "pergunta": "O que essa pessoa faz e quais serviços atende",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          }
        ]
      }
    ]
  },
  {
    "chave": "follow_up",
    "titulo": "Follow-up (reengajar quem sumiu)",
    "campos": [
      {
        "chave": "ativar_follow_up",
        "pergunta": "Ativar follow-up automático?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Sim",
          "Não"
        ],
        "recomendado": "Sim"
      },
      {
        "chave": "tempo_primeira_tentativa",
        "pergunta": "Depois de quanto tempo sem resposta o agente faz a 1ª tentativa?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "4 horas",
          "8 horas",
          "24 horas",
          "Outro"
        ],
        "ajuda": "Recomendamos 8h: nem afobado, nem frio demais.",
        "recomendado": "8 horas"
      },
      {
        "chave": "outro_tempo_primeira_tentativa",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "tempo_primeira_tentativa",
          "valor": "Outro"
        }
      },
      {
        "chave": "respeitar_dia_combinado",
        "pergunta": "Se o cliente disser \"te respondo semana que vem\" ou marcar um dia, o agente deve esperar esse dia para contatar?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Sim, sempre respeitar o combinado",
          "Não, seguir o ciclo padrão"
        ],
        "ajuda": "Recomendamos 'Sim'.",
        "recomendado": "Sim, sempre respeitar o combinado"
      },
      {
        "chave": "tom_do_follow_up",
        "pergunta": "Tom do follow-up",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Leve e sem pressão (recomendado)",
          "Com senso de oportunidade (menciona vagas/condições reais)",
          "Outro"
        ],
        "recomendado": "Leve e sem pressão (recomendado)"
      },
      {
        "chave": "outro_tom_do_follow_up",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "tom_do_follow_up",
          "valor": "Outro"
        }
      },
      {
        "chave": "audios_follow_up",
        "pergunta": "Áudios seus para o follow-up",
        "tipo": "upload",
        "obrigatorio": false,
        "modo": "arquivo",
        "ajuda": "Um áudio curto (20–40s) seu, falando do serviço, aumenta MUITO a resposta. Grave 1 áudio por serviço principal (ex.: um para cada serviço mais vendido). Nada de 'promoção imperdível' — fale como quem conversa. Para cada áudio enviado, preencha abaixo a qual serviço/categoria esse áudio se refere."
      },
      {
        "chave": "clientes_sem_follow_up",
        "pergunta": "Clientes que NÃO devem receber follow-up",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Ex.: quem só perguntou endereço; quem disse claramente que não quer."
      }
    ],
    "grupos": []
  },
  {
    "chave": "handoff",
    "titulo": "Quando chamar um humano (handoff)",
    "campos": [
      {
        "chave": "whatsapp_de_handoff",
        "pergunta": "Número de WhatsApp que recebe as notificações de handoff",
        "tipo": "phone",
        "obrigatorio": true,
        "modo": "lexia",
        "ajuda": "Quando o agente precisar de você, ele manda um resumo da conversa para este número. Confirme que é um número que alguém olha com frequência."
      },
      {
        "chave": "situacoes_de_handoff",
        "pergunta": "Situações em que o agente deve SEMPRE passar para a equipe",
        "tipo": "multi",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Reclamação",
          "Problema após o atendimento",
          "Pedido de reagendamento ou cancelamento",
          "Negociação de valores fora do padrão",
          "Cliente pede para falar com humano",
          "Assunto médico/de saúde",
          "Outra"
        ]
      },
      {
        "chave": "outra_situacao",
        "pergunta": "Outra situação",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "situacoes_de_handoff",
          "valor": "Outra"
        }
      },
      {
        "chave": "mensagem_de_handoff",
        "pergunta": "Quando passa para a equipe, o que o agente diz ao cliente?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Modelo padrão: 'Já registrei sua solicitação, nossa equipe te retorna em breve.'",
          "Texto próprio"
        ],
        "recomendado": "Modelo padrão: 'Já registrei sua solicitação, nossa equipe te retorna em breve.'"
      },
      {
        "chave": "texto_de_handoff",
        "pergunta": "Texto próprio",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "mensagem_de_handoff",
          "valor": "Texto próprio"
        }
      },
      {
        "chave": "prazo_de_resposta",
        "pergunta": "Em quanto tempo a equipe costuma responder um handoff?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Até 1h",
          "Até 4h",
          "No mesmo dia",
          "Até o próximo dia útil",
          "Outro"
        ],
        "ajuda": "O agente usa isso para alinhar a expectativa do cliente sem prometer demais."
      },
      {
        "chave": "outro_prazo_de_resposta",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "prazo_de_resposta",
          "valor": "Outro"
        }
      },
      {
        "chave": "retomada_apos_humano",
        "pergunta": "Depois que alguém da equipe entra na conversa manualmente, o agente deve:",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Pausar e só voltar se o cliente mandar nova mensagem depois de um tempo (recomendado)",
          "Pausar até a equipe liberar",
          "Outro"
        ],
        "recomendado": "Pausar e só voltar se o cliente mandar nova mensagem depois de um tempo (recomendado)"
      },
      {
        "chave": "outro_retomada_apos_humano",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "retomada_apos_humano",
          "valor": "Outro"
        }
      }
    ],
    "grupos": []
  },
  {
    "chave": "faqs_e_objecoes",
    "titulo": "FAQs e objeções",
    "campos": [
      {
        "chave": "comparacao_concorrentes",
        "pergunta": "Como responder se compararem com concorrentes?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Nunca criticar; focar nos nossos diferenciais",
          "Texto próprio"
        ],
        "recomendado": "Nunca criticar; focar nos nossos diferenciais"
      },
      {
        "chave": "texto_concorrentes",
        "pergunta": "Texto próprio",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "comparacao_concorrentes",
          "valor": "Texto próprio"
        }
      },
      {
        "chave": "diferencial_1",
        "pergunta": "Diferencial 1",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa"
      },
      {
        "chave": "diferencial_2",
        "pergunta": "Diferencial 2",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa"
      },
      {
        "chave": "diferencial_3",
        "pergunta": "Diferencial 3",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa"
      }
    ],
    "grupos": [
      {
        "chave": "faqs",
        "titulo": "FAQs",
        "obrigatorio": true,
        "ajuda": "As 10 a 20 perguntas que você mais recebe, com a resposta na SUA voz. Qualidade > quantidade.",
        "campos": [
          {
            "chave": "pergunta",
            "pergunta": "Pergunta",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          },
          {
            "chave": "resposta",
            "pergunta": "Resposta",
            "tipo": "long",
            "obrigatorio": true,
            "modo": "conversa"
          }
        ]
      },
      {
        "chave": "objecoes",
        "titulo": "Objeções comuns",
        "obrigatorio": true,
        "ajuda": "O que os clientes falam para não fechar, e como você responde. Ex.: 'tá caro', 'tenho medo de doer', 'vou pensar'. Isso vira o manual de vendas do agente.",
        "campos": [
          {
            "chave": "objecao",
            "pergunta": "Objeção",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          },
          {
            "chave": "como_responder",
            "pergunta": "Como responder",
            "tipo": "long",
            "obrigatorio": true,
            "modo": "conversa"
          }
        ]
      }
    ]
  },
  {
    "chave": "promocoes_e_prioridades",
    "titulo": "Promoções e prioridades comerciais",
    "campos": [
      {
        "chave": "mencionar_promocoes",
        "pergunta": "O agente pode mencionar promoções espontaneamente ou só se o cliente perguntar?",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Espontaneamente, quando fizer sentido",
          "Só se o cliente perguntar",
          "Outro"
        ],
        "recomendado": "Espontaneamente, quando fizer sentido"
      },
      {
        "chave": "outro_mencionar_promocoes",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "mencionar_promocoes",
          "valor": "Outro"
        }
      },
      {
        "chave": "servico_porta_de_entrada",
        "pergunta": "Serviço \"porta de entrada\"",
        "tipo": "select",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "O serviço ideal para quem chega sem saber o que quer. Ex.: avaliação, consulta inicial."
      },
      {
        "chave": "cliente_ideal",
        "pergunta": "Perfil de cliente ideal",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Quem você quer atrair. O agente prioriza esse perfil."
      },
      {
        "chave": "perfis_a_filtrar",
        "pergunta": "Perfis a filtrar com educação",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "ajuda": "Ex.: quem só caça preço e pechincha; menores de idade sem responsável."
      },
      {
        "chave": "posicionamento",
        "pergunta": "Posicionamento",
        "tipo": "radio",
        "obrigatorio": true,
        "modo": "cartao",
        "opcoes": [
          "Premium — prefiro menos clientes pagando mais",
          "Volume — prefiro agenda cheia",
          "Equilíbrio",
          "Outro"
        ]
      },
      {
        "chave": "outro_posicionamento",
        "pergunta": "Outro (especifique)",
        "tipo": "text",
        "obrigatorio": true,
        "modo": "conversa",
        "quando": {
          "campo": "posicionamento",
          "valor": "Outro"
        }
      }
    ],
    "grupos": [
      {
        "chave": "promocoes",
        "titulo": "Promoções ativas",
        "obrigatorio": false,
        "ajuda": "O agente só menciona promoções cadastradas aqui, e só quando fizer sentido. Nunca inventa.",
        "campos": [
          {
            "chave": "nome",
            "pergunta": "Nome",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          },
          {
            "chave": "condicao",
            "pergunta": "Condição",
            "tipo": "text",
            "obrigatorio": true,
            "modo": "conversa"
          },
          {
            "chave": "tipo_de_validade",
            "pergunta": "Validade",
            "tipo": "radio",
            "obrigatorio": true,
            "modo": "conversa",
            "opcoes": [
              "Data",
              "Até acabar"
            ]
          },
          {
            "chave": "validade",
            "pergunta": "Data de validade",
            "tipo": "date",
            "obrigatorio": true,
            "modo": "conversa",
            "quando": {
              "campo": "tipo_de_validade",
              "valor": "Data"
            }
          }
        ]
      }
    ]
  },
  {
    "chave": "arquivos_e_revisao",
    "titulo": "Arquivos e revisão final",
    "campos": [
      {
        "chave": "logotipo",
        "pergunta": "Logotipo",
        "tipo": "upload",
        "obrigatorio": false,
        "modo": "fonte"
      },
      {
        "chave": "fotos",
        "pergunta": "Fotos do espaço e dos resultados",
        "tipo": "upload",
        "obrigatorio": false,
        "modo": "fonte"
      },
      {
        "chave": "tabela_de_precos",
        "pergunta": "Tabela de preços atual",
        "tipo": "upload",
        "obrigatorio": false,
        "modo": "lexia"
      },
      {
        "chave": "material_de_apoio",
        "pergunta": "Qualquer material de apoio (PDF)",
        "tipo": "upload",
        "obrigatorio": false,
        "modo": "lexia"
      },
      {
        "chave": "informacoes_adicionais",
        "pergunta": "Alguma coisa importante que não perguntamos?",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa"
      }
    ],
    "grupos": []
  },
  {
    "chave": "regras_da_casa",
    "titulo": "Regras da casa",
    "novo": true,
    "grupos": [],
    "campos": [
      {
        "chave": "agenda_cheia_e_pressa",
        "pergunta": "Agenda cheia e a cliente tem pressa: o que a assistente faz?",
        "tipo": "radio",
        "opcoes": [
          "Passa para a equipe tentar um encaixe",
          "Oferece só a primeira vaga livre",
          "Outro"
        ],
        "obrigatorio": true,
        "modo": "cartao",
        "recomendado": "Passa para a equipe tentar um encaixe",
        "novo": true
      },
      {
        "chave": "atraso_e_falta",
        "pergunta": "O que acontece quando a cliente atrasa ou falta?",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "novo": true
      },
      {
        "chave": "agente_cancela_e_remarca",
        "pergunta": "A assistente pode cancelar e remarcar sozinha?",
        "tipo": "radio",
        "opcoes": [
          "Sim, cancela e remarca",
          "Só remarca; cancelar passa para a equipe",
          "Não, passa tudo para a equipe"
        ],
        "obrigatorio": true,
        "modo": "cartao",
        "recomendado": "Sim, cancela e remarca",
        "novo": true
      },
      {
        "chave": "saude_e_gravidez",
        "pergunta": "Cliente fala de gravidez, remédios ou problema de saúde: o que a assistente faz?",
        "tipo": "radio",
        "opcoes": [
          "Passa para a equipe",
          "Responde com as contraindicações de cada serviço",
          "Outro"
        ],
        "obrigatorio": true,
        "modo": "cartao",
        "recomendado": "Passa para a equipe",
        "novo": true
      },
      {
        "chave": "urgencia_pos_procedimento",
        "pergunta": "Cliente com problema ou urgência depois de um procedimento: o que fazer?",
        "tipo": "long",
        "obrigatorio": true,
        "modo": "conversa",
        "novo": true
      },
      {
        "chave": "regra_que_estranham",
        "pergunta": "Tem alguma regra daqui que cliente novo sempre estranha?",
        "tipo": "long",
        "obrigatorio": false,
        "modo": "conversa",
        "novo": true
      }
    ]
  }
];
