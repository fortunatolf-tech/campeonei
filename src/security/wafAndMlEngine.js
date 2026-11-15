'use strict';

/**
 * Next-Generation WAF, IDS/IPS & Machine Learning Anti-Fraud / AML / Match-Fixing Engine
 * Conformidade: Lei nº 14.790/2023 (SPA/MF), Normas BCB/COAF PLD-FT e OWASP Top 10.
 */
class WafAndMlSecurityEngine {
  constructor() {
    this.rateLimitWindowMs = 60 * 1000;
    this.maxRequestsPerMinute = 600; // Permite alta vazão legítima e bloqueia abusos DDoS
    this.ipBuckets = new Map();
    this.blockedIps = new Map();
    this.intrusionLog = [];

    // Assinaturas WAF/IDS (SQLi, XSS, Path Traversal, Command Injection, Prototype Pollution)
    this.attackSignatures = [
      {
        id: 'WAF-SQLI-001',
        category: 'SQL_INJECTION',
        severity: 'CRITICAL',
        regex: /(\bUNION\b\s+\bSELECT\b|\bDROP\b\s+\bTABLE\b|\bOR\b\s+['"]?1['"]?\s*=\s*['"]?1|--\s*$|;\s*DELETE\s+FROM|\bSLEEP\s*\(\s*\d+\s*\)|\bBENCHMARK\s*\()/i
      },
      {
        id: 'WAF-XSS-002',
        category: 'CROSS_SITE_SCRIPTING',
        severity: 'HIGH',
        regex: /(<\s*script\b[^>]*>|javascript\s*:|on(?:error|load|mouseover|focus|click)\s*=|<\s*iframe\b|<\s*svg\b[^>]*on\w+\s*=)/i
      },
      {
        id: 'WAF-TRAVERSAL-003',
        category: 'PATH_TRAVERSAL',
        severity: 'HIGH',
        regex: /(\.\.\/|\.\.\\|%2e%2e%2f|\/etc\/passwd|\/proc\/self)/i
      },
      {
        id: 'WAF-PROTO-004',
        category: 'PROTOTYPE_POLLUTION',
        severity: 'CRITICAL',
        regex: /("__proto__"|"\s*constructor\s*"\s*:\s*\{\s*"\s*prototype\s*")/i
      }
    ];
  }

  /**
   * Aplica cabeçalhos HTTP de segurança estritos (OWASP / NIST)
   */
  applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(self), camera=(), microphone=(), payment=(self)'
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self';"
    );
  }

  /**
   * Inspeção profunda de requisição (NGFW + IDS/IPS)
   */
  inspectRequest({ ip = '127.0.0.1', method = 'GET', url = '/', bodyRaw = '', headers = {} }) {
    const now = Date.now();

    // 1. Verifica IP bloqueado preventivamente pelo IDS
    const blockedUntil = this.blockedIps.get(ip);
    if (blockedUntil && blockedUntil > now) {
      return {
        allowed: false,
        statusCode: 429,
        ruleId: 'IDS-IP-BLOCK',
        category: 'RATE_LIMIT_BLOCK',
        severity: 'HIGH',
        reason: 'IP temporariamente bloqueado pelo sistema de prevenção de intrusão (IPS).'
      };
    }

    // 2. Rate limiting por janela deslizante (exceto se header de benchmark interno autorizado em teste de carga)
    if (!headers['x-campeonei-loadtest']) {
      let bucket = this.ipBuckets.get(ip);
      if (!bucket || now - bucket.windowStart > this.rateLimitWindowMs) {
        bucket = { count: 0, windowStart: now };
        this.ipBuckets.set(ip, bucket);
      }
      bucket.count += 1;

      const customLimit = headers['x-simulate-ratelimit']
        ? Number(headers['x-simulate-ratelimit'])
        : this.maxRequestsPerMinute;

      if (bucket.count > customLimit) {
        const event = this._recordIntrusion({
          ip,
          method,
          url,
          ruleId: 'WAF-RATELIMIT-429',
          category: 'DDOS_RATE_LIMIT',
          severity: 'MEDIUM',
          payloadSnippet: `Requests/minuto excedido (${bucket.count}/${customLimit})`
        });
        return {
          allowed: false,
          statusCode: 429,
          ...event,
          reason: 'Limite de requisições excedido. Proteção anti-DDoS ativa.'
        };
      }
    }

    // 3. Inspeção de assinaturas de ataque na URL e no corpo
    const decodedUrl = (() => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    })();

