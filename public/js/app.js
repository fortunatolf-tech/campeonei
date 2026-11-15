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
    searchQuery: '',
    expandedMatchIds: new Set(),
    tipsterSportFilter: 'ALL',
    betSlip: [
      {
        matchId: 'mch-pal-fla-live',
        matchLabel: 'FURIA Esports vs Imperial Esports (CS2)',
        market: 'Vencedor da Série (MD3)',
        selection: 'FURIA Esports',
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
    }, 3600);
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
          renderFeaturedHero();
          renderLiveMatches();
          const latEl = document.getElementById('metric-odds-latency');
          if (latEl) {
            const ms = 9 + Math.floor(Math.random() * 8);
            latEl.textContent = `${ms} ms • Telemetria Ao Vivo`;
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
        renderFeaturedHero();
        renderLiveMatches();
        renderTournaments();
      } catch {
        // Ignora erro
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
    renderFeaturedHero();
    renderLiveMatches();
    renderBetSlip();
    renderUserBets();
    renderFederationOptions();
    renderPrizePreview();
    renderTournaments();
    renderTeamsRoster();
    renderFederationsGrid();
    renderTipstersPodium();
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
    const bigBalanceEl = document.getElementById('wallet-card-big-balance');
    if (bigBalanceEl) bigBalanceEl.textContent = formatBRL(u.walletBalance);

    const kycBadge = document.getElementById('header-kyc-badge');
    if (kycBadge) {
      if (u.insiderRestricted) {
        kycBadge.className = 'md3-badge badge-error';
        kycBadge.textContent = 'PRO-PLAYER IMPEDIDO (ESIC / LEI 14.790)';
      } else if (u.kycStatus === 'VERIFIED') {
        kycBadge.className = 'md3-badge badge-success';
        kycBadge.textContent = `KYC OK • ${u.role.toUpperCase()}`;
      } else {
        kycBadge.className = 'md3-badge badge-warning';
        kycBadge.textContent = 'KYC PENDENTE';
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

    const myBetsPill = document.getElementById('my-bets-count-pill');
    if (myBetsPill) myBetsPill.textContent = String(state.bets.length);
  }

  /* ========================================================================
     HERO MATCH CENTER E-SPORTS & SÉRIES AO VIVO (UX ESCANEÁVEL E PROGRESSIVA)
     ======================================================================== */
  function renderFeaturedHero() {
    const hero = document.getElementById('featured-match-hero');
    if (!hero || !state.matches.length) return;
    const m = state.matches[0];
    const mw = m.odds?.matchWinner || { home: 1.58, draw: 4.8, away: 2.45 };
    const clockLabel = m.sport === 'League of Legends' ? `${m.minute} min` : `Round ${m.minute}`;

    hero.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span class="md3-badge badge-success"><span class="live-dot"></span> SÉRIE DESTAQUE AO VIVO • ${m.sport.toUpperCase()} • ${clockLabel}</span>
          <span style="font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant); font-weight: 600;">
            ${m.tournament_name} • ${m.round_name}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 18px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="team-avatar">${m.home_short}</span>
            <strong style="font-size: 1.25rem;">${m.home_team_name}</strong>
          </div>
          <div class="score-pill tabular-nums">${m.home_score} : ${m.away_score}</div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="font-size: 1.25rem;">${m.away_team_name}</strong>
            <span class="team-avatar">${m.away_short}</span>
          </div>
        </div>

        <div style="font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span>⚡ ${m.stats.lastEvent || 'Série em andamento'}</span>
          <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-sync-match="${m.id}">
            📡 Simular Round / Kill (${m.official_feed_code})
          </button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">
          <span>Domínio ${m.home_short}: <strong>${m.stats.possessionHome}%</strong></span>
          <span>Rating / Adv: <strong>${m.stats.xgHome} x ${m.stats.xgAway}</strong></span>
          <span>Domínio ${m.away_short}: <strong>${m.stats.possessionAway}%</strong></span>
        </div>
        <div class="momentum-bar-track">
          <div class="momentum-bar-home" style="width: ${m.stats.possessionHome}%;"></div>
        </div>
        <div class="odds-grid-3">
          <button type="button" class="odd-button"
            data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
            data-bet-market="Vencedor da Série (MD3)" data-bet-selection="${m.home_team_name}" data-bet-odds="${mw.home}">
            <span class="odd-label">1 • ${m.home_short}</span>
            <span class="odd-value tabular-nums">@${Number(mw.home).toFixed(2)}</span>
          </button>
          <button type="button" class="odd-button"
            data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
            data-bet-market="Total de Mapas" data-bet-selection="3º Mapa Decisivo (Over 2.5)" data-bet-odds="${mw.draw}">
            <span class="odd-label">MD3 • 3 Mapas</span>
            <span class="odd-value tabular-nums">@${Number(mw.draw).toFixed(2)}</span>
          </button>
          <button type="button" class="odd-button"
            data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
            data-bet-market="Vencedor da Série (MD3)" data-bet-selection="${m.away_team_name}" data-bet-odds="${mw.away}">
            <span class="odd-label">2 • ${m.away_short}</span>
            <span class="odd-value tabular-nums">@${Number(mw.away).toFixed(2)}</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderLiveMatches() {
    const container = document.getElementById('live-matches-container');
    if (!container) return;

    const q = state.searchQuery.trim().toLowerCase();
    const filteredMatches = state.matches.filter((m) => {
      if (!q) return true;
      return (
        m.home_team_name.toLowerCase().includes(q) ||
        m.away_team_name.toLowerCase().includes(q) ||
        m.tournament_name.toLowerCase().includes(q) ||
        m.sport.toLowerCase().includes(q)
      );
    });

    if (!filteredMatches.length) {
      container.innerHTML = `<div class="md3-card">Nenhuma série de e-sports encontrada para "${state.searchQuery}".</div>`;
      return;
    }

    container.innerHTML = filteredMatches
      .map((m) => {
        const odds = m.odds || {};
        const mw = odds.matchWinner || { home: 1.8, draw: 4.2, away: 2.2 };
        const hc = odds.handicap || {};
        const ou = odds.goalsOverUnder || {};
        const btts = odds.btts || { yes: 1.75, no: 2.05 };
        const clockLabel = m.sport === 'League of Legends' ? `${m.minute} min` : `R${m.minute}`;

        const isSel = (market, selection) =>
          state.betSlip.some((s) => s.matchId === m.id && s.market === market && s.selection === selection);

        const hcKeys = Object.keys(hc).slice(0, 2);
        const ouKeys = Object.keys(ou).slice(0, 2);
        const isDrawerOpen =
          state.expandedMatchIds.has(m.id) ||
          state.marketView === 'HANDICAP' ||
          state.marketView === 'GOALS';

        return `
          <article class="md3-card" id="match-card-${m.id}">
            <div class="match-card-header">
              <div>
                <strong>${m.tournament_name}</strong> • <span class="md3-badge badge-neutral">${m.sport}</span>
              </div>
              <span class="md3-badge badge-success tabular-nums">
                <span class="live-dot"></span> ${clockLabel}
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

            <div class="momentum-bar-track" title="Controle de Mapa / Economia ${m.stats.possessionHome}% x ${m.stats.possessionAway}%">
              <div class="momentum-bar-home" style="width: ${m.stats.possessionHome}%;"></div>
            </div>

            <!-- Mercado Principal E-Sports (Sempre Visível e Ergonômico >= 48px) -->
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 6px; color: var(--md-sys-color-on-surface-variant);">
                <span>Vencedor da Série (MD3) &amp; Decider</span>
                <span>Domínio ${m.stats.possessionHome}%-${m.stats.possessionAway}% • Entry Kills ${m.stats.shotsOnTargetHome}x${m.stats.shotsOnTargetAway}</span>
              </div>
              <div class="odds-grid-3">
                <button type="button" class="odd-button ${isSel('Vencedor da Série (MD3)', m.home_team_name) ? 'selected' : ''}"
                  data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                  data-bet-market="Vencedor da Série (MD3)" data-bet-selection="${m.home_team_name}" data-bet-odds="${mw.home}">
                  <span class="odd-label">1 • ${m.home_short}</span>
                  <span class="odd-value tabular-nums">@${Number(mw.home).toFixed(2)}</span>
                </button>
                <button type="button" class="odd-button ${isSel('Total de Mapas', '3º Mapa Decisivo (Over 2.5)') ? 'selected' : ''}"
                  data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                  data-bet-market="Total de Mapas" data-bet-selection="3º Mapa Decisivo (Over 2.5)" data-bet-odds="${mw.draw}">
                  <span class="odd-label">MD3 • 3 Mapas</span>
                  <span class="odd-value tabular-nums">@${Number(mw.draw).toFixed(2)}</span>
                </button>
                <button type="button" class="odd-button ${isSel('Vencedor da Série (MD3)', m.away_team_name) ? 'selected' : ''}"
                  data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                  data-bet-market="Vencedor da Série (MD3)" data-bet-selection="${m.away_team_name}" data-bet-odds="${mw.away}">
                  <span class="odd-label">2 • ${m.away_short}</span>
                  <span class="odd-value tabular-nums">@${Number(mw.away).toFixed(2)}</span>
                </button>
              </div>
            </div>

            <!-- Gaveta de Mercados Extras (Progressive Disclosure) -->
            <div class="extra-markets-drawer ${isDrawerOpen ? 'open' : ''}">
              ${
                hcKeys.length
                  ? `
                <div>
                  <div style="font-size: 0.74rem; font-weight: 700; margin-bottom: 5px; color: var(--md-sys-color-on-surface-variant);">
                    Handicap de Mapas &amp; Rounds / Abates
                  </div>
                  <div class="odds-grid-2">
                    ${hcKeys
                      .map((k) => {
                        const item = hc[k];
                        return `
                          <button type="button" class="odd-button ${isSel('Handicap E-Sports', item.label) ? 'selected' : ''}"
                            data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                            data-bet-market="Handicap E-Sports" data-bet-selection="${item.label}" data-bet-odds="${item.odds}">
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
                ouKeys.length
                  ? `
                <div>
                  <div style="font-size: 0.74rem; font-weight: 700; margin-bottom: 5px; color: var(--md-sys-color-on-surface-variant);">
                    Over/Under Rounds, Abates &amp; Ambos Vencem Mapa
                  </div>
                  <div class="odds-grid-3">
                    ${ouKeys
                      .map((k) => {
                        const item = ou[k];
                        return `
                          <button type="button" class="odd-button ${isSel('Totais E-Sports', item.label) ? 'selected' : ''}"
                            data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                            data-bet-market="Totais E-Sports" data-bet-selection="${item.label}" data-bet-odds="${item.odds}">
                            <span class="odd-label">${item.label}</span>
                            <span class="odd-value tabular-nums">@${Number(item.odds).toFixed(2)}</span>
                          </button>
                        `;
                      })
                      .join('')}
                    <button type="button" class="odd-button ${isSel('Ambos Vencem Mapa', 'Ambos Vencem Mapa: Sim') ? 'selected' : ''}"
                      data-bet-match="${m.id}" data-bet-label="${m.home_team_name} vs ${m.away_team_name}"
                      data-bet-market="Ambos Vencem Mapa" data-bet-selection="Ambos Vencem Mapa: Sim" data-bet-odds="${btts.yes}">
                      <span class="odd-label">Ambos Mapa: Sim</span>
                      <span class="odd-value tabular-nums">@${Number(btts.yes).toFixed(2)}</span>
                    </button>
                  </div>
                </div>
              `
                  : ''
              }
            </div>

            <!-- Rodapé Limpo do Card -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid var(--md-sys-color-outline-variant);">
              <button type="button" class="md3-btn md3-btn-outlined md3-btn-sm" data-toggle-markets="${m.id}">
                ${isDrawerOpen ? '▲ Ocultar Mercados Extras' : '▼ +5 Mercados (Mapas & Rounds)'}
              </button>
              <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-sync-match="${m.id}">
                🎮 Simular Round / Kill
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
    const topSlipCount = document.getElementById('top-slip-count');
    const totalOddsEl = document.getElementById('betslip-total-odds');
    const potReturnEl = document.getElementById('betslip-potential-return');
    const stakeInput = document.getElementById('betslip-stake-input');

    const count = state.betSlip.length;
    if (countBadge) {
      countBadge.textContent = count === 0 ? 'Vazio' : count === 1 ? 'Simples (1)' : `Múltipla (${count})`;
    }
    if (topSlipCount) topSlipCount.textContent = String(count);

    if (container) {
      if (count === 0) {
        container.innerHTML = `
          <div class="md3-card-filled" style="text-align: center; font-size: 0.83rem; color: var(--md-sys-color-on-surface-variant);">
            Clique em qualquer cotação (<strong>@Odd</strong>) nas partidas para adicionar ao bilhete.
          </div>
        `;
      } else {
        container.innerHTML = state.betSlip
          .map(
            (item, idx) => `
            <div class="betslip-selection-item">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 0.88rem;">${item.selection}</strong>
                <span class="odd-value tabular-nums">@${Number(item.odds).toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">
                <span>${item.market} • ${item.matchLabel}</span>
                <button type="button" class="md3-btn md3-btn-outlined md3-btn-sm" style="min-height: 26px; padding: 0 8px;" data-remove-slip="${idx}">
                  ✕
                </button>
              </div>
            </div>
          `
          )
          .join('');
      }
    }

    const combinedOdds =
      count > 0 ? state.betSlip.reduce((acc, s) => acc * Number(s.odds), 1.0) : 0;
    const stake = Number(stakeInput ? stakeInput.value : 50);
    const potential = combinedOdds * stake;

    if (totalOddsEl) totalOddsEl.textContent = `@${combinedOdds.toFixed(2)}`;
    if (potReturnEl) potReturnEl.textContent = formatBRL(potential);

    // Atualiza barra flutuante Mobile/Tablet
    const fabCount = document.getElementById('mobile-fab-count');
    const fabOdds = document.getElementById('mobile-fab-odds');
    const fabReturn = document.getElementById('mobile-fab-return');
    if (fabCount) fabCount.textContent = String(count);
    if (fabOdds) fabOdds.textContent = `@${combinedOdds.toFixed(2)}`;
    if (fabReturn) fabReturn.textContent = formatBRL(potential);
  }

  function renderUserBets() {
    const wrap = document.getElementById('user-bets-list');
    if (!wrap) return;
    if (!state.bets.length) {
      wrap.innerHTML = `<div style="padding: 18px; font-size: 0.86rem;">Nenhuma aposta registrada ainda.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="md3-table">
        <thead>
          <tr>
            <th>Bilhete</th>
            <th>Seleções</th>
            <th>Odd Total</th>
            <th>Valor</th>
            <th>Retorno Potencial</th>
            <th>Integridade ML</th>
            <th>Ação / Status</th>
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
                  <td class="tabular-nums" style="color: var(--md-sys-color-primary); font-weight: 800;">
                    ${formatBRL(b.potential_return)}
                  </td>
                  <td>
                    <span class="md3-badge ${b.ml_risk_level === 'LOW' ? 'badge-success' : 'badge-warning'}">
                      Score ${b.ml_risk_score}/100
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
     ABA 2: CAMPEONATOS, CLUBES E FEDERAÇÕES
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
    const net = gross * 0.9;

    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="font-size: 0.85rem;">Prize Pool Líquido Automático (90% Custódia PIX):</strong>
        <span class="md3-badge badge-success tabular-nums">${formatBRL(net)}</span>
      </div>
      <div class="md3-grid-4" style="font-size: 0.78rem;">
        <div>🥇 1º (60%): <strong class="tabular-nums">${formatBRL(net * 0.6)}</strong></div>
        <div>🥈 2º (25%): <strong class="tabular-nums">${formatBRL(net * 0.25)}</strong></div>
        <div>🥉 3º (10%): <strong class="tabular-nums">${formatBRL(net * 0.1)}</strong></div>
        <div>🌟 MVP HLTV/VCT (5%): <strong class="tabular-nums">${formatBRL(net * 0.05)}</strong></div>
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
              <td class="tabular-nums"><strong style="color: var(--md-sys-color-primary);">${r.pts}</strong></td>
              <td class="tabular-nums">${r.played}</td>
              <td class="tabular-nums">${r.wins}</td>
              <td class="tabular-nums">${r.draws}</td>
              <td class="tabular-nums">${r.losses}</td>
              <td class="tabular-nums">${r.gf}:${r.ga} (${r.gd >= 0 ? '+' + r.gd : r.gd})</td>
              <td>
                ${(r.form || [])
                  .map(
                    (f) =>
                      `<span class="md3-badge ${f === 'V' ? 'badge-success' : f === 'D' ? 'badge-error' : 'badge-neutral'}" style="padding: 2px 6px; margin-right: 2px;">${f}</span>`
                  )
                  .join('')}
              </td>
            </tr>
          `
          )
          .join('');

        return `
          <div class="md3-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h3 style="margin: 0; font-size: 1.2rem;">${tr.name}</h3>
                  <span class="md3-badge badge-neutral">${tr.sport}</span>
                  <span class="md3-badge badge-success">${tr.format}</span>
                  <span class="md3-badge badge-neutral">${tr.registered_teams_count}/${tr.max_teams} Orgs</span>
                </div>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);">
                  Telemetria Oficial: <strong>${tr.official_data_source}</strong> • Desempate: <strong>${(tr.tiebreakerRules || []).join(' > ')}</strong>
                </p>
              </div>
              <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-invite-trn="${tr.id}">
                ✉️ Convidar Org &amp; Inscrição PIX (${formatBRL(tr.entry_fee)})
              </button>
            </div>

            <div class="md3-grid-4" style="background: var(--md-sys-color-surface-container); padding: 14px; border-radius: 14px; font-size: 0.84rem;">
              <div>Inscrição: <strong class="tabular-nums">${formatBRL(tr.entry_fee)}</strong></div>
              <div>Prize Pool Líquido: <strong class="tabular-nums" style="color: var(--md-sys-color-primary);">${formatBRL(tr.prize_pool_net)}</strong></div>
              <div>🥇 Campeão (60%): <strong class="tabular-nums">${formatBRL(dist.champion1st?.amount || tr.prize_pool_net * 0.6)}</strong></div>
              <div>🥈 Vice (25%): <strong class="tabular-nums">${formatBRL(dist.runnerUp2nd?.amount || tr.prize_pool_net * 0.25)}</strong></div>
            </div>

            <div class="md3-table-wrap">
              <table class="md3-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Organização (Org)</th>
                    <th>PTS</th>
                    <th>Séries</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>Mapas (Saldo)</th>
                    <th>Forma Recente</th>
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
        <div class="md3-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="team-avatar">${t.short_name}</span>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <strong style="font-size: 1.05rem;">${t.name}</strong>
                  <span class="md3-badge badge-neutral">${t.sport}</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                  ${t.city}/${t.state} • ${t.stadium} • Coach: ${t.coach_name}
                </div>
              </div>
            </div>
            <span class="md3-badge badge-success tabular-nums">Rating ${t.elo_rating}</span>
          </div>

          <div style="font-size: 0.8rem; display: flex; gap: 14px; flex-wrap: wrap;">
            <span>🏆 <strong>${t.history.nationalTitles || 0} Títulos Oficiais</strong></span>
            <span>📊 Histórico MD3: <strong>${t.stats.wins}V ${t.stats.losses}D (${t.stats.goalsFor} Mapas Vencidos)</strong></span>
          </div>

          <div class="md3-table-wrap">
            <table class="md3-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pro-Player (Nick &amp; Nome)</th>
                  <th>Role / Função</th>
                  <th>Rating</th>
                  <th>Kills / Assists</th>
                </tr>
              </thead>
              <tbody>
                ${(t.roster || [])
                  .map(
                    (p) => `
                  <tr>
                    <td class="tabular-nums"><strong>${p.number}</strong></td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.position}</td>
                    <td class="tabular-nums"><span class="md3-badge badge-neutral">${p.rating}</span></td>
                    <td class="tabular-nums">${p.goals}K / ${p.assists}A</td>
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

  function renderFederationsGrid() {
    const grid = document.getElementById('federations-cards-grid');
    if (!grid) return;
    grid.innerHTML = state.federations
      .map(
        (f) => `
        <div class="md3-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="team-avatar">${f.acronym}</span>
              <div>
                <strong style="font-size: 1.05rem;">${f.name}</strong>
                <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                  Modalidade: ${f.sport} • Jurisdição: ${f.state}
                </div>
              </div>
            </div>
            <span class="md3-badge badge-success">HOMOLOGADA</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);">
            <div>Diretoria Competitiva: <strong>${f.president_name}</strong></div>
            <div>Integração de Telemetria: <strong class="mono-code">${f.official_feed_provider}</strong></div>
          </div>
        </div>
      `
      )
      .join('');
  }

  /* ========================================================================
     ABA 3: MERCADO DE PREVISÕES ESPORTIVAS & PÓDIO DE PROGNOSTICADORES
     ======================================================================== */
  function renderTipstersPodium() {
    const grid = document.getElementById('tipsters-podium-grid');
    if (!grid) return;

    const filtered =
      state.tipsterSportFilter === 'ALL'
        ? state.tipstersRanking
        : state.tipstersRanking.filter(
            (r) => r.specialty_sport.toLowerCase() === state.tipsterSportFilter.toLowerCase()
          );

    grid.innerHTML = filtered
      .map(
        (r, idx) => `
        <div class="md3-card" style="gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="md3-badge badge-success">#${idx + 1} ${r.specialty_sport}</span>
            <strong class="tabular-nums" style="color: var(--md-sys-color-primary); font-size: 1rem;">
              ROI +${Number(r.roi_pct).toFixed(1)}%
            </strong>
          </div>
          <div style="font-weight: 800; font-size: 0.95rem;">${r.display_name}</div>
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
            <span>Taxa de Acerto: <strong>${Number(r.win_rate_pct).toFixed(1)}%</strong></span>
            <span>Consistência: <strong>${Number(r.consistency_score).toFixed(1)}%</strong></span>
          </div>
          <div class="momentum-bar-track">
            <div class="momentum-bar-home" style="width: ${r.win_rate_pct}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem;">
            <span style="color: var(--md-sys-color-success); font-weight: 700;">${r.greens} GREEN</span>
            <span style="color: var(--md-sys-color-error); font-weight: 700;">${r.reds} RED</span>
            <span class="tabular-nums"><strong>+${Number(r.profit_units).toFixed(1)}u</strong></span>
          </div>
        </div>
      `
      )
      .join('');
  }

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
            <th>Rank</th>
            <th>Prognosticador</th>
            <th>Esporte</th>
            <th>Histórico Público</th>
            <th>Taxa de Acerto</th>
            <th>ROI Auditado</th>
            <th>Consistência</th>
            <th>Unidades</th>
            <th>Sequência Recente</th>
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
                <strong style="color: var(--md-sys-color-success);">${r.greens}W</strong> /
                <strong style="color: var(--md-sys-color-error);">${r.reds}L</strong>
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

            <div style="font-size: 0.92rem;">
              <div style="color: var(--md-sys-color-on-surface-variant); font-size: 0.8rem;">${p.matchLabel} • ${p.marketType}</div>
              <div style="font-weight: 800; font-size: 1.02rem; margin-top: 2px;">
                Entrada: <span style="color: var(--md-sys-color-primary);">${p.selectionLabel} (@${Number(p.recommendedOdds).toFixed(2)})</span>
              </div>
            </div>

            <p style="margin: 0; font-size: 0.84rem; color: var(--md-sys-color-on-surface-variant);">
              ${p.analysisPreview}
            </p>

            ${
              p.isUnlocked
                ? `
              <div class="md3-card-filled" style="border-left: 4px solid var(--md-sys-color-primary); font-size: 0.83rem;">
                <strong>🔓 Relatório Tático Desbloqueado (HSM AES-256-GCM):</strong>
                <div style="margin-top: 4px;">${p.analysisFullUnlocked}</div>
              </div>
            `
                : ''
            }

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--md-sys-color-outline-variant);">
              ${
                !p.isUnlocked
                  ? `
                <div>
                  <span style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">Acesso VIP:</span>
                  <strong class="tabular-nums" style="font-size: 1rem; margin-left: 4px;">${formatBRL(p.price)}</strong>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="md3-btn md3-btn-filled md3-btn-sm" data-buy-prediction="${p.id}">
                    🔓 Comprar com PIX (${formatBRL(p.price)})
                  </button>
                  <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm"
                    data-copy-pick-match="${p.matchId}" data-copy-pick-label="${p.matchLabel}"
                    data-copy-pick-market="${p.marketType}" data-copy-pick-selection="${p.selectionLabel}"
                    data-copy-pick-odds="${p.recommendedOdds}">
                    🎯 Copiar para Bilhete
                  </button>
                </div>
              `
                  : `
                <span style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant);">${p.salesCount} leitores verificados</span>
                <button type="button" class="md3-btn md3-btn-tonal md3-btn-sm"
                  data-copy-pick-match="${p.matchId}" data-copy-pick-label="${p.matchLabel}"
                  data-copy-pick-market="${p.marketType}" data-copy-pick-selection="${p.selectionLabel}"
                  data-copy-pick-odds="${p.recommendedOdds}">
                  🎯 Copiar Entrada para o Bilhete (@${Number(p.recommendedOdds).toFixed(2)})
                </button>
              `
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  /* ========================================================================
     ABA 4 & ABA 5: SEGURANÇA, KYC, MFA E PAINEL ADMINISTRATIVO RBAC
     ======================================================================== */
  function renderSecurityAndKyc() {
    const u = state.currentUser;
    if (!u) return;

    const pill = document.getElementById('security-kyc-status-pill');
    if (pill) {
      pill.className = `md3-badge ${u.kycStatus === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`;
      pill.textContent = u.kycStatus === 'VERIFIED' ? 'VERIFICADO' : 'PENDENTE';
    }

    const totpCodeEl = document.getElementById('mfa-demo-totp-code');
    if (totpCodeEl) {
      totpCodeEl.textContent = u.totpCurrentDemoCode || '000000';
    }
  }

  function renderAdminDashboard() {
    const u = state.currentUser;
    if (!u) return;

    const banner = document.getElementById('admin-rbac-banner');
    if (banner) {
      const hsmStatus = state.adminData.hsmStatus || {};
      banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <strong>Operador Autenticado:</strong> ${u.name}
            <span class="md3-badge badge-success" style="margin-left: 8px;">RBAC: ${u.role.toUpperCase()}</span>
            <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant); margin-top: 4px;">
              Escopos ativos: <span class="mono-code">${(u.permissions || []).join(', ')}</span>
            </div>
          </div>
          <div style="font-size: 0.78rem; text-align: right;">
            <div>Módulo HSM: <strong>${hsmStatus.module || 'CloudHSM FIPS 140-3'}</strong></div>
            <div>Chave DEK Ativa: <span class="mono-code">${hsmStatus.activeKeyId || 'hsm-dek-2026-v1'}</span></div>
          </div>
        </div>
      `;
    }

    const ledgerBadge = document.getElementById('ledger-integrity-badge');
    if (ledgerBadge) {
      ledgerBadge.className = `md3-badge ${state.ledgerIntegrity.valid ? 'badge-success' : 'badge-error'}`;
      ledgerBadge.textContent = state.ledgerIntegrity.valid
        ? `CADEIA SHA-256 100% ÍNTEGRA (${state.ledgerIntegrity.totalBlocks} BLOCOS)`
        : 'VIOLAÇÃO DE INTEGRIDADE DETECTADA';
    }

    const ledgerTable = document.getElementById('admin-ledger-table');
    if (ledgerTable) {
      ledgerTable.innerHTML = `
        <table class="md3-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Transação</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Saldo Pós</th>
              <th>prev_hash</th>
              <th>block_hash SHA-256</th>
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
                <td class="mono-code">${String(b.prev_hash).slice(0, 10)}...</td>
                <td class="mono-code" style="color: var(--md-sys-color-primary);">${String(b.block_hash).slice(0, 12)}...</td>
                <td class="mono-code">✓ ${String(b.hsm_signature).slice(0, 10)}...</td>
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
              <div style="font-size: 0.86rem;">
                <strong>${tk.id} — ${tk.subject}</strong>
                <span class="md3-badge ${tk.status === 'RESOLVED' ? 'badge-success' : 'badge-warning'}">${tk.status}</span>
              </div>
              <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                ${tk.user_name}: ${tk.description}
              </div>
            </div>
            ${
              tk.status !== 'RESOLVED'
                ? `<button type="button" class="md3-btn md3-btn-tonal md3-btn-sm" data-resolve-ticket="${tk.id}">
                     ✓ Resolver
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
            <strong>${d.id} • ${d.action_type}</strong> — <strong>${d.target_name}</strong>: ${d.reason}
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
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
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

  function setupSegmentedButtons(attrName) {
    document.querySelectorAll(`[${attrName}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute(attrName);
        const parentBar = btn.closest('.md3-segmented-bar');
        if (parentBar) {
          parentBar.querySelectorAll('.md3-seg-btn').forEach((b) => b.classList.remove('active'));
        }
        btn.classList.add('active');
        const section = btn.closest('.tab-panel');
        if (section) {
          section.querySelectorAll('.sub-view').forEach((sv) => sv.classList.remove('active'));
          const target = document.getElementById(targetId);
          if (target) target.classList.add('active');
        }
      });
    });
  }

  function attachEvents() {
    const appShell = document.getElementById('app-shell');
    const betslipAside = document.getElementById('betslip-aside');

    // Navegação Principal (Navigation Rail / Bottom Bar)
    document.querySelectorAll('.nav-rail-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        document.querySelectorAll('.nav-rail-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');

        // Nas abas fora de Apostas, recolhe o bilhete lateral por padrão para dar 100% de espaço
        if (appShell) {
          if (targetId === 'tab-betting') {
            appShell.classList.remove('slip-collapsed');
          } else {
            appShell.classList.add('slip-collapsed');
          }
        }
      });
    });

    // Sub-navegações Segmentadas
    setupSegmentedButtons('data-betting-subview');
    setupSegmentedButtons('data-leagues-subview');
    setupSegmentedButtons('data-sec-subview');

    // Busca instantânea de partidas
    const searchInput = document.getElementById('match-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.searchQuery = searchInput.value;
        renderLiveMatches();
      });
    }

    // Alternar visibilidade do Bilhete no Desktop e Mobile
    const toggleSlipDesktop = document.getElementById('btn-toggle-betslip-desktop');
    if (toggleSlipDesktop && appShell) {
      toggleSlipDesktop.addEventListener('click', () => {
        if (window.innerWidth <= 1180 && betslipAside) {
          betslipAside.classList.toggle('mobile-open');
        } else {
          appShell.classList.toggle('slip-collapsed');
        }
      });
    }

    const mobileFab = document.getElementById('mobile-betslip-fab');
    if (mobileFab && betslipAside) {
      mobileFab.addEventListener('click', () => {
        betslipAside.classList.toggle('mobile-open');
      });
    }

    const closeSlipMobile = document.getElementById('btn-close-betslip-mobile');
    if (closeSlipMobile) {
      closeSlipMobile.addEventListener('click', () => {
        if (window.innerWidth <= 1180 && betslipAside) {
          betslipAside.classList.remove('mobile-open');
        } else if (appShell) {
          appShell.classList.add('slip-collapsed');
        }
      });
    }

    // Tema Claro / Escuro
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        showSnackbar(`Tema alterado para modo ${next === 'dark' ? 'Escuro' : 'Claro'}.`);
      });
    }

    // Seletor de Perfil RBAC
    const switcher = document.getElementById('profile-switcher-select');
    if (switcher) {
      switcher.addEventListener('change', async () => {
        await loadBootstrap(switcher.value);
        showSnackbar(`Sessão alternada para ${state.currentUser.name} (${state.currentUser.role}).`);
      });
    }

    // Filtros de Mercado e de Esporte
    document.querySelectorAll('[data-market-view]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-market-view]').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.marketView = chip.getAttribute('data-market-view');
        renderLiveMatches();
      });
    });

    document.querySelectorAll('[data-tipster-sport]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-tipster-sport]').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.tipsterSportFilter = chip.getAttribute('data-tipster-sport');
        renderTipstersPodium();
        renderTipstersRanking();
        renderPredictionsMarketplace();
      });
    });

    // Abertura e fechamento de Modais (Progressive Disclosure)
    const modalTriggers = [
      ['btn-open-modal-tournament', 'modal-tournament-backdrop'],
      ['btn-open-modal-team', 'modal-team-backdrop'],
      ['btn-open-modal-federation', 'modal-federation-backdrop'],
      ['btn-open-modal-prediction', 'modal-prediction-backdrop']
    ];
    modalTriggers.forEach(([btnId, modalId]) => {
      const btn = document.getElementById(btnId);
      const modal = document.getElementById(modalId);
      if (btn && modal) {
        btn.addEventListener('click', () => modal.classList.add('open'));
      }
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.getAttribute('data-close-modal'));
        if (target) target.classList.remove('open');
      });
    });

    // Delegação global de cliques
    document.body.addEventListener('click', async (ev) => {
      // 1. Expandir/Recolher Gaveta de Mercados Extras por Partida
      const toggleMarketsBtn = ev.target.closest('[data-toggle-markets]');
      if (toggleMarketsBtn) {
        const mId = toggleMarketsBtn.getAttribute('data-toggle-markets');
        if (state.expandedMatchIds.has(mId)) {
          state.expandedMatchIds.delete(mId);
        } else {
          state.expandedMatchIds.add(mId);
        }
        renderLiveMatches();
        return;
      }

      // 2. Selecionar Cotação (@Odd)
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

      // 3. Copiar Entrada de um Prognosticador direto para o Bilhete
      const copyPickBtn = ev.target.closest('[data-copy-pick-match]');
      if (copyPickBtn) {
        const matchId = copyPickBtn.getAttribute('data-copy-pick-match');
        const matchLabel = copyPickBtn.getAttribute('data-copy-pick-label');
        const market = copyPickBtn.getAttribute('data-copy-pick-market');
        const selection = copyPickBtn.getAttribute('data-copy-pick-selection');
        const odds = Number(copyPickBtn.getAttribute('data-copy-pick-odds'));

        state.betSlip = [{ matchId, matchLabel, market, selection, odds }];
        renderBetSlip();
        if (appShell) appShell.classList.remove('slip-collapsed');
        if (window.innerWidth <= 1180 && betslipAside) betslipAside.classList.add('mobile-open');
        showSnackbar(`Entrada "${selection} (@${odds.toFixed(2)})" adicionada ao seu Bilhete!`);
        return;
      }

      // 4. Remover item do Bilhete
      const removeSlipBtn = ev.target.closest('[data-remove-slip]');
      if (removeSlipBtn) {
        const idx = Number(removeSlipBtn.getAttribute('data-remove-slip'));
        state.betSlip.splice(idx, 1);
        renderLiveMatches();
        renderBetSlip();
        return;
      }

      // 5. Simular Gol no Feed Oficial
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

      // 6. Cashout Instantâneo
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

      // 7. Convidar Organização (Org) & Inscrição PIX
      const inviteBtn = ev.target.closest('[data-invite-trn]');
      if (inviteBtn) {
        const trnId = inviteBtn.getAttribute('data-invite-trn');
        try {
          const res = await apiRequest(`/api/tournaments/${trnId}/invite`, {
            method: 'POST',
            body: JSON.stringify({
              teamName: 'Legacy Esports',
              invitedEmail: 'competitivo@legacy.gg',
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

      // 8. Comprar e Desbloquear Previsão Esportiva
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

      // 9. Resolver Chamado de Suporte
      const resolveTicketBtn = ev.target.closest('[data-resolve-ticket]');
      if (resolveTicketBtn) {
        const ticketId = resolveTicketBtn.getAttribute('data-resolve-ticket');
        try {
          const res = await apiRequest(`/api/admin/support/${ticketId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
              resolutionNote: 'Documentação e logs de telemetria homologados com sucesso pelo painel administrativo.'
            })
          });
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      }
    });

    // Botões de Stake Rápida
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

    // Confirmar Aposta (<= 3 cliques)
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
          if (betslipAside) betslipAside.classList.remove('mobile-open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // Cálculo dinâmico de premiação
    ['trn-max-teams', 'trn-entry-fee'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderPrizePreview);
    });

    // Submissão dos Modais
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
          document.getElementById('modal-tournament-backdrop')?.classList.remove('open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

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
          document.getElementById('modal-federation-backdrop')?.classList.remove('open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    const formTeam = document.getElementById('form-create-team');
    if (formTeam) {
      formTeam.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const starPlayer = document.getElementById('team-star-player-input').value || 'coldzera (Star IGL)';
          const res = await apiRequest('/api/teams', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('team-name-input').value,
              shortName: document.getElementById('team-short-input').value,
              stadium: document.getElementById('team-stadium-input').value,
              coachName: document.getElementById('team-coach-input').value || 'Head Coach Titular',
              roster: [
                { number: 1, name: starPlayer, position: 'IGL & AWPer', age: 25, rating: 1.21, goals: 460, assists: 135 },
                { number: 2, name: 'Entry Fragger Titular', position: 'Entry / Duelist', age: 21, rating: 1.17, goals: 430, assists: 98 },
                { number: 3, name: 'Rifler / Lurker Oficial', position: 'Rifler / Anchor', age: 22, rating: 1.14, goals: 410, assists: 112 }
              ]
            })
          });
          formTeam.reset();
          document.getElementById('modal-team-backdrop')?.classList.remove('open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

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
          document.getElementById('modal-prediction-backdrop')?.classList.remove('open');
          await loadBootstrap(state.currentUser?.id);
          showSnackbar(res.message);
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

    // KYC, MFA, Jogo Responsável e LGPD
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
            pre.style.display = pre.style.display === 'block' ? 'none' : 'block';
            pre.textContent = JSON.stringify(data, null, 2);
          }
          showSnackbar('Relatório de Portabilidade LGPD (Art. 18) descriptografado pelo titular.');
        } catch (err) {
          showSnackbar(err.message);
        }
      });
    }

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

    // Admin RBAC
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
    const openPixBtns = [
      document.getElementById('btn-open-pix-modal'),
      document.getElementById('btn-wallet-hero-deposit')
    ];
    const closePixBtn = document.getElementById('btn-close-pix-modal');
    const genPixBtn = document.getElementById('btn-generate-pix-code');
    const confirmPixBtn = document.getElementById('btn-confirm-pix-deposit');

    openPixBtns.forEach((b) => {
      if (b && pixBackdrop) {
        b.addEventListener('click', async () => {
          pixBackdrop.classList.add('open');
          await refreshPixModalQr();
        });
      }
    });
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
