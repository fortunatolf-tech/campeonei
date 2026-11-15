# Guia de Uso Detalhado para Usuários e Administradores — Campeonei (`campeonei.com.br`)

## 1. Perfis de Acesso e Simulador Rápido na Top App Bar

No cabeçalho superior da plataforma (**Seletor "Perfil"**), você pode alternar instantaneamente entre os 6 perfis pré-configurados para validar cada fluxo de usuário e nível hierárquico de permissão:

1. **Lucas Fortunato (`super_admin`)**: Acesso irrestrito a todos os módulos, reconciliação bancária SPI/BCB, aplicação de medidas disciplinares e rotação de chaves criptográficas AES-256-GCM no HSM.
2. **Marina Costa (`moderator`)**: Gestão de federações, times, campeonatos, resolução de chamados de suporte e aplicação de medidas disciplinares.
3. **Roberto Almeida (`financial_analyst`)**: Auditoria do Ledger Imutável SHA-256, reconciliação bancária PIX/Cartão e análise de conformidade PLD/FT.
4. **Rafael Mendonça (`user` Verificado / Prognosticador)**: Apostador com KYC aprovado, organizador de ligas e prognosticador Diamond Pro no Mercado de Previsões.
5. **Carlos Eduardo (`user` KYC Pendente)**: Demonstra o bloqueio obrigatório de segurança financeira até o envio de CPF válido + Documento Oficial + Comprovante de Residência.
6. **Gabriel Silva (`user` Atleta Federado Impedido)**: Demonstra o bloqueio automático por conflito de interesse exigido pela Lei nº 14.790/2023.

---

## 2. Guia para Usuários: Conclusão de Tarefas em Menos de 3 Cliques

### 2.1. Como Realizar uma Aposta Esportiva via PIX (2 Cliques)
1. **Clique 1**: Na aba **Apostas**, clique sobre qualquer cotação (`@Odd`) de Resultado Final (1X2), Handicap Asiático, Número de Gols (Over/Under) ou Ambas Marcam para adicioná-la ao **Bilhete de Apostas** lateral.
2. **Clique 2**: Escolha o valor (ou clique em um botão rápido `R$ 20`, `R$ 50`, `R$ 100`) e clique em **"⚡ Confirmar Aposta Agora"**.
   - A aposta passa em tempo real pelo motor de Machine Learning Anti-Fraude, debita da carteira ou liquida via PIX Instantâneo e gera o registro no Ledger Imutável SHA-256.
   - Para encerrar antecipadamente uma aposta aberta, clique em **"💸 Cashout"** na tabela *Meus Bilhetes Registrados*.

### 2.2. Como Criar Federações, Times e Campeonatos com Premiação Automática (2 Cliques)
1. **Clique 1**: Acesse a aba **Campeonatos** no menu lateral (Navigation Rail).
2. **Clique 2**: No formulário *Criar Novo Campeonato Personalizado*, defina o formato (`Pontos Corridos`, `Mata-Mata` ou `Fase de Grupos + Playoffs`), o limite de times, os critérios de desempate e o valor de inscrição. O painel calcula em tempo real o fundo líquido e a divisão automática (60% Campeão, 25% Vice, 10% 3º Lugar, 5% Artilheiro). Clique em **"🏆 Criar Campeonato & Disparar Convites Automatizados"**.
   - Para simular um gol vindo da fonte de dados oficial (CBF Opta / FIBA), clique em **"📡 Simular Gol no Feed Oficial"** em qualquer partida ao vivo: o placar, as cotações e a tabela de classificação são recalculados instantaneamente.

### 2.3. Como Comprar ou Vender Previsões no Mercado de Previsões Esportivas (2 Cliques)
1. **Clique 1**: Acesse a aba **Previsões**. Consulte o **Ranking Auditado de Prognosticadores** filtrado por esporte (`Futebol`, `Basquete`, `Vôlei`), exibindo Taxa de Acerto (%), ROI (%), Consistência (%) e o histórico público imutável de `GREEN` e `RED`.
2. **Clique 2**: Para adquirir uma análise fechada, clique em **"🔓 Comprar & Desbloquear com PIX"**. O sistema realiza o split financeiro automático (85% para o prognosticador e 15% para a plataforma) e descriptografa imediatamente o relatório tático completo armazenado no HSM.
   - Para publicar sua própria previsão, preencha o formulário lateral *Publicar e Vender Previsão Esportiva* com o preço desejado.

### 2.4. Como Concluir o KYC, Validar MFA e Exportar Dados LGPD
1. Acesse a aba **PIX & KYC**.
2. Em **Verificação Obrigatória de Identidade (KYC)**, informe seu CPF (validado pelo algoritmo oficial Módulo 11), tipo e número do documento oficial (CNH Digital / RG CIN / Passaporte) e comprovante de residência, clicando em **"🪪 Validar Identidade & Criptografar no HSM"**.
3. Em **Autenticação Multifator (MFA)**, clique em **"Usar Código Atual"** para preencher o código TOTP RFC 6238 gerado em tempo real e clique em **"🔐 Validar Segundo Fator (MFA)"**.
4. Clique em **"📄 Exportar Relatório de Dados Pessoais (LGPD Art. 18)"** para visualizar seus dados descriptografados pelo titular em formato JSON auditável.

---

## 3. Guia para Administradores (Painel RBAC)

Acesse a aba **Admin** para operar conforme seu nível hierárquico:
- **Reconciliação Bancária Automática (`Super Admin` e `Analista Financeiro`)**: Clique em **"🏦 Reconciliar SPI/BCB & Auditar Ledger SHA-256"** para conciliar 100% das transações PIX e validar a integridade criptográfica de todos os blocos do ledger.
- **Rotação de Chaves HSM (`Super Admin`)**: Clique em **"🔑 Rotacionar Chave AES-256-GCM no HSM"** para gerar uma nova Data Encryption Key (`DEK`) envelopada pela Master Key (`KEK`) sem perder acesso aos registros históricos.
- **Resolução de Ocorrências e Medidas Disciplinares (`Super Admin` e `Moderador`)**: Resolva chamados na lista *Ocorrências de Suporte* com 1 clique ou aplique advertências, suspensões e bloqueios preventivos PLD/FT no formulário disciplinar.
