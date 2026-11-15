# Guia de Implantação e Lançamento em Produção (`campeonei.com.br`)

## 1. Requisitos de Infraestrutura para Produção

- **Runtime**: Node.js `>= 22.0.0` (homologado em Node.js `v24.22.2 LTS` com `node:sqlite`, `node:crypto` e `node:http` nativos).
- **Domínio Oficial**: `campeonei.com.br` (registro Registro.br com DNSSEC habilitado).
- **Certificados e Criptografia em Trânsito**: TLS 1.3 estrito + HSTS (`max-age=63072000; includeSubDomains; preload`) + mTLS ICP-Brasil para comunicação com o PSP/SPI do Banco Central (API PIX).
- **Módulo HSM de Produção**: AWS CloudHSM / Google Cloud KMS HSM FIPS 140-3 Nível 3 conectado via PKCS#11 ou variáveis de semente do cofre seguro.

---

## 2. Variáveis de Ambiente de Produção

Configure as seguintes variáveis no cofre de segredos (Kubernetes Secrets / HashiCorp Vault) antes de iniciar o serviço:

```bash
export NODE_ENV="production"
export PORT="3000"
export CAMPEONEI_DB_PATH="/var/lib/campeonei/campeonei.sqlite"
export CAMPEONEI_HSM_MASTER_SEED="<CHAVE_KEK_256_BITS_DO_HSM>"
export CAMPEONEI_HSM_SIGN_SEED="<CHAVE_ASSINATURA_LEDGER_HSM>"
export CAMPEONEI_JWT_SEED="<SEGREDO_SESSAO_HMAC_SHA256>"
```

---

## 3. Comandos de Inicialização e Verificação

### 3.1. Executar a Suíte Completa de Auditoria Pré-Lançamento (Pentest, PIX, Usabilidade e Carga 10k+)

```bash
npm test
```

### 3.2. Iniciar o Servidor da Plataforma

```bash
npm start
```

O serviço escutará em `0.0.0.0:3000` com compressão Gzip nativa, cabeçalhos de segurança CSP/HSTS, WAF/IDS ativo e streaming Server-Sent Events (`/api/stream/live`).

---

## 4. Configuração de Proxy Reverso e DNS (`campeonei.com.br`)

### 4.1. Registros DNS (Registro.br / Cloudflare Enterprise)

| Tipo | Nome | Valor / Destino | Proxy / Segurança |
| :--- | :--- | :--- | :--- |
| `A` | `campeonei.com.br` | IP do Load Balancer Principal | Cloudflare WAF + Anti-DDoS L7 |
| `CNAME` | `www.campeonei.com.br` | `campeonei.com.br` | TLS 1.3 Strict |
| `CAA` | `campeonei.com.br` | `0 issue "letsencrypt.org"` | Proteção de emissão de certificado |
| `TXT` | `_dmarc.campeonei.com.br` | `v=DMARC1; p=reject; rua=mailto:seguranca@campeonei.com.br` | Autenticação de e-mails de convite e MFA |

### 4.2. Exemplo de Configuração NGINX com Suporte a SSE de Baixa Latência

```nginx
server {
    listen 443 ssl http2;
    server_name campeonei.com.br www.campeonei.com.br;

    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;

    location /api/stream/live {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Checklist de Conformidade Regulatória Brasileira

1. **Lei nº 14.790/2023 e Portarias SPA/MF (Ministério da Fazenda)**:
   - Verificação obrigatória de identidade (KYC) e CPF válido antes de qualquer depósito ou aposta.
   - Bloqueio automático de pessoas impedidas (`insider_restricted = 1`: atletas, árbitros, dirigentes).
   - Ferramentas de Jogo Responsável ativas (limite diário/mensal de depósito e autoexclusão).
2. **Normas do Banco Central do Brasil (BCB / Arranjo PIX e PLD/FT)**:
   - Geração de BRCode padrão EMVCo com validação matemática CRC16-CCITT e rastreamento por `EndToEndId`.
   - Monitoramento automático de transações estruturadas (*smurfing*) e comunicação COAF para operações $\ge \text{R\$ } 10.000,00$.
3. **LGPD (Lei nº 13.709/2018)**:
   - Dados pessoais criptografados em repouso com AES-256-GCM no HSM.
   - Endpoint de portabilidade e acesso imediato pelo titular (`GET /api/security/lgpd/export`).
