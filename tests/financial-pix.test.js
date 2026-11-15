'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDatabase,
  verifyFullLedgerIntegrity,
  calculateTournamentPrizePool
} = require('../src/db/database');
const { seedDatabaseIfNeeded } = require('../src/db/seed');
const { hsm } = require('../src/security/hsmCrypto');
const { createAppServer } = require('../server');

async function startTestServer() {
  const db = createDatabase(':memory:');
  seedDatabaseIfNeeded(db);
  const { server } = createAppServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, db, baseUrl: `http://127.0.0.1:${port}` };
}

test('FINANCEIRO 1: 100% de Confiabilidade em Geração PIX EMVCo BRCode e Checksum CRC16-CCITT', () => {
  for (let i = 1; i <= 50; i++) {
    const amount = Number((i * 37.45).toFixed(2));
    const pix = hsm.generatePixBrCode({
      amount,
      txid: `TXPIXTEST${i}`,
      description: `PAGAMENTO TESTE ${i}`
    });
    assert.ok(pix.brCode.startsWith('00020101021226'));
    assert.ok(pix.brCode.includes('BR.GOV.BCB.PIX'));
    assert.equal(hsm.verifyPixCrc16(pix.brCode), true, `CRC16 falhou para valor ${amount}`);
    assert.ok(pix.endToEndId.startsWith('E00038166'));
  }
});

test('FINANCEIRO 2: Cálculo Automático de Premiação de Campeonatos (60% / 25% / 10% / 5%)', () => {
  const calc = calculateTournamentPrizePool({
    entryFee: 2000,
    maxTeams: 16,
    platformFeePct: 10
  });
  assert.equal(calc.grossPool, 32000);
  assert.equal(calc.platformFeeAmount, 3200);
  assert.equal(calc.netPrizePool, 28800);
  assert.equal(calc.distribution.champion1st.amount, 17280);
  assert.equal(calc.distribution.runnerUp2nd.amount, 7200);
  assert.equal(calc.distribution.thirdPlace3rd.amount, 2880);
  assert.equal(calc.distribution.topScorerMvp.amount, 1440);
  const sum =
    calc.distribution.champion1st.amount +
    calc.distribution.runnerUp2nd.amount +
    calc.distribution.thirdPlace3rd.amount +
    calc.distribution.topScorerMvp.amount;
  assert.equal(sum, calc.netPrizePool);
});

test('FINANCEIRO 3: Ciclo Completo de Depósito PIX, Aposta, Cashout, Compra de Previsão e Inscrição de Torneio', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    // 1. Depósito PIX Instantâneo de R$ 500,00
    const depRes = await fetch(`${baseUrl}/api/payments/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-campeonei-user-id': 'usr-pro-01'
      },
      body: JSON.stringify({ amount: 500, method: 'PIX' })
    });
    assert.equal(depRes.status, 201);
    const depData = await depRes.json();
    assert.equal(depData.walletBalance, 4750);
    assert.equal(hsm.verifyPixCrc16(depData.pix.brCode), true);

    // 2. Aposta Múltipla usando Saldo da Carteira (R$ 150,00)
    const betRes = await fetch(`${baseUrl}/api/bets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-campeonei-user-id': 'usr-pro-01'
      },
      body: JSON.stringify({
        selections: [
          { matchId: 'mch-pal-fla-live', market: '1X2', selection: 'SE Palmeiras', odds: 1.58 },
          { matchId: 'mch-bot-for-live', market: '1X2', selection: 'Botafogo FR', odds: 1.95 }
        ],
        stakeAmount: 150,
        paymentMethod: 'WALLET'
      })
    });
    assert.equal(betRes.status, 201);
    const betData = await betRes.json();
    assert.equal(betData.walletBalance, 4600);
    assert.equal(betData.bet.betType, 'MULTIPLE');

    // 3. Cashout Instantâneo da Aposta
    const cashoutRes = await fetch(`${baseUrl}/api/bets/${betData.bet.id}/cashout`, {
      method: 'POST',
      headers: { 'x-campeonei-user-id': 'usr-pro-01' }
    });
    assert.equal(cashoutRes.status, 200);
    const cashoutData = await cashoutRes.json();
    assert.ok(cashoutData.walletBalance > 4600);

    // 4. Compra de Previsão no Mercado com Split Automático (85% Tipster / 15% Plataforma)
    const buyRes = await fetch(`${baseUrl}/api/predictions/pred-02/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-campeonei-user-id': 'usr-admin-01'
      },
      body: JSON.stringify({ paymentMethod: 'PIX' })
    });
    assert.equal(buyRes.status, 201);
    const buyData = await buyRes.json();
    assert.equal(buyData.amountPaid, 19.9);
    assert.equal(buyData.platformFee, 2.98);
    assert.equal(buyData.tipsterShare, 16.92);
    assert.ok(buyData.analysisFullUnlocked.includes('ANÁLISE TÁTICA COMPLETA'));

    // 5. Auditoria Criptográfica de 100% dos Blocos do Ledger Imutável SHA-256
    const audit = verifyFullLedgerIntegrity(db);
    assert.equal(audit.valid, true);
    assert.ok(audit.totalBlocks >= 6);

    // 6. Simula tentativa de fraude interna no banco de dados (alterar 1 centavo em bloco passado)
    db.prepare('UPDATE immutable_ledger SET amount = amount + 0.01 WHERE seq = 1').run();
    const corruptedAudit = verifyFullLedgerIntegrity(db);
    assert.equal(corruptedAudit.valid, false);
    assert.equal(corruptedAudit.corruptedSeq, 1);
  } finally {
    server.close();
  }
});
