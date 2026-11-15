'use strict';

const { hsm } = require('../security/hsmCrypto');
const { recordFinancialTransaction, calculateTournamentPrizePool } = require('./database');

function seedDatabaseIfNeeded(db) {
  const existingUsers = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existingUsers && existingUsers.c > 0) {
    return;
  }

  const now = new Date().toISOString();
  const defaultNotifPrefs = JSON.stringify({
    channels: { email: true, push: true, inApp: true },
    categories: {
      matches: true,
      bets: true,
      payments: true,
      tournaments: true,
      admin: true
    }
  });
  const defaultLgpdConsent = JSON.stringify({
    termsAccepted: true,
    lgpdPrivacyPolicyVersion: '2026.2-BR',
    financialAuditRetentionConsent: true,
    marketingOptIn: false,
    consentedAt: now
  });

  const totpSecretMain = 'JBSWY3DPEHPK3PXP2026CAMP';
  const encryptedTotp = hsm.encryptSensitiveData(totpSecretMain, 'campeonei-mfa');

  const users = [
    {
      id: 'usr-admin-01',
      name: 'Lucas Fortunato (Super Admin)',
      email: 'admin@campeonei.com.br',
      role: 'super_admin',
      cpf: '52998224725',
      phone: '+5511998887766',
      pixKey: 'admin@campeonei.com.br',
      kycStatus: 'VERIFIED',
      mfaEnabled: 1,
      walletBalance: 14850.0,
      insiderRestricted: 0
    },
    {
      id: 'usr-mod-01',
      name: 'Marina Costa (Moderadora de Ligas)',
      email: 'moderacao@campeonei.com.br',
      role: 'moderator',
      cpf: '11144477735',
      phone: '+5511988776655',
      pixKey: 'marina.mod@campeonei.com.br',
      kycStatus: 'VERIFIED',
      mfaEnabled: 1,
      walletBalance: 3200.0,
      insiderRestricted: 0
    },
    {
      id: 'usr-fin-01',
      name: 'Roberto Almeida (Analista Financeiro PLD)',
      email: 'financeiro@campeonei.com.br',
      role: 'financial_analyst',
      cpf: '12345678909',
      phone: '+5511977665544',
      pixKey: 'roberto.fin@campeonei.com.br',
      kycStatus: 'VERIFIED',
      mfaEnabled: 1,
      walletBalance: 5400.0,
      insiderRestricted: 0
    },
    {
      id: 'usr-pro-01',
      name: 'Rafael Mendonça (Tipster & Organizador)',
      email: 'rafael@campeonei.com.br',
      role: 'user',
      cpf: '98765432100',
      phone: '+5521996655443',
      pixKey: 'rafael.tips@campeonei.com.br',
      kycStatus: 'VERIFIED',
      mfaEnabled: 1,
      walletBalance: 4250.0,
      insiderRestricted: 0
    },
    {
      id: 'usr-pending-kyc',
      name: 'Carlos Eduardo (KYC Pendente)',
      email: 'carlos.pendente@campeonei.com.br',
      role: 'user',
      cpf: '70548445052',
      phone: '+5531988112233',
      pixKey: 'carlos@email.com.br',
      kycStatus: 'PENDING',
      mfaEnabled: 1,
      walletBalance: 0.0,
      insiderRestricted: 0
    },
    {
      id: 'usr-insider-01',
      name: 'Gabriel Silva (Atleta Federado CBF - Impedido)',
      email: 'atleta.cbf@campeonei.com.br',
      role: 'user',
      cpf: '28625587087',
      phone: '+5511955443322',
      pixKey: 'gabriel@atleta.com.br',
      kycStatus: 'VERIFIED',
      mfaEnabled: 1,
      walletBalance: 1000.0,
      insiderRestricted: 1
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, cpf_masked, cpf_encrypted_hsm,
      phone_encrypted_hsm, pix_key_encrypted_hsm, kyc_status, kyc_doc_type,
      kyc_doc_encrypted_hsm, kyc_residence_proof, kyc_verified_at,
      mfa_enabled, mfa_methods_json, mfa_totp_secret_encrypted,
      wallet_balance, daily_deposit_limit, monthly_deposit_limit,
      account_status, insider_restricted, avg_stake, std_stake,
      notif_prefs_json, lgpd_consent_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultPassHash = hsm.hashPassword('Campeonei@2026!');

  for (const u of users) {
    insertUser.run(
      u.id,
      u.name,
      u.email,
      defaultPassHash,
      u.role,
      hsm.maskCPF(u.cpf),
      hsm.encryptSensitiveData(u.cpf, 'campeonei-pii'),
      hsm.encryptSensitiveData(u.phone, 'campeonei-pii'),
      hsm.encryptSensitiveData(u.pixKey, 'campeonei-pii'),
      u.kycStatus,
      'CNH_DIGITAL_ICP_BRASIL',
      hsm.encryptSensitiveData(`DOC-${u.cpf}-SP`, 'campeonei-kyc'),
      u.kycStatus === 'VERIFIED' ? 'comprovante-residencia-enel-2026-verificado.pdf' : null,
      u.kycStatus === 'VERIFIED' ? now : null,
      u.mfaEnabled,
      JSON.stringify(['TOTP', 'EMAIL', 'SMS']),
      encryptedTotp,
      u.walletBalance,
      5000,
      25000,
      'ACTIVE',
      u.insiderRestricted,
      120,
      75,
      defaultNotifPrefs,
      defaultLgpdConsent,
      now
    );
  }

  // 2. Federações Esportivas
  const federations = [
    {
      id: 'fed-cbf',
      acronym: 'CBF',
      name: 'Confederação Brasileira de Futebol',
      sport: 'Futebol',
      country: 'Brasil',
      state: 'Nacional (RJ)',
      president_name: 'Ednaldo Rodrigues / Diretoria Técnica',
      official_website: 'https://www.cbf.com.br',
      official_feed_provider: 'CBF Opta / Sportradar Official Feed v4',
      verified_badge: 1,
      logo_color: '#006C4C'
    },
    {
      id: 'fed-fpf',
      acronym: 'FPF',
      name: 'Federação Paulista de Futebol & Ligas Regionais',
      sport: 'Futebol',
      country: 'Brasil',
      state: 'SP',
      president_name: 'Reinaldo Carneiro Bastos',
      official_website: 'https://futebolpaulista.com.br',
      official_feed_provider: 'FPF Live Data API',
      verified_badge: 1,
      logo_color: '#1E5631'
    },
    {
      id: 'fed-lnb',
      acronym: 'LNB',
      name: 'Liga Nacional de Basquete (NBB)',
      sport: 'Basquete',
      country: 'Brasil',
      state: 'Nacional (SP)',
      president_name: 'Rodrigo Franco Montoro',
      official_website: 'https://lnb.com.br',
      official_feed_provider: 'FIBA Genius Sports LiveStats',
      verified_badge: 1,
      logo_color: '#B4690E'
    },
    {
      id: 'fed-cbv',
      acronym: 'CBV',
      name: 'Confederação Brasileira de Voleibol (Superliga)',
      sport: 'Vôlei',
      country: 'Brasil',
      state: 'Nacional (RJ)',
      president_name: 'Radamés Lattari',
      official_website: 'https://cbv.com.br',
      official_feed_provider: 'CBV DataVolley Real-Time',
      verified_badge: 1,
      logo_color: '#0F52BA'
    }
  ];

  const insertFed = db.prepare(`
    INSERT INTO federations (
      id, acronym, name, sport, country, state, president_name,
      official_website, official_feed_provider, verified_badge, logo_color, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of federations) {
    insertFed.run(
      f.id,
      f.acronym,
      f.name,
      f.sport,
      f.country,
      f.state,
      f.president_name,
      f.official_website,
      f.official_feed_provider,
      f.verified_badge,
      f.logo_color,
      'usr-admin-01',
      now
    );
  }

  // 3. Times com Elenco Completo, Estatísticas e Histórico
  const teams = [
    {
      id: 'team-pal',
      federation_id: 'fed-cbf',
      name: 'SE Palmeiras',
      short_name: 'PAL',
      sport: 'Futebol',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 1914,
      stadium: 'Allianz Parque',
      coach_name: 'Abel Ferreira',
      primary_color: '#006437',
      secondary_color: '#FFFFFF',
      elo_rating: 1910,
      roster: [
        { number: 21, name: 'Weverton', position: 'Goleiro', age: 36, rating: 85, goals: 0, assists: 1 },
        { number: 15, name: 'Gustavo Gómez', position: 'Zagueiro', age: 31, rating: 86, goals: 4, assists: 1 },
        { number: 23, name: 'Raphael Veiga', position: 'Meia', age: 29, rating: 88, goals: 14, assists: 11 },
        { number: 41, name: 'Estêvão Willian', position: 'Atacante', age: 19, rating: 89, goals: 16, assists: 12 },
        { number: 9, name: 'Vitor Roque', position: 'Atacante', age: 21, rating: 86, goals: 12, assists: 4 }
      ],
      stats: { played: 32, wins: 21, draws: 7, losses: 4, goalsFor: 58, goalsAgainst: 24, form: ['V', 'V', 'E', 'V', 'V'] },
      history: { nationalTitles: 12, continentalTitles: 3, lastChampionYear: 2025 }
    },
    {
      id: 'team-fla',
      federation_id: 'fed-cbf',
      name: 'CR Flamengo',
      short_name: 'FLA',
      sport: 'Futebol',
      city: 'Rio de Janeiro',
      state: 'RJ',
      founded_year: 1895,
      stadium: 'Maracanã',
      coach_name: 'Filipe Luís',
      primary_color: '#C8102E',
      secondary_color: '#111111',
      elo_rating: 1905,
      roster: [
        { number: 1, name: 'Agustín Rossi', position: 'Goleiro', age: 29, rating: 85, goals: 0, assists: 0 },
        { number: 4, name: 'Léo Pereira', position: 'Zagueiro', age: 28, rating: 84, goals: 3, assists: 1 },
        { number: 8, name: 'Gerson Santos', position: 'Meia', age: 27, rating: 87, goals: 6, assists: 9 },
        { number: 14, name: 'De Arrascaeta', position: 'Meia', age: 30, rating: 89, goals: 11, assists: 14 },
        { number: 9, name: 'Pedro Guilherme', position: 'Atacante', age: 27, rating: 88, goals: 21, assists: 5 }
      ],
      stats: { played: 32, wins: 20, draws: 7, losses: 5, goalsFor: 61, goalsAgainst: 28, form: ['V', 'E', 'V', 'V', 'D'] },
      history: { nationalTitles: 8, continentalTitles: 3, lastChampionYear: 2024 }
    },
    {
      id: 'team-bot',
      federation_id: 'fed-cbf',
      name: 'Botafogo FR',
      short_name: 'BOT',
      sport: 'Futebol',
      city: 'Rio de Janeiro',
      state: 'RJ',
      founded_year: 1904,
      stadium: 'Nilton Santos',
      coach_name: 'Artur Jorge',
      primary_color: '#1C1C1C',
      secondary_color: '#FFFFFF',
      elo_rating: 1890,
      roster: [
        { number: 12, name: 'John Victor', position: 'Goleiro', age: 28, rating: 84, goals: 0, assists: 0 },
        { number: 20, name: 'Alexander Barboza', position: 'Zagueiro', age: 29, rating: 84, goals: 2, assists: 1 },
        { number: 10, name: 'Jefferson Savarino', position: 'Meia', age: 28, rating: 86, goals: 10, assists: 11 },
        { number: 11, name: 'Júnior Santos', position: 'Atacante', age: 30, rating: 85, goals: 13, assists: 4 },
        { number: 99, name: 'Igor Jesus', position: 'Atacante', age: 24, rating: 86, goals: 14, assists: 6 }
      ],
      stats: { played: 32, wins: 19, draws: 8, losses: 5, goalsFor: 54, goalsAgainst: 26, form: ['V', 'V', 'E', 'E', 'V'] },
      history: { nationalTitles: 3, continentalTitles: 1, lastChampionYear: 2024 }
    },
    {
      id: 'team-for',
      federation_id: 'fed-cbf',
      name: 'Fortaleza EC',
      short_name: 'FOR',
      sport: 'Futebol',
      city: 'Fortaleza',
      state: 'CE',
      founded_year: 1918,
      stadium: 'Arena Castelão',
      coach_name: 'Juan Pablo Vojvoda',
      primary_color: '#0038A8',
      secondary_color: '#CE1126',
      elo_rating: 1855,
      roster: [
        { number: 1, name: 'João Ricardo', position: 'Goleiro', age: 35, rating: 83, goals: 0, assists: 0 },
        { number: 19, name: 'Emanuel Brítez', position: 'Zagueiro', age: 32, rating: 81, goals: 1, assists: 2 },
        { number: 88, name: 'Lucas Sasha', position: 'Volante', age: 34, rating: 81, goals: 2, assists: 3 },
        { number: 7, name: 'Tomás Pochettino', position: 'Meia', age: 28, rating: 84, goals: 7, assists: 10 },
        { number: 9, name: 'Juan Martín Lucero', position: 'Atacante', age: 32, rating: 85, goals: 15, assists: 4 }
      ],
      stats: { played: 32, wins: 17, draws: 9, losses: 6, goalsFor: 47, goalsAgainst: 29, form: ['E', 'V', 'V', 'D', 'V'] },
      history: { nationalTitles: 0, regionalTitles: 46, lastChampionYear: 2024 }
    },
    {
      id: 'team-spfc',
      federation_id: 'fed-fpf',
      name: 'São Paulo FC',
      short_name: 'SAO',
      sport: 'Futebol',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 1930,
      stadium: 'MorumBIS',
      coach_name: 'Luis Zubeldía',
      primary_color: '#D50000',
      secondary_color: '#000000',
      elo_rating: 1848,
      roster: [
        { number: 23, name: 'Rafael Pires', position: 'Goleiro', age: 34, rating: 83, goals: 0, assists: 0 },
        { number: 5, name: 'Arboleda', position: 'Zagueiro', age: 32, rating: 84, goals: 3, assists: 0 },
        { number: 7, name: 'Lucas Moura', position: 'Meia-Atacante', age: 32, rating: 87, goals: 12, assists: 9 },
        { number: 10, name: 'Luciano Neves', position: 'Atacante', age: 31, rating: 84, goals: 13, assists: 3 },
        { number: 9, name: 'Jonathan Calleri', position: 'Atacante', age: 31, rating: 85, goals: 14, assists: 5 }
      ],
      stats: { played: 32, wins: 16, draws: 8, losses: 8, goalsFor: 45, goalsAgainst: 30, form: ['V', 'D', 'V', 'E', 'V'] },
      history: { nationalTitles: 6, continentalTitles: 3, worldTitles: 3 }
    },
    {
      id: 'team-cor',
      federation_id: 'fed-fpf',
      name: 'SC Corinthians Paulista',
      short_name: 'COR',
      sport: 'Futebol',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 1910,
      stadium: 'Neo Química Arena',
      coach_name: 'Ramón Díaz',
      primary_color: '#1F1F1F',
      secondary_color: '#C5A059',
      elo_rating: 1840,
      roster: [
        { number: 1, name: 'Hugo Souza', position: 'Goleiro', age: 25, rating: 84, goals: 0, assists: 0 },
        { number: 10, name: 'Rodrigo Garro', position: 'Meia', age: 26, rating: 87, goals: 11, assists: 13 },
        { number: 9, name: 'Yuri Alberto', position: 'Atacante', age: 23, rating: 85, goals: 18, assists: 6 },
        { number: 94, name: 'Memphis Depay', position: 'Atacante', age: 30, rating: 87, goals: 10, assists: 8 }
      ],
      stats: { played: 32, wins: 14, draws: 9, losses: 9, goalsFor: 44, goalsAgainst: 33, form: ['V', 'V', 'V', 'E', 'V'] },
      history: { nationalTitles: 7, continentalTitles: 1, worldTitles: 2 }
    },
    {
      id: 'team-franca',
      federation_id: 'fed-lnb',
      name: 'Sesi Franca Basquete',
      short_name: 'FRA',
      sport: 'Basquete',
      city: 'Franca',
      state: 'SP',
      founded_year: 1959,
      stadium: 'Ginásio Pedrocão',
      coach_name: 'Helinho Garcia',
      primary_color: '#0D3B66',
      secondary_color: '#E63946',
      elo_rating: 1880,
      roster: [
        { number: 14, name: 'Georginho de Paula', position: 'Armador', age: 28, rating: 88, goals: 420, assists: 190 },
        { number: 9, name: 'Lucas Dias', position: 'Ala-Pivô', age: 29, rating: 89, goals: 510, assists: 95 },
        { number: 32, name: 'David Jackson', position: 'Ala-Armador', age: 41, rating: 86, goals: 380, assists: 110 }
      ],
      stats: { played: 24, wins: 21, draws: 0, losses: 3, goalsFor: 2140, goalsAgainst: 1820, form: ['V', 'V', 'V', 'V', 'D'] },
      history: { nationalTitles: 14, continentalTitles: 1, worldTitles: 1 }
    },
    {
      id: 'team-minas',
      federation_id: 'fed-cbv',
      name: 'Itambé Minas Tênis Clube',
      short_name: 'MIN',
      sport: 'Vôlei',
      city: 'Belo Horizonte',
      state: 'MG',
      founded_year: 1935,
      stadium: 'Arena UniBH',
      coach_name: 'Nicola Negro',
      primary_color: '#003366',
      secondary_color: '#FFFFFF',
      elo_rating: 1865,
      roster: [
        { number: 8, name: 'Kisy Nascimento', position: 'Oposta', age: 25, rating: 88, goals: 315, assists: 20 },
        { number: 2, name: 'Carol Gattaz / Thaísa', position: 'Central', age: 37, rating: 89, goals: 260, assists: 18 }
      ],
      stats: { played: 18, wins: 16, draws: 0, losses: 2, goalsFor: 50, goalsAgainst: 14, form: ['V', 'V', 'V', 'V', 'V'] },
      history: { nationalTitles: 6, continentalTitles: 5 }
    }
  ];

  const insertTeam = db.prepare(`
    INSERT INTO teams (
      id, federation_id, name, short_name, sport, city, state, founded_year,
      stadium, coach_name, primary_color, secondary_color,
      roster_json, stats_json, history_json, elo_rating, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of teams) {
    insertTeam.run(
      t.id,
      t.federation_id,
      t.name,
      t.short_name,
      t.sport,
      t.city,
      t.state,
      t.founded_year,
      t.stadium,
      t.coach_name,
      t.primary_color,
      t.secondary_color,
      JSON.stringify(t.roster),
      JSON.stringify(t.stats),
      JSON.stringify(t.history),
      t.elo_rating,
      now
    );
  }

  // 4. Campeonatos (Pontos Corridos, Mata-Mata e Grupos + Mata-Mata)
  const prize1 = calculateTournamentPrizePool({ entryFee: 5000, maxTeams: 20, platformFeePct: 10 });
  const prize2 = calculateTournamentPrizePool({ entryFee: 2500, maxTeams: 16, platformFeePct: 8 });
  const prize3 = calculateTournamentPrizePool({ entryFee: 1500, maxTeams: 12, platformFeePct: 10 });

  const standingsSerieA = [
    { pos: 1, teamId: 'team-pal', teamName: 'SE Palmeiras', short: 'PAL', pts: 70, played: 32, wins: 21, draws: 7, losses: 4, gf: 58, ga: 24, gd: 34, form: ['V', 'V', 'E', 'V', 'V'] },
    { pos: 2, teamId: 'team-fla', teamName: 'CR Flamengo', short: 'FLA', pts: 67, played: 32, wins: 20, draws: 7, losses: 5, gf: 61, ga: 28, gd: 33, form: ['V', 'E', 'V', 'V', 'D'] },
    { pos: 3, teamId: 'team-bot', teamName: 'Botafogo FR', short: 'BOT', pts: 65, played: 32, wins: 19, draws: 8, losses: 5, gf: 54, ga: 26, gd: 28, form: ['V', 'V', 'E', 'E', 'V'] },
    { pos: 4, teamId: 'team-for', teamName: 'Fortaleza EC', short: 'FOR', pts: 60, played: 32, wins: 17, draws: 9, losses: 6, gf: 47, ga: 29, gd: 18, form: ['E', 'V', 'V', 'D', 'V'] },
    { pos: 5, teamId: 'team-spfc', teamName: 'São Paulo FC', short: 'SAO', pts: 56, played: 32, wins: 16, draws: 8, losses: 8, gf: 45, ga: 30, gd: 15, form: ['V', 'D', 'V', 'E', 'V'] },
    { pos: 6, teamId: 'team-cor', teamName: 'SC Corinthians Paulista', short: 'COR', pts: 51, played: 32, wins: 14, draws: 9, losses: 9, gf: 44, ga: 33, gd: 11, form: ['V', 'V', 'V', 'E', 'V'] }
  ];

  const tournaments = [
    {
      id: 'trn-brasileirao-2026',
      federation_id: 'fed-cbf',
      name: 'Campeonato Brasileiro Série A - Elite Campeonei',
      sport: 'Futebol',
      season: '2026',
      format: 'PONTOS_CORRIDOS',
      status: 'IN_PROGRESS',
      max_teams: 20,
      registered_teams_count: 20,
      entry_fee: 5000,
      platform_fee_pct: 10,
      prize: prize1,
      scoring_rules: { win: 3, draw: 1, loss: 0 },
      tiebreaker_rules: ['WINS', 'GOAL_DIFF', 'GOALS_FOR', 'HEAD_TO_HEAD', 'LESS_RED_CARDS', 'LESS_YELLOW_CARDS'],
      official_data_source: 'CBF Opta / Sportradar Real-Time Feed',
      standings: standingsSerieA
    },
    {
      id: 'trn-copa-campeonei-2026',
      federation_id: 'fed-fpf',
      name: 'Copa Campeonei Brasil de Clubes (Mata-Mata)',
      sport: 'Futebol',
      season: '2026',
      format: 'MATA_MATA',
      status: 'IN_PROGRESS',
      max_teams: 16,
      registered_teams_count: 14,
      entry_fee: 2500,
      platform_fee_pct: 8,
      prize: prize2,
      scoring_rules: { win: 3, draw: 1, loss: 0, penaltyShootoutOnTie: true },
      tiebreaker_rules: ['GOAL_DIFF_AGGREGATE', 'PENALTY_SHOOTOUT'],
      official_data_source: 'FPF Live Data API + VAR Sync',
      standings: standingsSerieA.slice(0, 4)
    },
    {
      id: 'trn-supercopa-grupos-2026',
      federation_id: 'fed-lnb',
      name: 'Supercopa Interclubes NBB (Grupos + Playoffs)',
      sport: 'Basquete',
      season: '2026',
      format: 'GRUPOS_MATA_MATA',
      status: 'OPEN_REGISTRATION',
      max_teams: 12,
      registered_teams_count: 8,
      entry_fee: 1500,
      platform_fee_pct: 10,
      prize: prize3,
      scoring_rules: { win: 2, draw: 0, loss: 1 },
      tiebreaker_rules: ['WINS', 'HEAD_TO_HEAD', 'POINTS_AVERAGE'],
      official_data_source: 'FIBA Genius Sports Official Feed',
      standings: [
        { pos: 1, teamId: 'team-franca', teamName: 'Sesi Franca Basquete', short: 'FRA', pts: 45, played: 24, wins: 21, draws: 0, losses: 3, gf: 2140, ga: 1820, gd: 320, form: ['V', 'V', 'V', 'V', 'D'] }
      ]
    }
  ];

  const insertTournament = db.prepare(`
    INSERT INTO tournaments (
      id, federation_id, name, sport, season, format, status,
      max_teams, registered_teams_count, entry_fee, platform_fee_pct,
      prize_pool_gross, prize_pool_net, prize_distribution_json,
      scoring_rules_json, tiebreaker_rules_json, official_data_source,
      standings_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const tr of tournaments) {
    insertTournament.run(
      tr.id,
      tr.federation_id,
      tr.name,
      tr.sport,
      tr.season,
      tr.format,
      tr.status,
      tr.max_teams,
      tr.registered_teams_count,
      tr.entry_fee,
      tr.platform_fee_pct,
      tr.prize.grossPool,
      tr.prize.netPrizePool,
      JSON.stringify(tr.prize),
      JSON.stringify(tr.scoring_rules),
      JSON.stringify(tr.tiebreaker_rules),
      tr.official_data_source,
      JSON.stringify(tr.standings),
      'usr-admin-01',
      now
    );
  }

  // 5. Partidas Ao Vivo e Pré-Jogo com Cotações Multi-Mercado
  const matches = [
    {
      id: 'mch-pal-fla-live',
      tournament_id: 'trn-brasileirao-2026',
      tournament_name: 'Brasileirão Série A - Rodada 33',
      sport: 'Futebol',
      round_name: 'Rodada 33 • Allianz Parque',
      status: 'LIVE',
      minute: 64,
      home_team_id: 'team-pal',
      away_team_id: 'team-fla',
      home_team_name: 'SE Palmeiras',
      away_team_name: 'CR Flamengo',
      home_short: 'PAL',
      away_short: 'FLA',
      home_score: 2,
      away_score: 1,
      official_feed_code: 'CBF-2026-R33-001',
      stats: {
        possessionHome: 53,
        possessionAway: 47,
        shotsOnTargetHome: 7,
        shotsOnTargetAway: 5,
        cornersHome: 6,
        cornersAway: 4,
        yellowCardsHome: 2,
        yellowCardsAway: 3,
        xgHome: 2.14,
        xgAway: 1.42,
        lastEvent: '61\' Gol de Estêvão Willian (SE Palmeiras)'
      },
      odds: {
        matchWinner: { home: 1.58, draw: 3.75, away: 5.80 },
        handicap: {
          homeMinus05: { label: 'Palmeiras -0.5', odds: 1.58 },
          awayPlus05: { label: 'Flamengo +0.5', odds: 2.38 },
          homeMinus15: { label: 'Palmeiras -1.5', odds: 2.75 },
          awayPlus15: { label: 'Flamengo +1.5', odds: 1.44 }
        },
        goalsOverUnder: {
          over35: { label: 'Mais de 3.5 Gols', odds: 1.92 },
          under35: { label: 'Menos de 3.5 Gols', odds: 1.88 },
          over45: { label: 'Mais de 4.5 Gols', odds: 3.40 },
          under45: { label: 'Menos de 4.5 Gols', odds: 1.30 }
        },
        btts: { yes: 1.15, no: 4.90 },
        liveNextGoal: { home: 2.10, none: 2.85, away: 2.65 }
      }
    },
    {
      id: 'mch-bot-for-live',
      tournament_id: 'trn-brasileirao-2026',
      tournament_name: 'Brasileirão Série A - Rodada 33',
      sport: 'Futebol',
      round_name: 'Rodada 33 • Nilton Santos',
      status: 'LIVE',
      minute: 38,
      home_team_id: 'team-bot',
      away_team_id: 'team-for',
      home_team_name: 'Botafogo FR',
      away_team_name: 'Fortaleza EC',
      home_short: 'BOT',
      away_short: 'FOR',
      home_score: 1,
      away_score: 1,
      official_feed_code: 'CBF-2026-R33-002',
      stats: {
        possessionHome: 58,
        possessionAway: 42,
        shotsOnTargetHome: 5,
        shotsOnTargetAway: 3,
        cornersHome: 5,
        cornersAway: 2,
        yellowCardsHome: 1,
        yellowCardsAway: 2,
        xgHome: 1.35,
        xgAway: 0.98,
        lastEvent: '34\' Gol de Lucero (Fortaleza EC) - Contra-ataque'
      },
      odds: {
        matchWinner: { home: 1.95, draw: 3.25, away: 4.10 },
        handicap: {
          homeMinus05: { label: 'Botafogo -0.5', odds: 1.95 },
          awayPlus05: { label: 'Fortaleza +0.5', odds: 1.86 },
          homeMinus15: { label: 'Botafogo -1.5', odds: 3.60 },
          awayPlus15: { label: 'Fortaleza +1.5', odds: 1.28 }
        },
        goalsOverUnder: {
          over25: { label: 'Mais de 2.5 Gols', odds: 1.54 },
          under25: { label: 'Menos de 2.5 Gols', odds: 2.42 },
          over35: { label: 'Mais de 3.5 Gols', odds: 2.45 },
          under35: { label: 'Menos de 3.5 Gols', odds: 1.52 }
        },
        btts: { yes: 1.05, no: 8.50 },
        liveNextGoal: { home: 1.82, none: 3.90, away: 2.95 }
      }
    },
    {
      id: 'mch-spfc-cor-live',
      tournament_id: 'trn-copa-campeonei-2026',
      tournament_name: 'Copa Campeonei Brasil - Semifinal',
      sport: 'Futebol',
      round_name: 'Semifinal Jogo 2 • MorumBIS',
      status: 'LIVE',
      minute: 77,
      home_team_id: 'team-spfc',
      away_team_id: 'team-cor',
      home_team_name: 'São Paulo FC',
      away_team_name: 'SC Corinthians Paulista',
      home_short: 'SAO',
      away_short: 'COR',
      home_score: 1,
      away_score: 0,
      official_feed_code: 'FPF-2026-SF-001',
      stats: {
        possessionHome: 51,
        possessionAway: 49,
        shotsOnTargetHome: 6,
        shotsOnTargetAway: 4,
        cornersHome: 7,
        cornersAway: 5,
        yellowCardsHome: 3,
        yellowCardsAway: 3,
        xgHome: 1.62,
        xgAway: 1.11,
        lastEvent: '52\' Gol de Lucas Moura (São Paulo FC)'
      },
      odds: {
        matchWinner: { home: 1.36, draw: 4.40, away: 9.50 },
        handicap: {
          homeMinus05: { label: 'São Paulo -0.5', odds: 1.36 },
          awayPlus05: { label: 'Corinthians +0.5', odds: 3.05 },
          homeMinus15: { label: 'São Paulo -1.5', odds: 2.90 },
          awayPlus15: { label: 'Corinthians +1.5', odds: 1.40 }
        },
        goalsOverUnder: {
          over15: { label: 'Mais de 1.5 Gols', odds: 1.78 },
          under15: { label: 'Menos de 1.5 Gols', odds: 2.02 },
          over25: { label: 'Mais de 2.5 Gols', odds: 3.85 },
          under25: { label: 'Menos de 2.5 Gols', odds: 1.24 }
        },
        btts: { yes: 2.65, no: 1.45 },
        liveNextGoal: { home: 2.80, none: 2.02, away: 3.10 }
      }
    },
    {
      id: 'mch-franca-nbb-live',
      tournament_id: 'trn-supercopa-grupos-2026',
      tournament_name: 'Supercopa Interclubes NBB',
      sport: 'Basquete',
      round_name: '3º Quarto • Ginásio Pedrocão',
      status: 'LIVE',
      minute: 28,
      home_team_id: 'team-franca',
      away_team_id: 'team-fla',
      home_team_name: 'Sesi Franca Basquete',
      away_team_name: 'Flamengo Basquete',
      home_short: 'FRA',
      away_short: 'FLA',
      home_score: 68,
      away_score: 63,
      official_feed_code: 'LNB-2026-SC-009',
      stats: {
        possessionHome: 54,
        possessionAway: 46,
        shotsOnTargetHome: 26,
        shotsOnTargetAway: 23,
        cornersHome: 9,
        cornersAway: 7,
        yellowCardsHome: 2,
        yellowCardsAway: 3,
        xgHome: 88.5,
        xgAway: 84.0,
        lastEvent: '3Q 02:14 - Cesta de 3 pts de Lucas Dias (Sesi Franca)'
      },
      odds: {
        matchWinner: { home: 1.48, draw: 14.0, away: 2.72 },
        handicap: {
          homeMinus05: { label: 'Sesi Franca -4.5 pts', odds: 1.85 },
          awayPlus05: { label: 'Flamengo +4.5 pts', odds: 1.95 },
          homeMinus15: { label: 'Sesi Franca -8.5 pts', odds: 2.55 },
          awayPlus15: { label: 'Flamengo +8.5 pts', odds: 1.50 }
        },
        goalsOverUnder: {
          over25: { label: 'Mais de 164.5 Pontos', odds: 1.88 },
          under25: { label: 'Menos de 164.5 Pontos', odds: 1.92 },
          over35: { label: 'Mais de 170.5 Pontos', odds: 2.40 },
          under35: { label: 'Menos de 170.5 Pontos', odds: 1.55 }
        },
        btts: { yes: 1.10, no: 6.20 },
        liveNextGoal: { home: 1.75, none: 19.0, away: 2.05 }
      }
    }
  ];

  const insertMatch = db.prepare(`
    INSERT INTO matches (
      id, tournament_id, tournament_name, sport, round_name, status, minute,
      home_team_id, away_team_id, home_team_name, away_team_name,
      home_short, away_short, home_score, away_score,
      stats_json, odds_json, official_feed_code, start_time, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of matches) {
    insertMatch.run(
      m.id,
      m.tournament_id,
      m.tournament_name,
      m.sport,
      m.round_name,
      m.status,
      m.minute,
      m.home_team_id,
      m.away_team_id,
      m.home_team_name,
      m.away_team_name,
      m.home_short,
      m.away_short,
      m.home_score,
      m.away_score,
      JSON.stringify(m.stats),
      JSON.stringify(m.odds),
      m.official_feed_code,
      now,
      now
    );
  }

  // 6. Ranking de Prognosticadores (Tipsters) e Mercado de Previsões Esportivas
  const tipsters = [
    {
      user_id: 'usr-pro-01',
      display_name: 'Rafael Mendonça • QuantBrasileirão',
      specialty_sport: 'Futebol',
      avatar_initials: 'RM',
      verified_pro: 1,
      total_predictions: 142,
      greens: 105,
      reds: 33,
      voids: 4,
      win_rate_pct: 76.1,
      roi_pct: 28.4,
      consistency_score: 94.2,
      profit_units: 64.8,
      recent_streak: ['GREEN', 'GREEN', 'GREEN', 'RED', 'GREEN', 'GREEN', 'GREEN']
    },
    {
      user_id: 'tipster-02',
      display_name: 'Camila Tática • Scout & xG Pro',
      specialty_sport: 'Futebol',
      avatar_initials: 'CT',
      verified_pro: 1,
      total_predictions: 118,
      greens: 84,
      reds: 31,
      voids: 3,
      win_rate_pct: 73.0,
      roi_pct: 24.1,
      consistency_score: 91.5,
      profit_units: 49.2,
      recent_streak: ['GREEN', 'GREEN', 'RED', 'GREEN', 'GREEN', 'GREEN', 'GREEN']
    },
    {
      user_id: 'tipster-03',
      display_name: 'Henrique Hoops • NBB & NBA Analytics',
      specialty_sport: 'Basquete',
      avatar_initials: 'HH',
      verified_pro: 1,
      total_predictions: 96,
      greens: 69,
      reds: 27,
      voids: 0,
      win_rate_pct: 71.9,
      roi_pct: 21.8,
      consistency_score: 89.7,
      profit_units: 41.5,
      recent_streak: ['GREEN', 'RED', 'GREEN', 'GREEN', 'GREEN', 'RED', 'GREEN']
    },
    {
      user_id: 'tipster-04',
      display_name: 'Beatriz Ace • Superliga Vôlei & Tênis',
      specialty_sport: 'Vôlei',
      avatar_initials: 'BA',
      verified_pro: 1,
      total_predictions: 85,
      greens: 60,
      reds: 24,
      voids: 1,
      win_rate_pct: 71.4,
      roi_pct: 19.6,
      consistency_score: 88.0,
      profit_units: 33.9,
      recent_streak: ['GREEN', 'GREEN', 'GREEN', 'RED', 'GREEN', 'RED', 'GREEN']
    }
  ];

  const insertTipster = db.prepare(`
    INSERT INTO tipster_stats (
      user_id, display_name, specialty_sport, avatar_initials, verified_pro,
      total_predictions, greens, reds, voids, win_rate_pct, roi_pct,
      consistency_score, profit_units, recent_streak_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ts of tipsters) {
    insertTipster.run(
      ts.user_id,
      ts.display_name,
      ts.specialty_sport,
      ts.avatar_initials,
      ts.verified_pro,
      ts.total_predictions,
      ts.greens,
      ts.reds,
      ts.voids,
      ts.win_rate_pct,
      ts.roi_pct,
      ts.consistency_score,
      ts.profit_units,
      JSON.stringify(ts.recent_streak),
      now
    );
  }

  const predictions = [
    {
      id: 'pred-01',
      tipster_id: 'usr-pro-01',
      tipster_name: 'Rafael Mendonça • QuantBrasileirão',
      tipster_badge: 'DIAMOND PRO • ROI +28.4%',
      sport: 'Futebol',
      match_id: 'mch-pal-fla-live',
      match_label: 'SE Palmeiras vs CR Flamengo (Série A)',
      market_type: 'Total de Gols Asiático',
      selection_label: 'Mais de 3.5 Gols na Partida',
      recommended_odds: 1.92,
      confidence_pct: 92,
      stake_units: 3.0,
      price: 29.9,
      analysis_preview: 'Modelo xG aponta 3.56 gols esperados combinados com linha alta do Flamengo no 2º tempo.',
      analysis_full:
        'RELATÓRIO QUANTITATIVO VIP: Com o placar em 2x1 aos 64\', o Flamengo adiantou seus laterais para o último terço, deixando espaço para transições rápidas de Estêvão e Vitor Roque (xG em transição de 0.42 por contra-ataque). A odd justa calculada por simulação Monte Carlo (10.000 iterações) para Over 3.5 gols é @1.68, oferecendo +14.2% de Valor Esperado Positivo (+EV) na cotação atual @1.92. Entrada recomendada: 3 unidades.',
      result_status: 'PENDING',
      sales_count: 48
    },
    {
      id: 'pred-02',
      tipster_id: 'tipster-02',
      tipster_name: 'Camila Tática • Scout & xG Pro',
      tipster_badge: 'ELITE ANALYST • 73.0% WIN',
      sport: 'Futebol',
      match_id: 'mch-bot-for-live',
      match_label: 'Botafogo FR vs Fortaleza EC (Série A)',
      market_type: 'Resultado Final & Handicap',
      selection_label: 'Botafogo -0.5 (Vitória no Tempo Normal)',
      recommended_odds: 1.95,
      confidence_pct: 88,
      stake_units: 2.5,
      price: 19.9,
      analysis_preview: 'Pressão territorial intensa do Botafogo no Nilton Santos (58% posse e 5 escanteios no 1ºT).',
      analysis_full:
        'ANÁLISE TÁTICA COMPLETA: O Botafogo registra média de 2.31 pontos por jogo em casa no sintético do Nilton Santos. Savarino e Igor Jesus estão vencendo 68% dos duelos individuais pelo setor direito defensivo do Fortaleza. Recomendação de 2.5u na vitória simples (@1.95) com proteção de cashout parcial se abrir vantagem até os 75 minutos.',
      result_status: 'PENDING',
      sales_count: 35
    },
    {
      id: 'pred-03',
      tipster_id: 'tipster-03',
      tipster_name: 'Henrique Hoops • NBB & NBA Analytics',
      tipster_badge: 'TOP #1 BASQUETE • ROI +21.8%',
      sport: 'Basquete',
      match_id: 'mch-franca-nbb-live',
      match_label: 'Sesi Franca vs Flamengo Basquete (NBB)',
      market_type: 'Handicap de Pontos',
      selection_label: 'Sesi Franca -4.5 Pontos',
      recommended_odds: 1.85,
      confidence_pct: 90,
      stake_units: 3.0,
      price: 24.9,
      analysis_preview: 'Aproveitamento de 44% nas bolas de perímetro do Franca no Pedrocão e domínio nos rebotes ofensivos.',
      analysis_full:
        'PROGNÓSTICO NBB PRO: O Sesi Franca converteu 11 bolas de 3 pontos até o 3º quarto e mantém diferencial de +9 em rebotes ofensivos com Lucas Dias e Georginho. Nos últimos 14 jogos no Pedrocão, cobriu a linha de -4.5 em 12 oportunidades (85.7%). Entrada de 3 unidades.',
      result_status: 'PENDING',
      sales_count: 29
    },
    {
      id: 'pred-04',
      tipster_id: 'usr-pro-01',
      tipster_name: 'Rafael Mendonça • QuantBrasileirão',
      tipster_badge: 'DIAMOND PRO • ROI +28.4%',
      sport: 'Futebol',
      match_id: 'mch-spfc-cor-live',
      match_label: 'São Paulo FC vs Corinthians (Copa Campeonei)',
      market_type: 'Mercado Gratuito Verificado',
      selection_label: 'Menos de 2.5 Gols na Partida',
      recommended_odds: 1.62,
      confidence_pct: 86,
      stake_units: 2.0,
      price: 0,
      analysis_preview: 'Clássico Majestoso decisivo de semifinal com forte compactação defensiva do São Paulo.',
      analysis_full:
        'PICK PÚBLICA AUDITADA: Com 1x0 no placar na semifinal, o São Paulo baixou suas linhas em bloco médio-baixo (4-4-2 compacto), reduzindo o xG cedido nos últimos 25 minutos para apenas 0.19. Excelente valor no Under 2.5 gols.',
      result_status: 'GREEN',
      sales_count: 112
    },
    {
      id: 'pred-05',
      tipster_id: 'tipster-04',
      tipster_name: 'Beatriz Ace • Superliga Vôlei & Tênis',
      tipster_badge: 'SUPERLIGA SPECIALIST',
      sport: 'Vôlei',
      match_id: 'mch-pal-fla-live',
      match_label: 'Itambé Minas vs Praia Clube (Superliga Feminina)',
      market_type: 'Handicap de Sets',
      selection_label: 'Itambé Minas -1.5 Sets',
      recommended_odds: 1.88,
      confidence_pct: 84,
      stake_units: 2.0,
      price: 14.9,
      analysis_preview: 'Eficiência de bloqueio superior do Minas na Arena UniBH (3.4 pontos de bloqueio por set).',
      analysis_full:
        'ANÁLISE SUPERLIGA: Kisy e Thaísa lideram o índice de eficiência de ataque (54.2%) e bloqueio na competição. Vitória por 3x0 ou 3x1 confirmada no histórico.',
      result_status: 'GREEN',
      sales_count: 41
    },
    {
      id: 'pred-06',
      tipster_id: 'tipster-02',
      tipster_name: 'Camila Tática • Scout & xG Pro',
      tipster_badge: 'ELITE ANALYST • 73.0% WIN',
      sport: 'Futebol',
      match_id: 'mch-bot-for-live',
      match_label: 'Cruzeiro vs Atlético-MG (Rodada 32)',
      market_type: 'Ambas Marcam (BTTS)',
      selection_label: 'Ambas as Equipes Marcam: Sim',
      recommended_odds: 1.98,
      confidence_pct: 78,
      stake_units: 1.5,
      price: 15.0,
      analysis_preview: 'Registro histórico transparente de prognóstico encerrado em 0x0 (Red contabilizado no ROI).',
      analysis_full:
        'TRANSPARÊNCIA CAMPEONEI: Esta previsão foi encerrada como RED (0x0 no clássico) e permanece 100% visível e imutável no histórico público da prognosticadora para auditoria dos compradores.',
      result_status: 'RED',
      sales_count: 22
    }
  ];

  const insertPrediction = db.prepare(`
    INSERT INTO predictions (
      id, tipster_id, tipster_name, tipster_badge, sport, match_id, match_label,
      market_type, selection_label, recommended_odds, confidence_pct, stake_units,
      price, analysis_preview, analysis_full_encrypted_hsm, result_status, sales_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of predictions) {
    insertPrediction.run(
      p.id,
      p.tipster_id,
      p.tipster_name,
      p.tipster_badge,
      p.sport,
      p.match_id,
      p.match_label,
      p.market_type,
      p.selection_label,
      p.recommended_odds,
      p.confidence_pct,
      p.stake_units,
      p.price,
      p.analysis_preview,
      hsm.encryptSensitiveData(p.analysis_full, 'campeonei-prediction'),
      p.result_status,
      p.sales_count,
      now
    );
  }

  // 7. Transações Iniciais e Ledger Imutável SHA-256
  const pixSeed1 = hsm.generatePixBrCode({
    amount: 5000,
    txid: 'CAMPEONEIPIXSEED01',
    description: 'INSCRICAO SERIE A PAL'
  });
  recordFinancialTransaction(db, {
    txId: 'TX-PIX-2026-0001',
    userId: 'usr-admin-01',
    type: 'TOURNAMENT_ENTRY',
    method: 'PIX',
    amount: 5000.0,
    fee: 0,
    balanceAfter: 14850.0,
    referenceId: 'trn-brasileirao-2026',
    description: 'Pagamento de Inscrição PIX - Campeonato Brasileiro Série A (SE Palmeiras)',
    institutionName: 'Banco Central do Brasil (SPI / Itaú Unibanco)',
    pixMeta: pixSeed1
  });

  const pixSeed2 = hsm.generatePixBrCode({
    amount: 1500,
    txid: 'CAMPEONEIPIXSEED02',
    description: 'DEPOSITO PIX CARTEIRA'
  });
  recordFinancialTransaction(db, {
    txId: 'TX-PIX-2026-0002',
    userId: 'usr-pro-01',
    type: 'DEPOSIT_PIX',
    method: 'PIX',
    amount: 1500.0,
    fee: 0,
    balanceAfter: 4250.0,
    referenceId: 'WALLET-DEP-01',
    description: 'Depósito Instantâneo via PIX (Confirmação SPI 1.1s)',
    institutionName: 'Banco Central do Brasil (SPI / Nu Pagamentos)',
    pixMeta: pixSeed2
  });

  // 8. Aposta Inicial Exemplo
  db.prepare(`
    INSERT INTO bets (
      id, user_id, bet_type, selections_json, combined_odds, stake_amount,
      potential_return, payment_method, status, cashout_value,
      ml_risk_score, ml_risk_level, ml_reasons_json, tx_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'BET-2026-1001',
    'usr-admin-01',
    'SINGLE',
    JSON.stringify([
      {
        matchId: 'mch-pal-fla-live',
        matchLabel: 'SE Palmeiras vs CR Flamengo',
        market: 'Resultado Final (1X2)',
        selection: 'SE Palmeiras',
        odds: 1.58
      }
    ]),
    1.58,
    200.0,
    316.0,
    'PIX',
    'OPEN',
    248.5,
    8,
    'LOW',
    JSON.stringify(['Padrão comportamental dentro da normalidade estatística.']),
    'TX-PIX-2026-0001',
    now
  );

  // 9. Notificações Iniciais
  const notifications = [
    {
      id: 'ntf-01',
      user_id: 'usr-admin-01',
      category: 'PAYMENT',
      channels: ['IN_APP', 'EMAIL', 'PUSH'],
      title: 'PIX Confirmado Instantaneamente (SPI BCB)',
      message: 'Transação TX-PIX-2026-0001 de R$ 5.000,00 conciliada com código EndToEndId e gravada no Ledger Imutável SHA-256.'
    },
    {
      id: 'ntf-02',
      user_id: 'usr-admin-01',
      category: 'MATCH',
      channels: ['IN_APP', 'PUSH'],
      title: 'GOL AO VIVO • SE Palmeiras 2 x 1 CR Flamengo (61\')',
      message: 'Atualização via feed oficial CBF Opta: Estêvão Willian marca para o Palmeiras! Cotações Ao Vivo recalibradas.'
    },
    {
      id: 'ntf-03',
      user_id: 'usr-admin-01',
      category: 'TOURNAMENT',
      channels: ['IN_APP', 'EMAIL'],
      title: 'Premiação Automática Calculada • Série A 2026',
      message: 'Fundo líquido de R$ 90.000,00 garantido em custódia: R$ 54.000 (1º), R$ 22.500 (2º), R$ 9.000 (3º) e R$ 4.500 (Artilheiro).'
    },
    {
      id: 'ntf-04',
      user_id: 'usr-admin-01',
      category: 'SECURITY',
      channels: ['IN_APP', 'EMAIL'],
      title: 'Auditoria HSM & Monitoramento ML Ativos',
      message: 'Chave mestra AES-256-GCM ativa no Slot 0 do HSM e motor anti-manipulação Sportradar/ML operando com 0 violações críticas.'
    }
  ];

  const insertNotif = db.prepare(`
    INSERT INTO notifications (
      id, user_id, category, channels_json, title, message, read_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const n of notifications) {
    insertNotif.run(n.id, n.user_id, n.category, JSON.stringify(n.channels), n.title, n.message, 0, now);
  }

  // 10. Ocorrências de Suporte e Medidas Disciplinares para o Painel Administrativo
  db.prepare(`
    INSERT INTO support_tickets (
      id, user_id, user_name, category, priority, subject, description,
      status, assigned_role, resolution_note, resolved_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TCK-2026-01',
    'usr-pending-kyc',
    'Carlos Eduardo',
    'KYC_VERIFICATION',
    'HIGH',
    'Validação de Comprovante de Residência e CNH Digital',
    'Enviei minha CNH Digital ICP-Brasil e conta de energia para liberar depósitos via PIX.',
    'OPEN',
    'moderator',
    null,
    null,
    now,
    now
  );

  db.prepare(`
    INSERT INTO support_tickets (
      id, user_id, user_name, category, priority, subject, description,
      status, assigned_role, resolution_note, resolved_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TCK-2026-02',
    'usr-pro-01',
    'Rafael Mendonça',
    'TOURNAMENT_HOMOLOGATION',
    'MEDIUM',
    'Homologação de súmula eletrônica da Copa Campeonei',
    'Solicito sincronização do critério de desempate por cartões amarelos na rodada semifinal.',
    'RESOLVED',
    'moderator',
    'Súmula sincronizada via API oficial da FPF.',
    'Marina Costa (Moderadora)',
    now,
    now
  );

  db.prepare(`
    INSERT INTO disciplinary_actions (
      id, target_type, target_id, target_name, action_type, reason, applied_by, applied_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'DSC-2026-01',
    'USER',
    'usr-insider-01',
    'Gabriel Silva (Atleta Federado CBF)',
    'INSIDER_BLOCK_LEI_14790',
    'Bloqueio preventivo de apostas conforme Art. 26 da Lei nº 14.790/2023 (vedação a atletas e árbitros inscritos em competições oficiais).',
    'Lucas Fortunato',
    'super_admin',
    now
  );
}

module.exports = { seedDatabaseIfNeeded };
