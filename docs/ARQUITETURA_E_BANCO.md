# Arquitetura do Sistema e Diagramas de Banco de Dados — Campeonei (`campeonei.com.br`)

## 1. Visão Geral da Arquitetura

A plataforma **Campeonei (`campeonei.com.br`)** foi projetada sob uma arquitetura orientada a eventos de baixa latência, segurança financeira de nível bancário e interface responsiva baseada no **Material Design 3 (M3)** — o sistema de design open source mais recente do Google.

```mermaid
flowchart TB
    subgraph Client["Camada de Apresentação (Material Design 3 Web App)"]
        UI["Interface Responsiva M3 (Desktop / Tablet / Mobile)"]
        BetSlip["Bilhete Rápido (<= 3 Cliques)"]
        SSEClient["Cliente Tempo Real (EventSource SSE)"]
    end

    subgraph Edge["Camada de Borda e Segurança Cibernética"]
        WAF["Next-Gen WAF & IDS/IPS (Anti-SQLi, XSS, Traversal, DDoS)"]
        Auth["Autenticação JWT + MFA (TOTP RFC 6238 / SMS / E-mail) + RBAC"]
        KYCGate["Gate Regulatório KYC (CPF Mód. 11 + Doc Oficial + Comprovante)"]
    end

    subgraph Core["Núcleo de Domínio Campeonei"]
        Mod1["Módulo 1: Federações, Times, Ligas e Campeonatos"]
        Mod2["Módulo 2: Apostas Ao Vivo & Motor de Odds"]
        Mod3["Módulo 3: Mercado de Previsões Esportivas (Tipsters)"]
        Notif["Motor de Notificações (In-App SSE, Push, E-mail)"]
        Admin["Painel Administrativo Hierárquico (Super Admin / Mod / Fin)"]
    end

    subgraph SecurityFinance["Integridade Financeira, HSM & Machine Learning"]
        MLEngine["Motor ML Anti-Fraude, Match-Fixing & PLD/FT (IForest v3.4)"]
        HSM["Módulo de Segurança Hardware (HSM FIPS 140-3 AES-256-GCM)"]
        PixEngine["Processador PIX EMVCo BRCode (CRC16-CCITT) & Cartões"]
        Ledger["Ledger Financeiro Imutável (Cadeia SHA-256 + Assinatura HSM)"]
    end

    subgraph External["Integrações Oficiais e Persistência"]
        DB[("Banco Relacional ACID (SQLite WAL / PostgreSQL Cluster)")]
        BCB["SPI Banco Central do Brasil (PIX EndToEndId)"]
        Feeds["Fontes de Dados Oficiais (CBF Opta / FIBA / Sportradar)"]
    end

    UI --> WAF
    BetSlip --> WAF
    SSEClient <--> Mod2
    SSEClient <--> Notif
    WAF --> Auth --> KYCGate --> Core
    Mod1 --> DB
    Mod1 <--> Feeds
    Mod2 --> MLEngine --> PixEngine
    Mod3 --> PixEngine
    PixEngine --> HSM
    PixEngine --> Ledger --> DB
    PixEngine <--> BCB
    Admin --> Ledger
    Admin --> HSM
```

---

## 2. Diagrama Entidade-Relacionamento do Banco de Dados (ER Diagram)

O modelo relacional garante integridade referencial estrita (`FOREIGN KEYS`), transações atômicas (`BEGIN IMMEDIATE ... COMMIT`) e trilha de auditoria imutável para 100% das operações financeiras.

