'use strict';

(function () {
  const state = {
    currentUser: null,
    demoProfiles: [],
    federations: [],
    teams: [],
    tournaments: [],
    matches: [],
    bets: [],
    predictions: [],
    tipstersRanking: [],
    transactions: [],
    ledgerBlocks: [],
    ledgerIntegrity: { valid: true, totalBlocks: 0 },
    notifications: [],
    adminData: {
      supportTickets: [],
      disciplinaryActions: [],
      wafIntrusionLog: [],
      hsmStatus: {}
    },
    marketView: 'ALL',
    tipsterSportFilter: 'ALL',
    betSlip: [
      {
        matchId: 'mch-pal-fla-live',
        matchLabel: 'SE Palmeiras vs CR Flamengo',
        market: 'Resultado Final (1X2)',
        selection: 'SE Palmeiras',
        odds: 1.58
      }
    ]
  };

  function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function showSnackbar(message) {
    const el = document.getElementById('md3-snackbar');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove('show');
    }, 3800);
  }

  async function apiRequest(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (state.currentUser && state.currentUser.id) {
      headers['x-campeonei-user-id'] = state.currentUser.id;
    }
    const res = await fetch(path, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Erro na operação.');
    }
    return data;
  }

  async function loadBootstrap(userId = null) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await apiRequest(`/api/bootstrap${query}`);
    Object.assign(state, data);
    renderAll();
  }

  function connectLiveStream() {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/stream/live');

    es.addEventListener('odds_tick', (ev) => {
      try {
        const tick = JSON.parse(ev.data);
        const match = state.matches.find((m) => m.id === tick.matchId);
        if (match) {
          match.minute = tick.minute;
          match.odds = tick.odds;
          renderLiveMatches();
          const latEl = document.getElementById('metric-odds-latency');
          if (latEl) {
            const ms = 9 + Math.floor(Math.random() * 9);
            latEl.textContent = `${ms} ms • SSE Ao Vivo`;
          }
        }
      } catch {
        // Ignora erro de parse SSE
      }
    });

    es.addEventListener('match_update', (ev) => {
      try {
        const upd = JSON.parse(ev.data);
        const match = state.matches.find((m) => m.id === upd.matchId);
        if (match) {
          match.home_score = upd.homeScore;
          match.away_score = upd.awayScore;
          match.minute = upd.minute;
          match.stats = upd.stats;
          match.odds = upd.odds;
        }
        if (upd.standings && upd.standings.length && state.tournaments.length) {
          state.tournaments[0].standings = upd.standings;
        }
        renderLiveMatches();
        renderTournaments();
      } catch {
        // Ignora erro de parse
      }
    });

    es.addEventListener('notification', (ev) => {
      try {
        const notif = JSON.parse(ev.data);
        if (!state.currentUser || notif.userId === state.currentUser.id) {
          state.notifications.unshift({
            ...notif,
            read_status: 0,
            created_at: notif.createdAt
          });
          renderHeaderStatus();
          renderNotificationsModal();
        }
      } catch {
        // Ignora erro
      }
    });
  }

  function renderAll() {
    renderHeaderStatus();
    renderLiveMatches();
    renderBetSlip();
    renderUserBets();
    renderFederationOptions();
    renderPrizePreview();
    renderTournaments();
    renderTeamsRoster();
    renderTipstersRanking();
    renderPredictionsMarketplace();
    renderSecurityAndKyc();
    renderAdminDashboard();
    renderNotificationsModal();
  }

  function renderHeaderStatus() {
    const u = state.currentUser;
    if (!u) return;

    const balanceEl = document.getElementById('top-wallet-balance');
    if (balanceEl) balanceEl.textContent = formatBRL(u.walletBalance);

    const kycBadge = document.getElementById('header-kyc-badge');
    if (kycBadge) {
      if (u.insiderRestricted) {
        kycBadge.className = 'md3-badge badge-error';
        kycBadge.textContent = 'ATLETA IMPEDIDO (LEI 14.790)';
      } else if (u.kycStatus === 'VERIFIED') {
        kycBadge.className = 'md3-badge badge-success';
        kycBadge.textContent = `KYC VERIFICADO • ${u.role.toUpperCase()}`;
      } else {
        kycBadge.className = 'md3-badge badge-warning';
        kycBadge.textContent = 'KYC PENDENTE (BLOQUEIO FIN.)';
      }
    }

    const switcher = document.getElementById('profile-switcher-select');
    if (switcher && state.demoProfiles.length) {
      switcher.innerHTML = state.demoProfiles
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === u.id ? 'selected' : ''}>${p.name} [${p.role}]</option>`
        )
        .join('');
    }

    const unreadCount = state.notifications.filter((n) => !n.read_status).length;
    const notifCountEl = document.getElementById('notif-unread-count');
    if (notifCountEl) notifCountEl.textContent = String(unreadCount);
  }

  /* ========================================================================
     MÓDULO 2: PARTIDAS AO VIVO, MERCADOS E BILHETE DE APOSTAS (<= 3 CLIQUES)
     ======================================================================== */
  function renderLiveMatches() {
    const container = document.getElementById('live-matches-container');
    if (!container) return;

    container.innerHTML = state.matches
      .map((m) => {
        const odds = m.odds || {};
        const mw = odds.matchWinner || { home: 1.8, draw: 3.3, away: 4.2 };
        const hc = odds.handicap || {};
        const ou = odds.goalsOverUnder || {};
        const btts = odds.btts || { yes: 1.75, no: 2.05 };

        const isSel = (market, selection) =>
          state.betSlip.some((s) => s.matchId === m.id && s.market === market && s.selection === selection);

        const show1x2 = state.marketView === 'ALL' || state.marketView === '1X2';
        const showHandicap = state.marketView === 'ALL' || state.marketView === 'HANDICAP';
        const showGoals = state.marketView === 'ALL' || state.marketView === 'GOALS';

        const hcKeys = Object.keys(hc).slice(0, 2);
        const ouKeys = Object.keys(ou).slice(0, 2);

        return `
          <article class="md3-card" id="match-card-${m.id}">
            <div class="match-card-header">
              <div>
                <strong>${m.tournament_name}</strong> • <span>${m.round_name}</span>
              </div>
              <span class="md3-badge badge-success tabular-nums">
                <span class="live-dot"></span> AO VIVO ${m.minute}'
              </span>
            </div>

            <div class="match-scoreboard">
              <div class="team-side">
                <span class="team-avatar">${m.home_short}</span>
                <span>${m.home_team_name}</span>
              </div>
              <div class="score-pill tabular-nums">${m.home_score} : ${m.away_score}</div>
              <div class="team-side away">
                <span>${m.away_team_name}</span>
                <span class="team-avatar">${m.away_short}</span>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant); background: var(--md-sys-color-surface-container); padding: 6px 10px; border-radius: 8px;">
              <span>Posse: <strong>${m.stats.possessionHome}% - ${m.stats.possessionAway}%</strong></span>
              <span>Finalizações: <strong>${m.stats.shotsOnTargetHome} x ${m.stats.shotsOnTargetAway}</strong></span>
              <span>Feed: <strong class="mono-code">${m.official_feed_code}</strong></span>
            </div>

            ${
              show1x2
                ? `
              <div>
                <div style="font-size: 0.74rem; font-weight: 700; margin-bottom: 5px; color: var(--md-sys-color-on-surface-variant);">
                  Resultado Final (1X2)
                </div>
                <div class="odds-grid-3">
                  <button type="button" class="odd-button ${isSel('Resultado Final (1X2)', m.home_team_name) ? 'selected' : ''}"
                    data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                    data-bet-market="Resultado Final (1X2)" data-bet-selection="${m.home_team_name}" data-bet-odds="${mw.home}">
                    <span class="odd-label">1 • ${m.home_short}</span>
                    <span class="odd-value tabular-nums">@${Number(mw.home).toFixed(2)}</span>
                  </button>
                  <button type="button" class="odd-button ${isSel('Resultado Final (1X2)', 'Empate') ? 'selected' : ''}"
                    data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                    data-bet-market="Resultado Final (1X2)" data-bet-selection="Empate" data-bet-odds="${mw.draw}">
                    <span class="odd-label">X • Empate</span>
                    <span class="odd-value tabular-nums">@${Number(mw.draw).toFixed(2)}</span>
                  </button>
                  <button type="button" class="odd-button ${isSel('Resultado Final (1X2)', m.away_team_name) ? 'selected' : ''}"
                    data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                    data-bet-market="Resultado Final (1X2)" data-bet-selection="${m.away_team_name}" data-bet-odds="${mw.away}">
                    <span class="odd-label">2 • ${m.away_short}</span>
                    <span class="odd-value tabular-nums">@${Number(mw.away).toFixed(2)}</span>
                  </button>
                </div>
              </div>
            `
                : ''
            }

            ${
              showHandicap && hcKeys.length
                ? `
              <div>
                <div style="font-size: 0.74rem; font-weight: 700; margin-bottom: 5px; color: var(--md-sys-color-on-surface-variant);">
                  Handicap Asiático
                </div>
                <div class="odds-grid-2">
                  ${hcKeys
                    .map((k) => {
                      const item = hc[k];
                      return `
                        <button type="button" class="odd-button ${isSel('Handicap Asiático', item.label) ? 'selected' : ''}"
                          data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                          data-bet-market="Handicap Asiático" data-bet-selection="${item.label}" data-bet-odds="${item.odds}">
                          <span class="odd-label">${item.label}</span>
                          <span class="odd-value tabular-nums">@${Number(item.odds).toFixed(2)}</span>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
                : ''
            }

            ${
              showGoals && ouKeys.length
                ? `
              <div>
                <div style="font-size: 0.74rem; font-weight: 700; margin-bottom: 5px; color: var(--md-sys-color-on-surface-variant);">
                  Número de Gols / Pontos &amp; Ambas Marcam
                </div>
                <div class="odds-grid-3">
                  ${ouKeys
                    .map((k) => {
                      const item = ou[k];
                      return `
                        <button type="button" class="odd-button ${isSel('Total de Gols', item.label) ? 'selected' : ''}"
                          data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                          data-bet-market="Total de Gols" data-bet-selection="${item.label}" data-bet-odds="${item.odds}">
                          <span class="odd-label">${item.label}</span>
                          <span class="odd-value tabular-nums">@${Number(item.odds).toFixed(2)}</span>
                        </button>
                      `;
                    })
                    .join('')}
                  <button type="button" class="odd-button ${isSel('Ambas Marcam', 'Ambas Marcam: Sim') ? 'selected' : ''}"
                    data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                    data-bet-market="Ambas Marcam" data-bet-selection="Ambas Marcam: Sim" data-bet-odds="${btts.yes}">
                    <span class="odd-label">Ambas: Sim</span>
                    <span class="odd-value tabular-nums">@${Number(btts.yes).toFixed(2)}</span>
                  </button>
                </div>
              </div>
            `
                : ''
            }

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid var(--md-sys-color-outline-variant); font-size: 0.75rem;">
              <span style="color: var(--md-sys-color-on-surface-variant);">${m.stats.lastEvent || ''}</span>
              <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-sync-match="${m.id}">
                📡 Simular Gol no Feed Oficial
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderBetSlip() {
    const container = document.getElementById('betslip-items-container');
    const countBadge = document.getElementById('betslip-count-badge');
    const totalOddsEl = document.getElementById('betslip-total-odds');
    const potReturnEl = document.getElementById('betslip-potential-return');
    const stakeInput = document.getElementById('betslip-stake-input');

    if (!container) return;

    const count = state.betSlip.length;
    if (countBadge) {
      countBadge.textContent = count === 0 ? 'Vazio' : count === 1 ? 'Simples (1)' : `Múltipla (${count})`;
    }

    if (count === 0) {
      container.innerHTML = `
        <div class="md3-card-filled" style="text-align: center; font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);">
          Clique em qualquer cotação (@Odd) nas partidas ao vivo para adicionar ao bilhete.
        </div>
      `;
    } else {
      container.innerHTML = state.betSlip
        .map(
          (item, idx) => `
          <div class="betslip-selection-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 0.85rem;">${item.selection}</strong>
              <span class="odd-value tabular-nums">@${Number(item.odds).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">
              <span>${item.market} • ${item.matchLabel}</span>
              <button type="button" class="md3-btn md3-btn-outlined md3-btn-sm" style="height: 24px; padding: 0 8px;" data-remove-slip="${idx}">
                ✕
              </button>
            </div>
          </div>
        `
        )
        .join('');
    }

    const combinedOdds =
      count > 0 ? state.betSlip.reduce((acc, s) => acc * Number(s.odds), 1.0) : 0;
    const stake = Number(stakeInput ? stakeInput.value : 50);
    const potential = combinedOdds * stake;

    if (totalOddsEl) totalOddsEl.textContent = `@${combinedOdds.toFixed(2)}`;
    if (potReturnEl) potReturnEl.textContent = formatBRL(potential);
  }

  function renderUserBets() {
    const wrap = document.getElementById('user-bets-list');
    if (!wrap) return;
    if (!state.bets.length) {
      wrap.innerHTML = `<div style="padding: 16px; font-size: 0.85rem;">Nenhuma aposta registrada para este usuário ainda.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="md3-table">
        <thead>
          <tr>
            <th>ID Bilhete</th>
            <th>Tipo &amp; Seleções</th>
            <th>Cotação</th>
            <th>Valor Apostado</th>
            <th>Retorno Potencial</th>
            <th>Integridade ML</th>
            <th>Status / Cashout</th>
          </tr>
        </thead>
        <tbody>
          ${state.bets
            .map((b) => {
              const sels = (b.selections || []).map((s) => `${s.selection} (@${s.odds})`).join(' + ');
              return `
                <tr>
                  <td class="mono-code">${b.id}</td>
                  <td><strong>${b.bet_type === 'MULTIPLE' ? 'Múltipla' : 'Simples'}</strong>: ${sels}</td>
                  <td class="tabular-nums"><strong>@${Number(b.combined_odds).toFixed(2)}</strong></td>
                  <td class="tabular-nums">${formatBRL(b.stake_amount)} (${b.payment_method})</td>
                  <td class="tabular-nums" style="color: var(--md-sys-color-primary); font-weight: 700;">
                    ${formatBRL(b.potential_return)}
                  </td>
                  <td>
                    <span class="md3-badge ${b.ml_risk_level === 'LOW' ? 'badge-success' : 'badge-warning'}">
                      Score ${b.ml_risk_score}/100 (${b.ml_risk_level})
                    </span>
                  </td>
                  <td>
                    ${
                      b.status === 'OPEN'
                        ? `<button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-cashout-bet="${b.id}">
                             💸 Cashout ${formatBRL(b.cashout_value)}
                           </button>`
                        : `<span class="md3-badge badge-neutral">${b.status}</span>`
                    }
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  /* ========================================================================
     MÓDULO 1: FEDERAÇÕES, TIMES, CAMPEONATOS E PREMIAÇÃO AUTOMÁTICA
     ======================================================================== */
  function renderFederationOptions() {
    const sel = document.getElementById('trn-fed-select');
    if (!sel) return;
    sel.innerHTML = state.federations
      .map((f) => `<option value="${f.id}">${f.acronym} — ${f.name} (${f.sport})</option>`)
      .join('');
  }

  function renderPrizePreview() {
    const box = document.getElementById('prize-calc-preview');
    const maxTeamsEl = document.getElementById('trn-max-teams');
    const feeEl = document.getElementById('trn-entry-fee');
    if (!box || !maxTeamsEl || !feeEl) return;

    const maxTeams = Number(maxTeamsEl.value || 16);
    const entryFee = Number(feeEl.value || 0);
    const gross = maxTeams * entryFee;
    const fee = gross * 0.1;
    const net = gross - fee;

    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <strong style="font-size: 0.85rem;">Cálculo Automático de Premiação (Custódia PIX Garantida)</strong>
        <span class="md3-badge badge-success tabular-nums">Líquido: ${formatBRL(net)}</span>
      </div>
      <div class="md3-grid-4" style="font-size: 0.78rem;">
        <div>1º Lugar (60%): <strong class="tabular-nums">${formatBRL(net * 0.6)}</strong></div>
        <div>2º Lugar (25%): <strong class="tabular-nums">${formatBRL(net * 0.25)}</strong></div>
        <div>3º Lugar (10%): <strong class="tabular-nums">${formatBRL(net * 0.1)}</strong></div>
        <div>Artilheiro (5%): <strong class="tabular-nums">${formatBRL(net * 0.05)}</strong></div>
      </div>
    `;
  }

  function renderTournaments() {
    const container = document.getElementById('tournaments-list-container');
    if (!container) return;

    container.innerHTML = state.tournaments
      .map((tr) => {
        const dist = tr.prizeDistribution?.distribution || {};
        const standingsRows = (tr.standings || [])
          .map(
            (r) => `
            <tr>
              <td class="tabular-nums"><strong>${r.pos}º</strong></td>
              <td><strong>${r.teamName}</strong> <span class="mono-code">(${r.short})</span></td>
              <td class="tabular-nums"><strong>${r.pts}</strong></td>
              <td class="tabular-nums">${r.played}</td>
              <td class="tabular-nums">${r.wins}</td>
              <td class="tabular-nums">${r.draws}</td>
              <td class="tabular-nums">${r.losses}</td>
              <td class="tabular-nums">${r.gf}:${r.ga} (${r.gd >= 0 ? '+' + r.gd : r.gd})</td>
              <td>${(r.form || []).join(' ')}</td>
            </tr>
          `
          )
          .join('');

        return `
          <div class="md3-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h3 style="margin: 0; font-size: 1.15rem;">${tr.name}</h3>
                  <span class="md3-badge badge-success">${tr.format}</span>
                  <span class="md3-badge badge-neutral">${tr.registered_teams_count}/${tr.max_teams} Times</span>
                </div>
                <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant);">
                  Fonte Oficial: <strong>${tr.official_data_source}</strong> • Critérios de Desempate: <strong>${(tr.tiebreakerRules || []).join(' > ')}</strong>
                </p>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-invite-trn="${tr.id}">
                  ✉️ Convidar Clube &amp; Inscrição PIX (${formatBRL(tr.entry_fee)})
                </button>
              </div>
            </div>

            <div class="md3-grid-4" style="background: var(--md-sys-color-surface-container); padding: 12px; border-radius: 12px; font-size: 0.82rem;">
              <div>Inscrição por Clube: <strong class="tabular-nums">${formatBRL(tr.entry_fee)}</strong></div>
              <div>Premiação Líquida: <strong class="tabular-nums" style="color: var(--md-sys-color-primary);">${formatBRL(tr.prize_pool_net)}</strong></div>
              <div>Campeão (1º): <strong class="tabular-nums">${formatBRL(dist.champion1st?.amount || tr.prize_pool_net * 0.6)}</strong></div>
              <div>Vice (2º): <strong class="tabular-nums">${formatBRL(dist.runnerUp2nd?.amount || tr.prize_pool_net * 0.25)}</strong></div>
            </div>

            <div class="md3-table-wrap">
              <table class="md3-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Clube</th>
                    <th>PTS</th>
                    <th>J</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>GP:GC (SG)</th>
                    <th>Últimos Jogos</th>
                  </tr>
                </thead>
                <tbody>
                  ${standingsRows}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderTeamsRoster() {
    const grid = document.getElementById('teams-roster-grid');
    if (!grid) return;

    grid.innerHTML = state.teams
      .map(
        (t) => `
        <div class="md3-card-filled" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 1rem;">${t.name} (${t.short_name})</strong>
              <div style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">
                ${t.city}/${t.state} • Estádio: ${t.stadium} • Técnico: ${t.coach_name}
              </div>
            </div>
            <span class="md3-badge badge-success tabular-nums">Elo ${t.elo_rating}</span>
          </div>

          <div style="font-size: 0.76rem; display: flex; gap: 12px; flex-wrap: wrap;">
            <span>Histórico: <strong>${t.history.nationalTitles || 0} Títulos Nacionais</strong></span>
            <span>Campanha: <strong>${t.stats.wins}V ${t.stats.draws}E ${t.stats.losses}D (${t.stats.goalsFor} GP)</strong></span>
          </div>

          <div class="md3-table-wrap">
            <table class="md3-table" style="font-size: 0.76rem;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Atleta</th>
                  <th>Posição</th>
                  <th>OVR</th>
                  <th>Gols/Pts</th>
                </tr>
              </thead>
              <tbody>
                ${(t.roster || [])
                  .slice(0, 4)
                  .map(
                    (p) => `
                  <tr>
                    <td class="tabular-nums">${p.number}</td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.position}</td>
                    <td class="tabular-nums">${p.rating}</td>
                    <td class="tabular-nums">${p.goals}G / ${p.assists}A</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
      )
      .join('');
  }

  /* ========================================================================
     MÓDULO 3: MERCADO DE PREVISÕES ESPORTIVAS E RANKING DE PROGNOSTICADORES
     ======================================================================== */
  function renderTipstersRanking() {
    const wrap = document.getElementById('tipsters-ranking-table');
    if (!wrap) return;

    const filtered =
      state.tipsterSportFilter === 'ALL'
        ? state.tipstersRanking
        : state.tipstersRanking.filter(
            (r) => r.specialty_sport.toLowerCase() === state.tipsterSportFilter.toLowerCase()
          );

    wrap.innerHTML = `
      <table class="md3-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Prognosticador Verificado</th>
            <th>Esporte</th>
            <th>Acertos / Erros (Histórico)</th>
            <th>Taxa de Acerto</th>
            <th>ROI Auditado</th>
            <th>Consistência</th>
            <th>Lucro (Unid.)</th>
            <th>Sequência Pública</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (r, idx) => `
            <tr>
              <td class="tabular-nums"><strong>#${idx + 1}</strong></td>
              <td><strong>${r.display_name}</strong></td>
              <td><span class="md3-badge badge-neutral">${r.specialty_sport}</span></td>
              <td class="tabular-nums">
                <strong style="color: var(--md-sys-color-success);">${r.greens} GREEN</strong> /
                <strong style="color: var(--md-sys-color-error);">${r.reds} RED</strong>
                (${r.total_predictions} picks)
              </td>
              <td class="tabular-nums"><strong>${Number(r.win_rate_pct).toFixed(1)}%</strong></td>
              <td class="tabular-nums" style="color: var(--md-sys-color-primary); font-weight: 800;">
                +${Number(r.roi_pct).toFixed(1)}%
              </td>
              <td class="tabular-nums">${Number(r.consistency_score).toFixed(1)}%</td>
              <td class="tabular-nums">+${Number(r.profit_units).toFixed(1)}u</td>
              <td>
                ${(r.recentStreak || [])
                  .map(
                    (st) =>
                      `<span class="md3-badge ${st === 'GREEN' ? 'badge-success' : 'badge-error'}" style="padding: 2px 6px; margin-right: 2px;">${st === 'GREEN' ? '✓' : '✕'}</span>`
                  )
                  .join('')}
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  function renderPredictionsMarketplace() {
    const container = document.getElementById('predictions-cards-container');
    if (!container) return;

    const list =
      state.tipsterSportFilter === 'ALL'
        ? state.predictions
        : state.predictions.filter(
            (p) => p.sport.toLowerCase() === state.tipsterSportFilter.toLowerCase()
          );

    container.innerHTML = list
      .map((p) => {
        const statusBadge =
          p.resultStatus === 'GREEN'
            ? '<span class="md3-badge badge-success">HISTÓRICO AUDITADO: GREEN ✓</span>'
            : p.resultStatus === 'RED'
            ? '<span class="md3-badge badge-error">HISTÓRICO AUDITADO: RED ✕</span>'
            : `<span class="md3-badge badge-warning">CONFIANÇA ${p.confidencePct}% • ${p.stakeUnits}u</span>`;

        return `
          <div class="md3-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                <strong>${p.tipsterName}</strong>
                <span class="md3-badge badge-neutral" style="margin-left: 6px;">${p.sport}</span>
              </div>
              ${statusBadge}
            </div>

            <div style="font-size: 0.9rem;">
              <div>Partida: <strong>${p.matchLabel}</strong></div>
              <div>Mercado: <strong>${p.marketType}</strong> — Entrada: <strong style="color: var(--md-sys-color-primary);">${p.selectionLabel} (@${Number(p.recommendedOdds).toFixed(2)})</strong></div>
            </div>

            <p style="margin: 0; font-size: 0.83rem; color: var(--md-sys-color-on-surface-variant);">
              ${p.analysisPreview}
            </p>

            ${
              p.isUnlocked
                ? `
              <div class="md3-card-filled" style="border-left: 4px solid var(--md-sys-color-primary); font-size: 0.82rem;">
                <strong>🔓 Relatório Completo Desbloqueado (HSM AES-256-GCM):</strong>
                <div style="margin-top: 4px;">${p.analysisFullUnlocked}</div>
              </div>
            `
                : `
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--md-sys-color-outline-variant);">
                <div>
                  <span style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">Valor definido pelo prognosticador:</span>
                  <div class="tabular-nums" style="font-size: 1.05rem; font-weight: 800;">${formatBRL(p.price)} <span style="font-size: 0.74rem; font-weight: 400;">(${p.salesCount} compradores)</span></div>
                </div>
                <button type="button" class="md3-btn md3-btn-filled md3-btn-sm" data-buy-prediction="${p.id}">
                  🔓 Comprar &amp; Desbloquear com PIX (${formatBRL(p.price)})
                </button>
              </div>
            `
            }
          </div>
        `;
      })
      .join('');
  }

  /* ========================================================================
     MÓDULO 4: SEGURANÇA, KYC, MFA, JOGO RESPONSÁVEL E LGPD
     ======================================================================== */
  function renderSecurityAndKyc() {
    const u = state.currentUser;
    if (!u) return;

    const pill = document.getElementById('security-kyc-status-pill');
    if (pill) {
      pill.className = `md3-badge ${u.kycStatus === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`;
      pill.textContent = u.kycStatus === 'VERIFIED' ? 'IDENTIDADE VERIFICADA' : 'KYC PENDENTE';
    }

    const totpCodeEl = document.getElementById('mfa-demo-totp-code');
    if (totpCodeEl) {
      totpCodeEl.textContent = u.totpCurrentDemoCode || '000000';
    }
  }

  /* ========================================================================
     MÓDULO 5: PAINEL ADMINISTRATIVO HIERÁRQUICO (RBAC) & LEDGER SHA-256
     ======================================================================== */
  function renderAdminDashboard() {
    const u = state.currentUser;
    if (!u) return;

    const banner = document.getElementById('admin-rbac-banner');
    if (banner) {
      const hsmStatus = state.adminData.hsmStatus || {};
      banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <strong>Sessão Hierárquica RBAC Ativa:</strong> ${u.name}
            <span class="md3-badge badge-success" style="margin-left: 8px;">PERFIL: ${u.role.toUpperCase()}</span>
            <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant); margin-top: 4px;">
              Permissões Habilitadas: <span class="mono-code">${(u.permissions || []).join(', ')}</span>
            </div>
          </div>
          <div style="font-size: 0.78rem; text-align: right;">
            <div>Módulo HSM: <strong>${hsmStatus.module || 'CloudHSM FIPS 140-3'}</strong></div>
            <div>Chave Ativa: <span class="mono-code">${hsmStatus.activeKeyId || 'hsm-dek-2026-v1'}</span> (${hsmStatus.totalKeysInVault || 1} chave(s) no cofre)</div>
          </div>
        </div>
      `;
    }

    const ledgerBadge = document.getElementById('ledger-integrity-badge');
    if (ledgerBadge) {
      ledgerBadge.className = `md3-badge ${state.ledgerIntegrity.valid ? 'badge-success' : 'badge-error'}`;
      ledgerBadge.textContent = state.ledgerIntegrity.valid
        ? `CADEIA SHA-256 100% ÍNTEGRA (${state.ledgerIntegrity.totalBlocks} BLOCOS)`
        : 'ALERTA: VIOLAÇÃO DE INTEGRIDADE';
    }

    const ledgerTable = document.getElementById('admin-ledger-table');
    if (ledgerTable) {
      ledgerTable.innerHTML = `
        <table class="md3-table">
          <thead>
            <tr>
              <th>Bloco #</th>
              <th>ID Transação</th>
              <th>Tipo Operação</th>
              <th>Valor</th>
              <th>Saldo Pós</th>
              <th>Hash Anterior (prev_hash)</th>
              <th>Hash do Bloco SHA-256</th>
              <th>Assinatura HSM</th>
            </tr>
          </thead>
          <tbody>
            ${(state.ledgerBlocks || [])
              .map(
                (b) => `
              <tr>
                <td class="tabular-nums"><strong>#${b.seq}</strong></td>
                <td class="mono-code">${b.tx_id}</td>
                <td><span class="md3-badge badge-neutral">${b.type}</span></td>
                <td class="tabular-nums"><strong>${formatBRL(b.amount)}</strong></td>
                <td class="tabular-nums">${formatBRL(b.balance_after)}</td>
                <td class="mono-code" title="${b.prev_hash}">${String(b.prev_hash).slice(0, 12)}...</td>
                <td class="mono-code" title="${b.block_hash}" style="color: var(--md-sys-color-primary);">${String(b.block_hash).slice(0, 14)}...</td>
                <td class="mono-code" title="${b.hsm_signature}">✓ ${String(b.hsm_signature).slice(0, 10)}...</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    const ticketsList = document.getElementById('admin-tickets-list');
    if (ticketsList) {
      ticketsList.innerHTML = (state.adminData.supportTickets || [])
        .map(
          (tk) => `
          <div class="md3-card-filled" style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <div style="font-size: 0.85rem;">
                <strong>${tk.id} — ${tk.subject}</strong>
                <span class="md3-badge ${tk.status === 'RESOLVED' ? 'badge-success' : 'badge-warning'}">${tk.status}</span>
              </div>
              <div style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">
                Solicitante: ${tk.user_name} • ${tk.description}
              </div>
            </div>
            ${
              tk.status !== 'RESOLVED'
                ? `<button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-resolve-ticket="${tk.id}">
                     ✓ Resolver Chamado
                   </button>`
                : ''
            }
          </div>
        `
        )
        .join('');
    }

    const discList = document.getElementById('admin-disciplinary-list');
    if (discList) {
      discList.innerHTML = (state.adminData.disciplinaryActions || [])
        .map(
          (d) => `
          <div class="md3-card-filled" style="font-size: 0.78rem;">
            <strong>${d.id} • ${d.action_type}</strong> contra <strong>${d.target_name}</strong>: ${d.reason}
            <div style="color: var(--md-sys-color-on-surface-variant);">Aplicado por ${d.applied_by} (${d.applied_role})</div>
          </div>
        `
        )
        .join('');
    }
  }

  function renderNotificationsModal() {
    const list = document.getElementById('notifications-modal-list');
    if (!list) return;
    if (!state.notifications.length) {
      list.innerHTML = `<div class="md3-card-filled">Nenhuma notificação registrada.</div>`;
      return;
    }

    list.innerHTML = state.notifications
      .map(
        (n) => `
        <div class="md3-card-filled" style="border-left: 4px solid ${n.read_status ? 'var(--md-sys-color-outline)' : 'var(--md-sys-color-primary)'};">
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
            <strong>${n.title}</strong>
            <span class="md3-badge badge-neutral">${n.category}</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);">${n.message}</p>
        </div>
      `
      )
      .join('');
  }

  async function refreshPixModalQr() {
    const amountEl = document.getElementById('pix-modal-amount');
    const qrImg = document.getElementById('pix-qr-image');
    const brCodeText = document.getElementById('pix-brcode-textarea');
    const amount = Number(amountEl ? amountEl.value : 250);
    const data = await apiRequest('/api/payments/pix/create', {
      method: 'POST',
      body: JSON.stringify({ amount, description: 'DEPOSITO CAMPEONEI PIX' })
    });
    if (qrImg) qrImg.src = data.qrSvgDataUri;
    if (brCodeText) brCodeText.value = data.brCode;
  }

  /* ========================================================================
     EVENT LISTENERS E INTERAÇÕES EM <= 3 CLIQUES
     ======================================================================== */
  function attachEvents() {
    // Navegação entre abas principais
    document.querySelectorAll('.nav-rail-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        document.querySelectorAll('.nav-rail-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');
      });
    });

    // Alternar Tema Claro / Escuro Material Design 3
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        showSnackbar(`Tema Material Design 3 alterado para modo ${next === 'dark' ? 'Escuro' : 'Claro'}.`);
      });
    }

    // Troca de Perfil / Permissão RBAC
    const switcher = document.getElementById('profile-switcher-select');
    if (switcher) {
      switcher.addEventListener('change', async () => {
        await loadBootstrap(switcher.value);
        showSnackbar(`Perfil ativo alterado para ${state.currentUser.name} (${state.currentUser.role}).`);
      });
    }

    // Filtro de Mercados de Apostas
    document.querySelectorAll('[data-market-view]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-market-view]').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.marketView = chip.getAttribute('data-market-view');
        renderLiveMatches();
      });
    });

    // Filtro de Esporte no Ranking de Prognosticadores
    document.querySelectorAll('[data-tipster-sport]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-tipster-sport]').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.tipsterSportFilter = chip.getAttribute('data-tipster-sport');
        renderTipstersRanking();
        renderPredictionsMarketplace();
      });
    });

    // Delegação global de cliques para Odds, Sync Oficial, Cashout, Convites e Compra de Previsões
    document.body.addEventListener('click', async (ev) => {
      const oddBtn = ev.target.closest('[data-bet-match]');
      if (oddBtn) {
        const matchId = oddBtn.getAttribute('data-bet-match');
        const matchLabel = oddBtn.getAttribute('data-bet-label');
        const market = oddBtn.getAttribute('data-bet-market');
        const selection = oddBtn.getAttribute('data-bet-selection');
        const odds = Number(oddBtn.getAttribute('data-bet-odds'));

        const existingIdx = state.betSlip.findIndex((s) => s.matchId === matchId && s.market === market);
        if (existingIdx >= 0) {
          if (state.betSlip[existingIdx].selection === selection) {
            state.betSlip.splice(existingIdx, 1);
          } else {
            state.betSlip[existingIdx] = { matchId, matchLabel, market, selection, odds };
          }
        } else {
          state.betSlip.push({ matchId, matchLabel, market, selection, odds });
        }
        renderLiveMatches();
        renderBetSlip();
        return;
      }

      const removeSlipBtn = ev.target.closest('[data-remove-slip]');
      if (removeSlipBtn) {
        const idx = Number(removeSlipBtn.getAttribute('data-remove-slip'));
        state.betSlip.splice(idx, 1);
        renderLiveMatches();
        renderBetSlip();
        return;
      }

      const syncBtn = ev.target.closest('[data-sync-match]');
      if (syncBtn) {
        const matchId = syncBtn.getAttribute('data-sync-match');
        try {
          const res = await apiRequest(`/api/matches/${matchId}/sync-official`, {
            method: 'POST',
            body: JSON.stringify({ scoringTeam: Math.random() > 0.35 ? 'HOME' : 'AWAY' })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
        return;
      }

      const cashoutBtn = ev.target.closest('[data-cashout-bet]');
      if (cashoutBtn) {
        const betId = cashoutBtn.getAttribute('data-cashout-bet');
        try {
          const res = await apiRequest(`/api/bets/${betId}/cashout`, { method: 'POST' });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
        return;
      }

      const inviteBtn = ev.target.closest('[data-invite-trn]');
      if (inviteBtn) {
        const trnId = inviteBtn.getAttribute('data-invite-trn');
        try {
          const res = await apiRequest(`/api/tournaments/${trnId}/invite`, {
            method: 'POST',
            body: JSON.stringify({
              teamName: 'Red Bull Bragantino',
              invitedEmail: 'inscricao@redbullbragantino.com.br',
              payEntryWithPix: true
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
        return;
      }

      const buyPredBtn = ev.target.closest('[data-buy-prediction]');
      if (buyPredBtn) {
        const predId = buyPredBtn.getAttribute('data-buy-prediction');
        try {
          const res = await apiRequest(`/api/predictions/${predId}/buy`, {
            method: 'POST',
            body: JSON.stringify({ paymentMethod: 'PIX' })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
        return;
      }

      const resolveTicketBtn = ev.target.closest('[data-resolve-ticket]');
      if (resolveTicketBtn) {
        const ticketId = resolveTicketBtn.getAttribute('data-resolve-ticket');
        try {
          const res = await apiRequest(`/api/admin/support/${ticketId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
              resolutionNote: 'Documentação e súmula validadas com sucesso pelo painel administrativo.'
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      }
    });

    // Botões de Stake Rápida no Bilhete
    document.querySelectorAll('.quick-stake-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stakeEl = document.getElementById('betslip-stake-input');
        if (stakeEl) {
          stakeEl.value = btn.getAttribute('data-stake');
          renderBetSlip();
        }
      });
    });

    const stakeInput = document.getElementById('betslip-stake-input');
    if (stakeInput) {
      stakeInput.addEventListener('input', renderBetSlip);
    }

    // Confirmar Aposta (Clique Final do fluxo <= 3 cliques)
    const placeBetBtn = document.getElementById('btn-place-bet-now');
    if (placeBetBtn) {
      placeBetBtn.addEventListener('click', async () => {
        try {
          const stakeAmount = Number(document.getElementById('betslip-stake-input').value || 50);
          const paymentMethod = document.getElementById('betslip-payment-method').value;
          const res = await apiRequest('/api/bets', {
            method: 'POST',
            body: JSON.stringify({
              selections: state.betSlip,
              stakeAmount,
              paymentMethod
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Cálculo dinâmico de premiação ao alterar vagas ou valor de inscrição
    ['trn-max-teams', 'trn-entry-fee'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderPrizePreview);
    });

    // Criar Campeonato
    const formTrn = document.getElementById('form-create-tournament');
    if (formTrn) {
      formTrn.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/tournaments', {
            method: 'POST',
            body: JSON.stringify({
              federationId: document.getElementById('trn-fed-select').value,
              name: document.getElementById('trn-name-input').value,
              format: document.getElementById('trn-format-select').value,
              maxTeams: Number(document.getElementById('trn-max-teams').value),
              entryFee: Number(document.getElementById('trn-entry-fee').value),
              tiebreakerRules: document.getElementById('trn-tiebreaker-select').value.split(','),
              inviteEmails: document.getElementById('trn-invite-emails').value
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Cadastrar Federação
    const formFed = document.getElementById('form-create-federation');
    if (formFed) {
      formFed.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/federations', {
            method: 'POST',
            body: JSON.stringify({
              acronym: document.getElementById('fed-acronym-input').value,
              name: document.getElementById('fed-name-input').value,
              sport: document.getElementById('fed-sport-select').value
            })
          });
          formFed.reset();
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Cadastrar Time
    const formTeam = document.getElementById('form-create-team');
    if (formTeam) {
      formTeam.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const starPlayer = document.getElementById('team-star-player-input').value || 'Craque Camisa 10';
          const res = await apiRequest('/api/teams', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('team-name-input').value,
              shortName: document.getElementById('team-short-input').value,
              stadium: document.getElementById('team-stadium-input').value,
              coachName: document.getElementById('team-coach-input').value || 'Treinador Titular',
              roster: [
                { number: 1, name: 'Goleiro Titular', position: 'Goleiro', age: 27, rating: 83, goals: 0, assists: 0 },
                { number: 10, name: starPlayer, position: 'Meia-Atacante', age: 26, rating: 87, goals: 12, assists: 11 },
                { number: 9, name: 'Centroavante Oficial', position: 'Atacante', age: 25, rating: 85, goals: 15, assists: 4 }
              ]
            })
          });
          formTeam.reset();
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Publicar Previsão Esportiva
    const formPred = document.getElementById('form-publish-prediction');
    if (formPred) {
      formPred.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/predictions', {
            method: 'POST',
            body: JSON.stringify({
              sport: document.getElementById('pred-sport-select').value,
              matchLabel: document.getElementById('pred-match-input').value,
              selectionLabel: document.getElementById('pred-selection-input').value,
              recommendedOdds: Number(document.getElementById('pred-odds-input').value),
              price: Number(document.getElementById('pred-price-input').value),
              stakeUnits: Number(document.getElementById('pred-units-input').value),
              confidencePct: Number(document.getElementById('pred-confidence-input').value),
              analysisPreview: document.getElementById('pred-preview-input').value,
              analysisFull: document.getElementById('pred-full-textarea').value
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Submeter Verificação KYC
    const formKyc = document.getElementById('form-kyc-verification');
    if (formKyc) {
      formKyc.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/security/kyc/submit', {
            method: 'POST',
            body: JSON.stringify({
              cpf: document.getElementById('kyc-cpf-input').value,
              docType: document.getElementById('kyc-doc-type').value,
              docNumber: document.getElementById('kyc-doc-number').value,
              residenceProofFile: document.getElementById('kyc-residence-input').value
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Copiar código TOTP atual e validar MFA
    const copyTotpBtn = document.getElementById('btn-copy-totp-code');
    if (copyTotpBtn) {
      copyTotpBtn.addEventListener('click', () => {
        const codeInput = document.getElementById('mfa-code-input');
        if (codeInput && state.currentUser?.totpCurrentDemoCode) {
          codeInput.value = state.currentUser.totpCurrentDemoCode;
        }
      });
    }

    const formMfa = document.getElementById('form-mfa-verify');
    if (formMfa) {
      formMfa.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/security/mfa/verify', {
            method: 'POST',
            body: JSON.stringify({
              method: document.getElementById('mfa-method-select').value,
              code: document.getElementById('mfa-code-input').value
            })
          });
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Jogo Responsável e Portabilidade LGPD
    const formRg = document.getElementById('form-responsible-gaming');
    if (formRg) {
      formRg.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/security/responsible-gaming', {
            method: 'POST',
            body: JSON.stringify({
              dailyDepositLimit: Number(document.getElementById('rg-daily-limit').value),
              monthlyDepositLimit: Number(document.getElementById('rg-monthly-limit').value)
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    const btnLgpd = document.getElementById('btn-export-lgpd');
    if (btnLgpd) {
      btnLgpd.addEventListener('click', async () => {
        try {
          const data = await apiRequest('/api/security/lgpd/export');
          const pre = document.getElementById('lgpd-export-preview');
          if (pre) {
            pre.style.display = 'block';
            pre.textContent = JSON.stringify(data, null, 2);
          }
          showSnackbar('Relatório de Portabilidade LGPD (Art. 18) descriptografado pelo titular.');
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Preferências de Notificação
    const formNotifPrefs = document.getElementById('form-notif-preferences');
    if (formNotifPrefs) {
      formNotifPrefs.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/notifications/preferences', {
            method: 'PUT',
            body: JSON.stringify({
              channels: {
                inApp: document.getElementById('pref-ch-inapp').checked,
                push: document.getElementById('pref-ch-push').checked,
                email: document.getElementById('pref-ch-email').checked
              },
              categories: {
                matches: document.getElementById('pref-cat-matches').checked,
                bets: document.getElementById('pref-cat-bets').checked,
                payments: document.getElementById('pref-cat-payments').checked,
                tournaments: document.getElementById('pref-cat-tournaments').checked
              }
            })
          });
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Admin: Reconciliação Bancária SPI/PIX e Rotação de Chave HSM
    const btnReconcile = document.getElementById('btn-admin-reconcile');
    if (btnReconcile) {
      btnReconcile.addEventListener('click', async () => {
        try {
          const res = await apiRequest('/api/admin/finance/reconcile', { method: 'POST' });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    const btnRotateHsm = document.getElementById('btn-admin-rotate-hsm');
    if (btnRotateHsm) {
      btnRotateHsm.addEventListener('click', async () => {
        try {
          const res = await apiRequest('/api/admin/hsm/rotate', { method: 'POST' });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    const formDisc = document.getElementById('form-admin-disciplinary');
    if (formDisc) {
      formDisc.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await apiRequest('/api/admin/disciplinary', {
            method: 'POST',
            body: JSON.stringify({
              targetName: document.getElementById('disc-target-name').value,
              actionType: document.getElementById('disc-action-type').value,
              reason: document.getElementById('disc-reason-input').value
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Modal PIX Instantâneo
    const pixBackdrop = document.getElementById('modal-pix-backdrop');
    const openPixBtn = document.getElementById('btn-open-pix-modal');
    const closePixBtn = document.getElementById('btn-close-pix-modal');
    const genPixBtn = document.getElementById('btn-generate-pix-code');
    const confirmPixBtn = document.getElementById('btn-confirm-pix-deposit');

    if (openPixBtn && pixBackdrop) {
      openPixBtn.addEventListener('click', async () => {
        pixBackdrop.classList.add('open');
        await refreshPixModalQr();
      });
    }
    if (closePixBtn && pixBackdrop) {
      closePixBtn.addEventListener('click', () => pixBackdrop.classList.remove('open'));
    }
    if (genPixBtn) {
      genPixBtn.addEventListener('click', refreshPixModalQr);
    }
    if (confirmPixBtn) {
      confirmPixBtn.addEventListener('click', async () => {
        try {
          const amount = Number(document.getElementById('pix-modal-amount').value || 250);
          const method = document.getElementById('pix-modal-method').value || 'PIX';
          const res = await apiRequest('/api/payments/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount, method })
          });
          pixBackdrop.classList.remove('open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(
            `Depósito de ${formatBRL(res.amount)} via ${res.method} confirmado e gravado no Ledger SHA-256!`
          );
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Modal Notificações
    const notifBackdrop = document.getElementById('modal-notif-backdrop');
    const openNotifBtn = document.getElementById('btn-open-notifications');
    const closeNotifBtn = document.getElementById('btn-close-notif-modal');
    const markReadBtn = document.getElementById('btn-mark-all-notifs-read');

    if (openNotifBtn && notifBackdrop) {
      openNotifBtn.addEventListener('click', () => notifBackdrop.classList.add('open'));
    }
    if (closeNotifBtn && notifBackdrop) {
      closeNotifBtn.addEventListener('click', () => notifBackdrop.classList.remove('open'));
    }
    if (markReadBtn) {
      markReadBtn.addEventListener('click', async () => {
        await apiRequest('/api/notifications/mark-read', { method: 'POST' });
        await loadBootstrap(state.currentUser?.id);
        showSnackbar('Notificações marcadas como lidas.');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    attachEvents();
    await loadBootstrap();
    connectLiveStream();
  });
})();
