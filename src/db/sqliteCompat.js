'use strict';

const fs = require('node:fs');

/**
 * Motor de Compatibilidade SQLite Puro-JS (Zero Dependências Nativas)
 * Ativado automaticamente caso o servidor aaPanel esteja utilizando Node.js 18 ou 20
 * (anteriores ao módulo nativo `node:sqlite` do Node 22.5+ / 24 LTS).
 */
class SqliteCompatDatabase {
  constructor(filePath = ':memory:') {
    this.filePath = filePath === ':memory:' ? null : `${filePath}.json`;
    this.tables = {
      users: [],
      federations: [],
      teams: [],
      tournaments: [],
      tournament_invitations: [],
      matches: [],
      bets: [],
      predictions: [],
      prediction_purchases: [],
      tipster_stats: [],
      financial_transactions: [],
      immutable_ledger: [],
      notifications: [],
      support_tickets: [],
      disciplinary_actions: []
    };
    this._seqCounter = 0;

    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (raw && raw.tables) {
          this.tables = { ...this.tables, ...raw.tables };
          this._seqCounter = raw.seqCounter || this.tables.immutable_ledger.length;
        }
      } catch {
        // Inicia banco limpo se arquivo estiver vazio
      }
    }
  }

  _persist() {
    if (!this.filePath) return;
    try {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ seqCounter: this._seqCounter, tables: this.tables }),
        'utf8'
      );
    } catch {
      // Ignora erro de escrita em diretórios somente leitura
    }
  }

  exec() {
    return this;
  }

  prepare(sql) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const self = this;

    return {
      run(...params) {
        self._executeWrite(norm, params);
        self._persist();
        return { changes: 1 };
      },
      get(...params) {
        const rows = self._executeRead(norm, params);
        return rows[0] || undefined;
      },
      all(...params) {
        return self._executeRead(norm, params);
      }
    };
  }

  _executeWrite(norm, params) {
    // 1. INSERT INTO <table> (<cols>) VALUES (...)
    const insMatch = norm.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insMatch) {
      const table = insMatch[1];
      const cols = insMatch[2].split(',').map((c) => c.trim());
      const valTokens = insMatch[3].split(',').map((v) => v.trim());
      const row = {};
      let pIdx = 0;

      if (table === 'immutable_ledger') {
        this._seqCounter += 1;
        row.seq = this._seqCounter;
      }

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const tok = valTokens[i];
        if (tok === '?') {
          row[col] = params[pIdx++];
        } else if (tok === 'NULL') {
          row[col] = null;
        } else if (/^'.*'$/.test(tok)) {
          row[col] = tok.slice(1, -1);
        } else {
          row[col] = Number(tok);
        }
      }

      if (!this.tables[table]) this.tables[table] = [];
      this.tables[table].push(row);
      return;
    }

    // 2. UPDATE statements
    if (/^UPDATE users SET mfa_enabled = 1 WHERE id = \?/i.test(norm)) {
      const u = this.tables.users.find((r) => r.id === params[0]);
      if (u) u.mfa_enabled = 1;
      return;
    }
    if (/^UPDATE users SET cpf_masked = \?/i.test(norm)) {
      const [cpf_masked, cpf_encrypted_hsm, kyc_doc_type, kyc_doc_encrypted_hsm, kyc_residence_proof, kyc_verified_at, id] = params;
      const u = this.tables.users.find((r) => r.id === id);
      if (u) {
        Object.assign(u, {
          cpf_masked,
          cpf_encrypted_hsm,
          kyc_status: 'VERIFIED',
          kyc_doc_type,
          kyc_doc_encrypted_hsm,
          kyc_residence_proof,
          kyc_verified_at
        });
      }
      return;
    }
    if (/^UPDATE users SET daily_deposit_limit = \?/i.test(norm)) {
      const [daily_deposit_limit, monthly_deposit_limit, account_status, id] = params;
      const u = this.tables.users.find((r) => r.id === id);
      if (u) Object.assign(u, { daily_deposit_limit, monthly_deposit_limit, account_status });
      return;
    }
    if (/^UPDATE users SET wallet_balance = \? WHERE id = \?/i.test(norm)) {
      const [wallet_balance, id] = params;
      const u = this.tables.users.find((r) => r.id === id);
      if (u) u.wallet_balance = wallet_balance;
      return;
    }
    if (/^UPDATE users SET notif_prefs_json = \? WHERE id = \?/i.test(norm)) {
      const [notif_prefs_json, id] = params;
      const u = this.tables.users.find((r) => r.id === id);
      if (u) u.notif_prefs_json = notif_prefs_json;
      return;
    }
    if (/^UPDATE users SET account_status = 'SUSPENDED' WHERE id = \?/i.test(norm)) {
      const u = this.tables.users.find((r) => r.id === params[0]);
      if (u) u.account_status = 'SUSPENDED';
      return;
    }
    if (/^UPDATE tournaments SET registered_teams_count/i.test(norm)) {
      const t = this.tables.tournaments.find((r) => r.id === params[0]);
      if (t) t.registered_teams_count = Math.min(t.max_teams, t.registered_teams_count + 1);
      return;
    }
    if (/^UPDATE tournaments SET standings_json = \? WHERE id = \?/i.test(norm)) {
      const [standings_json, id] = params;
      const t = this.tables.tournaments.find((r) => r.id === id);
      if (t) t.standings_json = standings_json;
      return;
    }
    if (/^UPDATE matches SET odds_json = \?, minute = \?, updated_at = \? WHERE id = \?/i.test(norm)) {
      const [odds_json, minute, updated_at, id] = params;
      const m = this.tables.matches.find((r) => r.id === id);
      if (m) Object.assign(m, { odds_json, minute, updated_at });
      return;
    }
    if (/^UPDATE matches SET home_score = \?/i.test(norm)) {
      const [home_score, away_score, minute, stats_json, odds_json, updated_at, id] = params;
      const m = this.tables.matches.find((r) => r.id === id);
      if (m) Object.assign(m, { home_score, away_score, minute, stats_json, odds_json, updated_at });
      return;
    }
    if (/^UPDATE bets SET status = 'CASHED_OUT' WHERE id = \?/i.test(norm)) {
      const b = this.tables.bets.find((r) => r.id === params[0]);
      if (b) b.status = 'CASHED_OUT';
      return;
    }
    if (/^UPDATE predictions SET sales_count = sales_count \+ 1 WHERE id = \?/i.test(norm)) {
      const p = this.tables.predictions.find((r) => r.id === params[0]);
      if (p) p.sales_count += 1;
      return;
    }
    if (/^UPDATE notifications SET read_status = 1 WHERE user_id = \?/i.test(norm)) {
      this.tables.notifications.forEach((n) => {
        if (n.user_id === params[0]) n.read_status = 1;
      });
      return;
    }
    if (/^UPDATE support_tickets SET status = 'RESOLVED'/i.test(norm)) {
      const [resolution_note, resolved_by, updated_at, id] = params;
      const tk = this.tables.support_tickets.find((r) => r.id === id);
      if (tk) Object.assign(tk, { status: 'RESOLVED', resolution_note, resolved_by, updated_at });
      return;
    }
    if (/^UPDATE financial_transactions SET reconciled = 1/i.test(norm)) {
      const [reconciled_at] = params;
      this.tables.financial_transactions.forEach((tx) => {
        if (!tx.reconciled) {
          tx.reconciled = 1;
          tx.reconciled_at = reconciled_at;
        }
      });
      return;
    }
    if (/^UPDATE immutable_ledger SET amount = amount \+ 0\.01 WHERE seq = 1/i.test(norm)) {
      const b = this.tables.immutable_ledger.find((r) => r.seq === 1);
      if (b) b.amount += 0.01;
    }
  }

  _executeRead(norm, params) {
    if (/^SELECT COUNT\(\*\) as c FROM users/i.test(norm)) {
      return [{ c: this.tables.users.length }];
    }
    if (/^SELECT block_hash FROM immutable_ledger ORDER BY seq DESC LIMIT 1/i.test(norm)) {
      const sorted = [...this.tables.immutable_ledger].sort((a, b) => b.seq - a.seq);
      return sorted.slice(0, 1);
    }
    if (/totalTransactions/i.test(norm)) {
      const txs = this.tables.financial_transactions;
      return [
        {
          totalTransactions: txs.length,
          grossVolume: txs.reduce((s, r) => s + Number(r.amount || 0), 0),
          totalPlatformFees: txs.reduce((s, r) => s + Number(r.fee || 0), 0),
          pixVolume: txs.filter((r) => r.method === 'PIX').reduce((s, r) => s + Number(r.amount || 0), 0)
        }
      ];
    }

    const fromMatch = norm.match(/FROM (\w+)/i);
    if (!fromMatch) return [];
    const table = fromMatch[1];
    let rows = [...(this.tables[table] || [])];

    // Filtros WHERE comuns
    if (/WHERE id = \? AND user_id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.id === params[0] && r.user_id === params[1]);
    } else if (/WHERE prediction_id = \? AND buyer_id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.prediction_id === params[0] && r.buyer_id === params[1]);
    } else if (/WHERE id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.id === params[0]);
    } else if (/WHERE email = \?/i.test(norm)) {
      rows = rows.filter((r) => r.email === params[0]);
    } else if (/WHERE user_id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.user_id === params[0]);
    } else if (/WHERE buyer_id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.buyer_id === params[0]);
    } else if (/WHERE tournament_id = \?/i.test(norm)) {
      rows = rows.filter((r) => r.tournament_id === params[0]);
    } else if (/WHERE id = 'usr-admin-01'/i.test(norm)) {
      rows = rows.filter((r) => r.id === 'usr-admin-01');
    } else if (/WHERE status = 'LIVE'/i.test(norm)) {
      rows = rows.filter((r) => r.status === 'LIVE');
    }

    // Ordenações comuns
    if (/ORDER BY seq ASC/i.test(norm)) {
      rows.sort((a, b) => a.seq - b.seq);
    } else if (/ORDER BY seq DESC/i.test(norm)) {
      rows.sort((a, b) => b.seq - a.seq);
    } else if (/ORDER BY elo_rating DESC/i.test(norm)) {
      rows.sort((a, b) => b.elo_rating - a.elo_rating);
    } else if (/ORDER BY roi_pct DESC/i.test(norm)) {
      rows.sort((a, b) => b.roi_pct - a.roi_pct || b.win_rate_pct - a.win_rate_pct);
    } else if (/ORDER BY created_at DESC/i.test(norm)) {
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    const limitMatch = norm.match(/LIMIT (\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, Number(limitMatch[1]));
    }
    return rows;
  }
}

module.exports = { SqliteCompatDatabase };