```mermaid
erDiagram
    USERS ||--o{ BETS : realiza
    USERS ||--o{ FINANCIAL_TRANSACTIONS : executa
    USERS ||--o{ IMMUTABLE_LEDGER : registra
    USERS ||--o{ NOTIFICATIONS : recebe
    USERS ||--o{ PREDICTIONS : publica
    USERS ||--o{ PREDICTION_PURCHASES : adquire
    USERS ||--o| TIPSTER_STATS : possui

    FEDERATIONS ||--o{ TEAMS : homologa
    FEDERATIONS ||--o{ TOURNAMENTS : organiza
    TOURNAMENTS ||--o{ TOURNAMENT_INVITATIONS : dispara
    TOURNAMENTS ||--o{ MATCHES : contem
    MATCHES ||--o{ PREDICTIONS : referencia

    USERS {
        text id PK
        text name
        text email UK
        text password_hash
        text role "super_admin | moderator | financial_analyst | user"
        text cpf_masked
        text cpf_encrypted_hsm "Envelope AES-256-GCM"
        text phone_encrypted_hsm "Envelope AES-256-GCM"
        text pix_key_encrypted_hsm "Envelope AES-256-GCM"
        text kyc_status "VERIFIED | PENDING | REJECTED"
        text kyc_doc_type
        text kyc_doc_encrypted_hsm
        text kyc_residence_proof
        int mfa_enabled
        text mfa_totp_secret_encrypted
        real wallet_balance
        real daily_deposit_limit
        real monthly_deposit_limit
        text account_status "ACTIVE | SUSPENDED | SELF_EXCLUDED"
        int insider_restricted "Vedacao Lei 14790/2023"
    }

    FEDERATIONS {
        text id PK
        text acronym
        text name
        text sport
        text state
        text president_name
        text official_feed_provider
        int verified_badge
    }

    TEAMS {
        text id PK
        text federation_id FK
        text name
        text short_name
        text sport
        text stadium
        text coach_name
        text roster_json "Elenco completo com OVR, gols, posicoes"
        text stats_json "Estatisticas acumuladas"
        text history_json "Titulos e historico"
        int elo_rating
    }

    TOURNAMENTS {
        text id PK
        text federation_id FK
        text name
        text format "PONTOS_CORRIDOS | MATA_MATA | GRUPOS_MATA_MATA"
        int max_teams
        real entry_fee
        real prize_pool_gross
        real prize_pool_net
        text prize_distribution_json "Split automatico 60/25/10/5%"
        text scoring_rules_json
        text tiebreaker_rules_json
        text official_data_source
        text standings_json
    }

    MATCHES {
        text id PK
        text tournament_id FK
        text status "LIVE | UPCOMING | FINISHED"
        int minute
        text home_team_id
        text away_team_id
        int home_score
        int away_score
        text stats_json
        text odds_json "1X2, Handicap, Over/Under, BTTS"
        text official_feed_code
    }

    BETS {
        text id PK
        text user_id FK
        text bet_type "SINGLE | MULTIPLE"
        text selections_json
        real combined_odds
        real stake_amount
        real potential_return
        text payment_method "PIX | WALLET | CREDIT_CARD"
        text status "OPEN | WON | LOST | CASHED_OUT"
        real cashout_value
        int ml_risk_score
        text ml_risk_level
    }

    PREDICTIONS {
        text id PK
        text tipster_id FK
        text sport
        text match_id FK
        text market_type
        text selection_label
        real recommended_odds
        int confidence_pct
        real price
        text analysis_preview
        text analysis_full_encrypted_hsm "Desbloqueado apos compra"
        text result_status "PENDING | GREEN | RED | VOID"
        int sales_count
    }

    FINANCIAL_TRANSACTIONS {
        text id PK
        text user_id FK
        text type
        text method "PIX | CREDIT_CARD | TED | WALLET"
        real amount
        real fee
        real net_amount
        text pix_brcode "Padrao EMVCo CRC16-CCITT"
        text pix_end_to_end_id "Padrao SPI BCB"
        text encrypted_payload_hsm
        int reconciled
    }

    IMMUTABLE_LEDGER {
        int seq PK
        text tx_id UK
        text user_id FK
        text type
        real amount
        real balance_after
        text prev_hash "Encadeamento SHA-256"
        text block_hash "SHA-256 Canonico"
        text hsm_signature "Assinatura HMAC-SHA256 HSM"
    }
```

---

## 3. Arquitetura de Criptografia HSM (Envelope Encryption) e Ledger Imutável

1. **Hierarquia de Chaves (KEK $\rightarrow$ DEK)**:
   - A chave mestra (`Master KEK`) permanece isolada na partição criptográfica do módulo HSM ([`src/security/hsmCrypto.js`](file:///home/antigravity/fortunatolf-tech/campeonei/src/security/hsmCrypto.js)).
   - As chaves de criptografia de dados (`DEK` de 256 bits) são geradas aleatoriamente via CSPRNG, envelopadas pela `KEK` com **AES-256-GCM** e identificadas por `kid` (`hsm-dek-2026-v1`).
   - Cada dado sensível (CPF, chave PIX, documento RG/CNH, payload de pagamento e análise VIP de prognosticadores) é criptografado com um vetor de inicialização único de 96 bits (`iv`), tag de autenticação de 128 bits (`tag`) e vínculo de contexto (`AAD` — *Additional Authenticated Data*).
2. **Ledger Financeiro Imutável Encadeado por Hash (`immutable_ledger`)**:
   - Cada transação gera um bloco contendo `prev_hash` (hash SHA-256 do bloco anterior), dados canônicos da transação e assinatura `HMAC-SHA256` emitida pelo HSM.
   - A função [`verifyFullLedgerIntegrity`](file:///home/antigravity/fortunatolf-tech/campeonei/src/db/database.js) percorre 100% da cadeia verificando cada elo criptográfico e assinatura antes da reconciliação bancária.