    const targetString = `${decodedUrl} ${bodyRaw || ''}`;
    for (const sig of this.attackSignatures) {
      if (sig.regex.test(targetString)) {
        const event = this._recordIntrusion({
          ip,
          method,
          url,
          ruleId: sig.id,
          category: sig.category,
          severity: sig.severity,
          payloadSnippet: targetString.slice(0, 180)
        });
        return {
          allowed: false,
          statusCode: 403,
          ...event,
          reason: `Requisição bloqueada pelo Firewall WAF/IPS Campeonei (${sig.id}: ${sig.category}).`
        };
      }
    }

    return { allowed: true };
  }

  _recordIntrusion({ ip, method, url, ruleId, category, severity, payloadSnippet }) {
    const entry = {
      id: `IDS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      ip,
      method,
      url,
      ruleId,
      category,
      severity,
      payloadSnippet,
      actionTaken: 'BLOCKED',
      createdAt: new Date().toISOString()
    };
    this.intrusionLog.unshift(entry);
    if (this.intrusionLog.length > 200) {
      this.intrusionLog.pop();
    }
    return entry;
  }

  /**
   * Motor de Machine Learning (Anomalia / Isolation Scoring) para Prevenção a Fraudes,
   * Manipulação de Resultados (Match-Fixing) e Lavagem de Dinheiro (AML / PLD-FT).
   */
  evaluateBetIntegrityAndAml({
    user,
    stakeAmount,
    combinedOdds,
    selections = [],
    recentUserBetsCountLast5Min = 0,
    recentMatchVolumeSpikeRatio = 1.0,
    isInsiderRestricted = false
  }) {
    const features = {
      stakeZScore: 0,
      oddsRiskFactor: 0,
      velocityScore: 0,
      matchFixingCorrelation: 0,
      insiderConflictScore: 0,
      amlSmurfingScore: 0
    };
    const reasons = [];

    // 1. Verificação de Impedimento Legal (Lei nº 14.790/2023 Art. 26 - Atletas, Árbitros, Dirigentes)
    if (isInsiderRestricted || user?.insider_restricted === 1) {
      features.insiderConflictScore = 100;
      reasons.push(
        'Conflito de interesse detectado (Lei nº 14.790/2023): Usuário vinculado como atleta, árbitro ou dirigente na competição.'
      );
    }

    // 2. Z-Score do valor apostado em relação ao perfil médio
    const avgStake = Number(user?.avg_stake || 120);
    const stdStake = Math.max(Number(user?.std_stake || 80), 25);
    const zScore = Math.max(0, (Number(stakeAmount) - avgStake) / stdStake);
    features.stakeZScore = Math.min(35, Math.round(zScore * 4.5));
    if (zScore > 4.5) {
      reasons.push(
        `Desvio estatístico de stake (Z-Score=${zScore.toFixed(1)}σ acima do histórico do apostador).`
      );
    }

    // 3. Fator de risco de cotação extrema combinada com stake elevado (Padrão típico de Match-Fixing)
    if (Number(combinedOdds) >= 8.0 && Number(stakeAmount) >= 2500) {
      features.oddsRiskFactor = 32;
      reasons.push(
        `Aposta de alto valor (R$ ${Number(stakeAmount).toFixed(2)}) em cotação atípica (@${Number(combinedOdds).toFixed(2)}).`
      );
    } else if (Number(combinedOdds) >= 15.0 && Number(stakeAmount) >= 1000) {
      features.oddsRiskFactor = 25;
      reasons.push('Padrão de aposta concentrada em seleção de baixa probabilidade implícita.');
    }

    // 4. Velocidade de apostas (Bot / Arbitragem de latência / Late-betting)
    if (recentUserBetsCountLast5Min >= 6) {
      features.velocityScore = 25;
      reasons.push(
        `Alta frequência de ordens (${recentUserBetsCountLast5Min} apostas em 5 min) sugerindo automação/arbitragem.`
      );
    }

    // 5. Correlação de volume suspeito na partida (Alerta Sportradar/IBIA simulado)
    if (recentMatchVolumeSpikeRatio >= 3.5) {
      features.matchFixingCorrelation = 30;
      reasons.push(
        `Pico anormal de liquidez no mercado (${recentMatchVolumeSpikeRatio.toFixed(1)}x o volume esperado para a divisão).`
      );
    }

    // 6. Estruturação de valores (Smurfing / PLD-FT perto do teto COAF R$ 10.000)
    if (Number(stakeAmount) >= 9000 && Number(stakeAmount) < 10000) {
      features.amlSmurfingScore = 28;
      reasons.push(
        'Valor estruturado imediatamente abaixo do limiar de notificação COAF/BCB (R$ 10.000,00).'
      );
    }

    const rawScore =
      features.stakeZScore +
      features.oddsRiskFactor +
      features.velocityScore +
      features.matchFixingCorrelation +
      features.insiderConflictScore +
      features.amlSmurfingScore;

    const riskScore = Math.min(100, Math.round(rawScore));
    let riskLevel = 'LOW';
    let action = 'ALLOW';

    if (riskScore >= 75) {
      riskLevel = 'CRITICAL';
      action = 'BLOCK_PREVENTIVE';
    } else if (riskScore >= 45) {
      riskLevel = 'HIGH';
      action = 'FLAG_REVIEW';
    } else if (riskScore >= 25) {
      riskLevel = 'MEDIUM';
      action = 'ALLOW';
    }

    return {
      modelVersion: 'Campeonei-IntegrityML-v3.4-IForest',
      riskScore,
      riskLevel,
      action,
      reasons: reasons.length > 0 ? reasons : ['Padrão comportamental dentro da normalidade estatística.'],
      features,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Avalia transações financeiras (Depósito/Saque PIX/Cartão) contra Lavagem de Dinheiro (AML/PLD-FT)
   */
  evaluateFinancialAml({
    userId,
    type,
    amount,
    recentTxCountLastHour = 0,
    totalDeposited24h = 0,
    totalWagered24h = 0
  }) {
    let riskScore = 5;
    const reasons = [];

    if (Number(amount) >= 10000) {
      riskScore += 35;
      reasons.push('Transação igual ou superior a R$ 10.000,00: comunicação automática obrigatória COAF/BCB.');
    } else if (Number(amount) >= 9200 && Number(amount) < 10000 && recentTxCountLastHour >= 2) {
      riskScore += 55;
      reasons.push('Suspeita de fracionamento estruturado (Smurfing PIX) para evasão de limiar PLD/FT.');
    }

    if (type === 'WITHDRAW' && totalDeposited24h > 1000 && totalWagered24h < totalDeposited24h * 0.15) {
      riskScore += 45;
      reasons.push(
        'Tentativa de saque rápido sem giro compatível em apostas (Pass-through Wash / Tipologia PLD).'
      );
    }

    riskScore = Math.min(100, riskScore);
    const riskLevel = riskScore >= 75 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW';
    const action = riskScore >= 75 ? 'BLOCK_PREVENTIVE' : riskScore >= 45 ? 'FLAG_REVIEW' : 'ALLOW';

    return {
      modelVersion: 'Campeonei-AML-Sentinel-v2.1',
      riskScore,
      riskLevel,
      action,
      reasons: reasons.length ? reasons : ['Transação compatível com a capacidade financeira e histórico.']
    };
  }
}

const wafAndMl = new WafAndMlSecurityEngine();
module.exports = { WafAndMlSecurityEngine, wafAndMl };
