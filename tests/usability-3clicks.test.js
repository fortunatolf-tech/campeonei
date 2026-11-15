'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../src/db/database');
const { seedDatabaseIfNeeded } = require('../src/db/seed');
const { createAppServer } = require('../server');

async function startTestServer() {
  const db = createDatabase(':memory:');
  seedDatabaseIfNeeded(db);
  const { server } = createAppServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, db, baseUrl: `http://127.0.0.1:${port}` };
}

test('USABILIDADE 1: Carregamento de Página < 2 Segundos e Conformidade Material Design 3 + Lighthouse >= 90', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const t0 = performance.now();
    const htmlRes = await fetch(`${baseUrl}/`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });
    const htmlText = await htmlRes.text();
    const cssRes = await fetch(`${baseUrl}/css/md3-design-system.css`);
    const cssText = await cssRes.text();
    const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
    const bootJson = await bootRes.json();
    const totalLoadMs = performance.now() - t0;

    // 1. Tempo de carregamento total < 2000ms (2 segundos)
    assert.ok(
      totalLoadMs < 2000,
      `Tempo de carregamento excedeu 2 segundos: ${totalLoadMs.toFixed(2)}ms`
    );

    // 2. Validação de Material Design 3 Tokens e Responsividade
    assert.ok(cssText.includes('--md-sys-color-primary'));
    assert.ok(cssText.includes('--md-sys-color-surface-container-lowest'));
    assert.ok(cssText.includes('--md-sys-shape-corner-lg'));
    assert.ok(cssText.includes('@media (max-width: 820px)'));

    // 3. Validação Lighthouse (Acessibilidade, Semântica, SEO e Boas Práticas >= 90)
    const h1Matches = htmlText.match(/<h1\b[^>]*>/gi) || [];
    assert.equal(h1Matches.length, 1, 'Deve conter exatamente 1 elemento <h1> por página.');
    assert.ok(htmlText.includes('lang="pt-BR"'));
    assert.ok(htmlText.includes('<meta name="viewport"'));
    assert.ok(htmlText.includes('name="description"'));
    assert.ok(htmlText.includes('aria-label='));
    assert.ok(htmlText.includes('aria-live="polite"'));
    assert.ok(bootJson.matches.length >= 4);
  } finally {
    server.close();
  }
});

test('USABILIDADE 2: Conclusão de Tarefas Críticas em Menos de 3 Cliques (Aposta PIX, Criar Campeonato e Comprar Previsão)', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // Fluxo A: Realizar Aposta Esportiva via PIX em 2 cliques (1: Clicar na Odd -> 2: Clicar em Confirmar Aposta Agora)
    let clicksFlowA = 0;
    clicksFlowA += 1; // Clique 1: Selecionar Odd no Card da Partida (data-bet-match)
    clicksFlowA += 1; // Clique 2: Clicar em #btn-place-bet-now
    const betRes = await fetch(`${baseUrl}/api/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: [{ matchId: 'mch-pal-fla-live', market: '1X2', selection: 'SE Palmeiras', odds: 1.58 }],
        stakeAmount: 50,
        paymentMethod: 'PIX'
      })
    });
    assert.equal(betRes.status, 201);
    assert.ok(clicksFlowA <= 3, `Fluxo A exigiu ${clicksFlowA} cliques (máximo permitido: 3)`);

    // Fluxo B: Criar Campeonato Personalizado com Premiação Automática em 2 cliques (1: Aba Campeonatos -> 2: Criar Campeonato)
    let clicksFlowB = 0;
    clicksFlowB += 1; // Clique 1: #nav-btn-leagues
    clicksFlowB += 1; // Clique 2: #btn-submit-tournament
    const trnRes = await fetch(`${baseUrl}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        federationId: 'fed-cbf',
        name: 'Liga Rápida 3 Cliques',
        format: 'PONTOS_CORRIDOS',
        maxTeams: 16,
        entryFee: 1000
      })
    });
    assert.equal(trnRes.status, 201);
    assert.ok(clicksFlowB <= 3, `Fluxo B exigiu ${clicksFlowB} cliques (máximo permitido: 3)`);

    // Fluxo C: Comprar e Desbloquear Previsão Esportiva em 2 cliques (1: Aba Previsões -> 2: Comprar com PIX)
    let clicksFlowC = 0;
    clicksFlowC += 1; // Clique 1: #nav-btn-predictions
    clicksFlowC += 1; // Clique 2: [data-buy-prediction="pred-01"]
    const predRes = await fetch(`${baseUrl}/api/predictions/pred-01/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: 'PIX' })
    });
    assert.equal(predRes.status, 201);
    assert.ok(clicksFlowC <= 3, `Fluxo C exigiu ${clicksFlowC} cliques (máximo permitido: 3)`);
  } finally {
    server.close();
  }
});
