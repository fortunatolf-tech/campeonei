'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hsm } = require('../security/hsmCrypto');
const { SqliteCompatDatabase } = require('./sqliteCompat');

let NativeDatabaseSync = null;
try {
  NativeDatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  NativeDatabaseSync = null;
}

let dbInstance = null;

function createDatabase(dbPath = null) {
  const resolvedPath =
    dbPath ||
    process.env.CAMPEONEI_DB_PATH ||
    path.join(__dirname, '..', '..', 'data', 'campeonei.sqlite');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db;
  if (NativeDatabaseSync && process.env.CAMPEONEI_FORCE_COMPAT_DB !== '1') {
    db = new NativeDatabaseSync(resolvedPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
  } else {
    db = new SqliteCompatDatabase(resolvedPath);
  }

  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      cpf_masked TEXT NOT NULL,
      cpf_encrypted_hsm TEXT NOT NULL,
      phone_encrypted_hsm TEXT,
      pix_key_encrypted_hsm TEXT,
      kyc_status TEXT NOT NULL DEFAULT 'PENDING',
      kyc_doc_type TEXT DEFAULT 'CNH_DIGITAL',
      kyc_doc_encrypted_hsm TEXT,
      kyc_residence_proof TEXT,
      kyc_verified_at TEXT,
      mfa_enabled INTEGER NOT NULL DEFAULT 1,
      mfa_methods_json TEXT NOT NULL DEFAULT '["TOTP","EMAIL","SMS"]',
      mfa_totp_secret_encrypted TEXT NOT NULL,
      wallet_balance REAL NOT NULL DEFAULT 0,
      daily_deposit_limit REAL NOT NULL DEFAULT 5000,
      monthly_deposit_limit REAL NOT NULL DEFAULT 25000,
      account_status TEXT NOT NULL DEFAULT 'ACTIVE',
      insider_restricted INTEGER NOT NULL DEFAULT 0,
      avg_stake REAL NOT NULL DEFAULT 100,
      std_stake REAL NOT NULL DEFAULT 60,
      notif_prefs_json TEXT NOT NULL,
      lgpd_consent_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS federations (
      id TEXT PRIMARY KEY,
      acronym TEXT NOT NULL,
      name TEXT NOT NULL,
      sport TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Brasil',
      state TEXT NOT NULL,
      president_name TEXT NOT NULL,
      official_website TEXT,
      official_feed_provider TEXT NOT NULL,
      verified_badge INTEGER NOT NULL DEFAULT 1,
      logo_color TEXT NOT NULL DEFAULT '#006C4C',
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      federation_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      sport TEXT NOT NULL DEFAULT 'Futebol',
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      founded_year INTEGER NOT NULL,
      stadium TEXT NOT NULL,
      coach_name TEXT NOT NULL,
      primary_color TEXT NOT NULL,
      secondary_color TEXT NOT NULL,
      roster_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      history_json TEXT NOT NULL,
      elo_rating INTEGER NOT NULL DEFAULT 1600,
      created_at TEXT NOT NULL,
      FOREIGN KEY (federation_id) REFERENCES federations(id)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      federation_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sport TEXT NOT NULL DEFAULT 'Futebol',
      season TEXT NOT NULL DEFAULT '2026',
      format TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      max_teams INTEGER NOT NULL DEFAULT 16,
      registered_teams_count INTEGER NOT NULL DEFAULT 0,
      entry_fee REAL NOT NULL DEFAULT 0,
      platform_fee_pct REAL NOT NULL DEFAULT 10,
      prize_pool_gross REAL NOT NULL DEFAULT 0,
      prize_pool_net REAL NOT NULL DEFAULT 0,
      prize_distribution_json TEXT NOT NULL,
      scoring_rules_json TEXT NOT NULL,
      tiebreaker_rules_json TEXT NOT NULL,
      official_data_source TEXT NOT NULL,
      standings_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (federation_id) REFERENCES federations(id)
    );

    CREATE TABLE IF NOT EXISTS tournament_invitations (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      team_id TEXT,
      team_name TEXT NOT NULL,
      invited_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SENT',
      entry_tx_id TEXT,
      invited_at TEXT NOT NULL,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      tournament_name TEXT NOT NULL,
      sport TEXT NOT NULL DEFAULT 'Futebol',
      round_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'LIVE',
      minute INTEGER NOT NULL DEFAULT 0,
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      home_team_name TEXT NOT NULL,
      away_team_name TEXT NOT NULL,
      home_short TEXT NOT NULL,
      away_short TEXT NOT NULL,
      home_score INTEGER NOT NULL DEFAULT 0,
      away_score INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT NOT NULL,
      odds_json TEXT NOT NULL,
      official_feed_code TEXT NOT NULL,
      start_time TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    );

    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bet_type TEXT NOT NULL,
      selections_json TEXT NOT NULL,
      combined_odds REAL NOT NULL,
      stake_amount REAL NOT NULL,
      potential_return REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      cashout_value REAL NOT NULL DEFAULT 0,
      ml_risk_score INTEGER NOT NULL DEFAULT 0,
      ml_risk_level TEXT NOT NULL DEFAULT 'LOW',
      ml_reasons_json TEXT NOT NULL,
      tx_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      tipster_id TEXT NOT NULL,
      tipster_name TEXT NOT NULL,
      tipster_badge TEXT NOT NULL,
      sport TEXT NOT NULL,
      match_id TEXT NOT NULL,
      match_label TEXT NOT NULL,
      market_type TEXT NOT NULL,
      selection_label TEXT NOT NULL,
      recommended_odds REAL NOT NULL,
      confidence_pct INTEGER NOT NULL,
      stake_units REAL NOT NULL DEFAULT 2.0,
      price REAL NOT NULL DEFAULT 0,
      analysis_preview TEXT NOT NULL,
      analysis_full_encrypted_hsm TEXT NOT NULL,
      result_status TEXT NOT NULL DEFAULT 'PENDING',
      sales_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prediction_purchases (
      id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      tipster_share REAL NOT NULL,
      platform_fee REAL NOT NULL,
      tx_id TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      UNIQUE(prediction_id, buyer_id)
    );

    CREATE TABLE IF NOT EXISTS tipster_stats (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      specialty_sport TEXT NOT NULL,
      avatar_initials TEXT NOT NULL,
      verified_pro INTEGER NOT NULL DEFAULT 1,
      total_predictions INTEGER NOT NULL DEFAULT 0,
      greens INTEGER NOT NULL DEFAULT 0,
      reds INTEGER NOT NULL DEFAULT 0,
      voids INTEGER NOT NULL DEFAULT 0,
      win_rate_pct REAL NOT NULL DEFAULT 0,
      roi_pct REAL NOT NULL DEFAULT 0,
      consistency_score REAL NOT NULL DEFAULT 0,
      profit_units REAL NOT NULL DEFAULT 0,
      recent_streak_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      pix_brcode TEXT,
      pix_end_to_end_id TEXT,
      encrypted_payload_hsm TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      reconciled INTEGER NOT NULL DEFAULT 1,
      reconciled_at TEXT,
      reference_id TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS immutable_ledger (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_id TEXT,
      prev_hash TEXT NOT NULL,
      block_hash TEXT NOT NULL,
      hsm_signature TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      channels_json TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      assigned_role TEXT NOT NULL DEFAULT 'moderator',
      resolution_note TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disciplinary_actions (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      applied_by TEXT NOT NULL,
      applied_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Registra uma transação financeira de forma atômica e encadeada no Ledger Imutável SHA-256 + HSM
 */
function recordFinancialTransaction(db, {
  txId,
  userId,
  type,
  method = 'PIX',
  amount,
  fee = 0,
  balanceAfter,
  referenceId = null,
  description,
  institutionName = 'Banco Central do Brasil (SPI / PIX)',
  pixMeta = null,
  status = 'CONFIRMED'
}) {
  const now = new Date().toISOString();
  const netAmount = Number((Number(amount) - Number(fee)).toFixed(2));

  const lastBlock = db
    .prepare('SELECT block_hash FROM immutable_ledger ORDER BY seq DESC LIMIT 1')
    .get();
  const prevHash = lastBlock ? lastBlock.block_hash : '0'.repeat(64);

  const { blockHash, hsmSignature } = hsm.computeLedgerBlock({
    prevHash,
    txId,
    userId,
    type,
    amount: Number(amount),
    balanceAfter: Number(balanceAfter),
    referenceId,
    createdAt: now
  });

  const sensitivePaymentPayload = hsm.encryptSensitiveData(
    {
      txId,
      userId,
      method,
      amount: Number(amount),
      netAmount,
      institutionName,
      pixEndToEndId: pixMeta?.endToEndId || null,
      timestamp: now
    },
    'campeonei-financial-tx'
  );

  db.prepare(`
    INSERT INTO financial_transactions (
      id, user_id, type, method, amount, fee, net_amount, status,
      pix_brcode, pix_end_to_end_id, encrypted_payload_hsm, institution_name,
      reconciled, reconciled_at, reference_id, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    txId,
    userId,
    type,
    method,
    Number(amount),
    Number(fee),
    netAmount,
    status,
    pixMeta?.brCode || null,
    pixMeta?.endToEndId || null,
    sensitivePaymentPayload,
    institutionName,
    1,
    now,
    referenceId,
    description,
    now
  );

  db.prepare(`
    INSERT INTO immutable_ledger (
      tx_id, user_id, type, amount, balance_after, reference_id,
      prev_hash, block_hash, hsm_signature, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    txId,
    userId,
    type,
    Number(amount),
    Number(balanceAfter),
    referenceId,
    prevHash,
    blockHash,
    hsmSignature,
    now
  );

  return {
    txId,
    blockHash,
    prevHash,
    hsmSignature,
    createdAt: now
  };
}

/**
 * Audita 100% dos blocos do Ledger Imutável verificando o encadeamento SHA-256 e a assinatura HSM
 */
function verifyFullLedgerIntegrity(db) {
  const rows = db.prepare('SELECT * FROM immutable_ledger ORDER BY seq ASC').all();
  let expectedPrevHash = '0'.repeat(64);
  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalBlocks: rows.length,
        corruptedSeq: row.seq,
        reason: `Quebra de cadeia criptográfica prev_hash no bloco #${row.seq} (tx ${row.tx_id}).`
      };
    }
    const recomputed = hsm.computeLedgerBlock({
      prevHash: row.prev_hash,
      txId: row.tx_id,
      userId: row.user_id,
      type: row.type,
      amount: row.amount,
      balanceAfter: row.balance_after,
      referenceId: row.reference_id,
      createdAt: row.created_at
    });
    if (recomputed.blockHash !== row.block_hash) {
      return {
        valid: false,
        totalBlocks: rows.length,
        corruptedSeq: row.seq,
        reason: `Adulteração detectada nos dados financeiros do bloco #${row.seq} (hash divergente).`
      };
    }
    if (!hsm.verifyLedgerSignature(row.block_hash, row.hsm_signature)) {
      return {
        valid: false,
        totalBlocks: rows.length,
        corruptedSeq: row.seq,
        reason: `Assinatura HSM inválida no bloco #${row.seq}.`
      };
    }
    expectedPrevHash = row.block_hash;
  }
  return {
    valid: true,
    totalBlocks: rows.length,
    headHash: expectedPrevHash,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Calcula automaticamente a premiação do campeonato a partir da taxa de inscrição e vagas
 */
function calculateTournamentPrizePool({ entryFee, maxTeams, platformFeePct = 10 }) {
  const gross = Number((Number(entryFee || 0) * Number(maxTeams || 0)).toFixed(2));
  const platformFee = Number(((gross * Number(platformFeePct)) / 100).toFixed(2));
  const net = Number((gross - platformFee).toFixed(2));

  return {
    entryFee: Number(entryFee || 0),
    maxTeams: Number(maxTeams || 0),
    platformFeePct: Number(platformFeePct),
    grossPool: gross,
    platformFeeAmount: platformFee,
    netPrizePool: net,
    distribution: {
      champion1st: { label: '1º Lugar (Campeão)', pct: 60, amount: Number((net * 0.6).toFixed(2)) },
      runnerUp2nd: { label: '2º Lugar (Vice-Campeão)', pct: 25, amount: Number((net * 0.25).toFixed(2)) },
      thirdPlace3rd: { label: '3º Lugar (Semifinalista)', pct: 10, amount: Number((net * 0.1).toFixed(2)) },
      topScorerMvp: { label: 'Artilheiro & Craque', pct: 5, amount: Number((net * 0.05).toFixed(2)) }
    }
  };
}

function getDb() {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}

module.exports = {
  createDatabase,
  getDb,
  recordFinancialTransaction,
  verifyFullLedgerIntegrity,
  calculateTournamentPrizePool
};
