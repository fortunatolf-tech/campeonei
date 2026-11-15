# Campeonei (`campeonei.com.br`) — Plataforma Completa de Ligas, Campeonatos, Apostas PIX e Mercado de Previsões

Plataforma web completa, segura e pronta para lançamento no domínio oficial **campeonei.com.br**, desenvolvida com o **Material Design 3 (M3)** — sistema de design open source mais recente do Google.

## Módulos Integrados

1. **Sistema de Criação e Gerenciamento de Federações, Times, Ligas e Campeonatos**:
   - Cadastro de federações esportivas e registro completo de times com elenco, estatísticas e histórico.
   - Criação de competições personalizadas em formatos variados (**Pontos Corridos**, **Mata-Mata**, **Fase de Grupos + Playoffs**).
   - Configuração de critérios de desempate, regras de pontuação, limites de inscrição e **cálculo automático de premiação** (60% 1º lugar, 25% 2º lugar, 10% 3º lugar e 5% Artilheiro).
   - Convite automatizado por e-mail e notificação na plataforma, além de sincronização de resultados e classificações em tempo real com fontes de dados oficiais.
2. **Módulo de Apostas Esportivas e Transações Financeiras Seguras (PIX, Cartão e Carteira)**:
   - Processamento de pagamentos via **PIX** (padrão oficial EMVCo BRCode do Banco Central com checksum `CRC16-CCITT` e `EndToEndId` SPI), cartão de crédito tokenizado e saldo em carteira com confirmação instantânea.
   - Cotações atualizadas em tempo real via Server-Sent Events (`/api/stream/live`) para **Resultado Final (1X2)**, **Handicap Asiático**, **Número de Gols (Over/Under)**, **Ambas Marcam (BTTS)** e **Apostas Ao Vivo**, além de **Cashout Instantâneo**.
   - Motor de **Machine Learning Anti-Fraude, Prevenção à Manipulação de Resultados e PLD/FT** (`Campeonei-IntegrityML-v3.4-IForest`).
3. **Mercado Transparente de Previsões Esportivas (Tipster Marketplace)**:
   - Compra, venda e compartilhamento de previsões esportivas com preços definidos pelos próprios prognosticadores e split financeiro automático (85% prognosticador / 15% plataforma).
   - Ranking atualizado por esporte baseado em **Taxa de Acerto (%)**, **Retorno sobre Investimento — ROI (%)** e **Consistência (%)**, com histórico público imutável de acertos (`GREEN`) e erros (`RED`).
4. **Segurança Cibernética, HSM, KYC, MFA, LGPD e Painel Administrativo RBAC**:
   - Criptografia ponta a ponta com **AES-256-GCM** e gerenciamento de chaves em **Módulo de Segurança Hardware (HSM)** simulado com suporte a rotação de chaves (`DEK`).
   - Autenticação Multifator (**TOTP RFC 6238**, SMS, E-mail) e verificação obrigatória de identidade (**KYC**: CPF Módulo 11, Documento Oficial e Comprovante de Residência).
   - **Ledger Financeiro Imutável encadeado por Hash SHA-256** e reconciliação automática com instituições financeiras.
   - Painel administrativo com permissões hierárquicas (**Super Administrador**, **Moderador** e **Analista Financeiro**).

---

## Como Executar e Testar

```bash
# Executar todas as baterias de testes (Pentest, PIX 100%, Usabilidade <=3 cliques e Carga 10.500+ usuários)
npm test

# Iniciar o servidor web em http://localhost:3000
npm start
```

---

## Documentação Técnica Completa

- [Arquitetura do Sistema e Diagramas de Banco de Dados](docs/ARQUITETURA_E_BANCO.md)
- [Guia de Implantação e Lançamento (`campeonei.com.br`)](docs/GUIA_IMPLANTACAO_CAMPEONEI.md)
- [Guia de Uso para Usuários e Administradores](docs/GUIA_USUARIO_E_ADMIN.md)
- [Relatório de Testes de Penetração, Carga (10k+), Usabilidade e Auditoria PIX](docs/RELATORIO_TESTES_AUDITORIA.md)
