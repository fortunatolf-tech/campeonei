'use strict';

const { hsm } = require('../security/hsmCrypto');
const { recordFinancialTransaction, calculateTournamentPrizePool } = require('./database');

function seedDatabaseIfNeeded(db) {
  const existingUsers = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const existingEsportsFeds = db
    .prepare("SELECT COUNT(*) as c FROM federations WHERE sport IN ('CS2', 'Valorant', 'League of Legends')")
    .get();

  // Se já existe banco com os dados de E-Sports, não recria
  if (existingUsers && existingUsers.c > 0 && existingEsportsFeds && existingEsportsFeds.c > 0) {
    return;
  }

  // Se existia um banco legado (futebol), limpa as tabelas de catálogo para aplicar o seed E-Sports First mantendo integridade
  if (existingUsers && existingUsers.c > 0 && (!existingEsportsFeds || existingEsportsFeds.c === 0)) {
    db.exec(`
      DELETE FROM prediction_purchases;
      DELETE FROM predictions;
      DELETE FROM tipster_stats;
      DELETE FROM bets;
      DELETE FROM matches;
      DELETE FROM tournament_invitations;
      DELETE FROM tournaments;
      DELETE FROM teams;
      DELETE FROM federations;
      DELETE FROM notifications;
      DELETE FROM support_tickets;
      DELETE FROM disciplinary_actions;
      DELETE FROM financial_transactions;
      DELETE FROM immutable_ledger;
      DELETE FROM users;
    `);
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
      name: 'Lucas Fortunato (Super Admin • Head of Esports)',
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
      name: 'Marina Costa (Head Marshal & Moderadora de Torneios)',
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
      name: 'Roberto Almeida (Analista Financeiro PLD/PIX)',
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
      name: 'Rafael "QuantCS" Mendonça (Pro Tipster & Analista Esports)',
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
      name: 'Carlos Eduardo (Player Amador • KYC Pendente)',
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
      name: 'Gabriel "kNgV" Silva (Pro Player Inscrito CBCS - Impedido)',
      email: 'proplayer.cbcs@campeonei.com.br',
      role: 'user',
      cpf: '28625587087',
      phone: '+5511955443322',
      pixKey: 'gabriel@proplayer.com.br',
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

  // 2. Federações e Ligas Oficiais de E-Sports
  const federations = [
    {
      id: 'fed-cbf',
      acronym: 'CBGE',
      name: 'Confederação Brasileira de Games e Esports (Circuito Nacional CS2)',
      sport: 'CS2',
      country: 'Brasil',
      state: 'Nacional (SP)',
      president_name: 'Paulo Ribas / Diretoria Competitiva CBGE',
      official_website: 'https://cbge.com.br',
      official_feed_provider: 'Valve CS2 GSI + GRID Esports Telemetry v4',
      verified_badge: 1,
      logo_color: '#00E699'
    },
    {
      id: 'fed-fpf',
      acronym: 'VCT-BR',
      name: 'Riot Games Brasil • VALORANT Challengers & Americas League',
      sport: 'Valorant',
      country: 'Brasil',
      state: 'SP',
      president_name: 'Carlos Antunes (Head of Esports Riot BR)',
      official_website: 'https://valorantesports.com',
      official_feed_provider: 'Riot Games VCT Live Data Feed API',
      verified_badge: 1,
      logo_color: '#FF4655'
    },
    {
      id: 'fed-lnb',
      acronym: 'CBLOL',
      name: 'Liga Brasileira de League of Legends (LTA Sul / Riot Games)',
      sport: 'League of Legends',
      country: 'Brasil',
      state: 'Nacional (SP)',
      president_name: 'Igor Corrêa (Comissão Técnica LTA Sul)',
      official_website: 'https://lolesports.com',
      official_feed_provider: 'Riot LoL Esports Official LiveStats API',
      verified_badge: 1,
      logo_color: '#C89B3C'
    },
    {
      id: 'fed-cbv',
      acronym: 'BR6',
      name: 'Circuito Brasileiro de Rainbow Six Siege & FPS Tático (Ubisoft)',
      sport: 'Rainbow Six',
      country: 'Brasil',
      state: 'Nacional (SP)',
      president_name: 'Leandro Montoya (Diretor R6 Esports Latam)',
      official_website: 'https://r6esports.com.br',
      official_feed_provider: 'Ubisoft R6 Matchmaking & Server Telemetry',
      verified_badge: 1,
      logo_color: '#3B82F6'
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

  // 3. Organizações de E-Sports (Orgs) com Line-up Completo, Roles, Rating e Histórico de Títulos
  const teams = [
    {
      id: 'team-pal',
      federation_id: 'fed-cbf',
      name: 'FURIA Esports',
      short_name: 'FUR',
      sport: 'CS2',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2017,
      stadium: 'Gaming Office SP / Arena CBCS',
      coach_name: 'sidde (Sid Macedo)',
      primary_color: '#00E699',
      secondary_color: '#111111',
      elo_rating: 1945,
      roster: [
        { number: 1, name: 'FalleN (Gabriel Toledo)', position: 'IGL & AWPer', age: 33, rating: 1.14, goals: 412, assists: 145 },
        { number: 2, name: 'KSCERATO (Kaike Cerato)', position: 'Rifler / Lurker', age: 25, rating: 1.24, goals: 528, assists: 112 },
        { number: 3, name: 'yuurih (Yuri Santos)', position: 'Rifler / Entry', age: 25, rating: 1.19, goals: 489, assists: 134 },
        { number: 4, name: 'chelo (Marcelo Cespedes)', position: 'Entry Fragger', age: 26, rating: 1.09, goals: 405, assists: 98 },
        { number: 5, name: 'skullz (Felipe Medeiros)', position: 'Anchor / Support', age: 22, rating: 1.08, goals: 376, assists: 121 }
      ],
      stats: { played: 28, wins: 22, draws: 0, losses: 6, goalsFor: 52, goalsAgainst: 21, form: ['V', 'V', 'V', 'D', 'V'] },
      history: { nationalTitles: 8, continentalTitles: 5, lastChampionYear: 2025 }
    },
    {
      id: 'team-fla',
      federation_id: 'fed-cbf',
      name: 'Imperial Esports',
      short_name: 'IMP',
      sport: 'CS2',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2018,
      stadium: 'Imperial Gaming House SP',
      coach_name: 'zakk (Rafael Fernandes)',
      primary_color: '#10B981',
      secondary_color: '#0B1512',
      elo_rating: 1910,
      roster: [
        { number: 1, name: 'VINI (Vinicius Figueiredo)', position: 'IGL / Rifler', age: 25, rating: 1.09, goals: 398, assists: 140 },
        { number: 2, name: 'HEN1 (Henrique Teles)', position: 'AWPer', age: 29, rating: 1.16, goals: 455, assists: 88 },
        { number: 3, name: 'felps (João Vasconcellos)', position: 'Entry Fragger', age: 27, rating: 1.15, goals: 468, assists: 104 },
        { number: 4, name: 'decenty (Lucas Bacelar)', position: 'Rifler / Lurker', age: 20, rating: 1.13, goals: 430, assists: 92 },
        { number: 5, name: 'noway (Kaiky Santos)', position: 'Rifler', age: 19, rating: 1.12, goals: 419, assists: 96 }
      ],
      stats: { played: 28, wins: 20, draws: 0, losses: 8, goalsFor: 47, goalsAgainst: 25, form: ['V', 'V', 'D', 'V', 'V'] },
      history: { nationalTitles: 6, continentalTitles: 2, lastChampionYear: 2025 }
    },
    {
      id: 'team-bot',
      federation_id: 'fed-fpf',
      name: 'LOUD Valorant',
      short_name: 'LLL',
      sport: 'Valorant',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2019,
      stadium: 'Riot Games Arena SP',
      coach_name: 'peu (Pedro Lopes)',
      primary_color: '#00FF66',
      secondary_color: '#0A0F0D',
      elo_rating: 1935,
      roster: [
        { number: 1, name: 'Less (Felipe Basso)', position: 'Sentinel (Viper/Killjoy)', age: 20, rating: 1.22, goals: 495, assists: 130 },
        { number: 2, name: 'cauanzin (Cauan Pereira)', position: 'Initiator (Sova/Fade)', age: 19, rating: 1.17, goals: 448, assists: 210 },
        { number: 3, name: 'tuyz (Arthur Vieira)', position: 'Controller (Omen/Astra)', age: 21, rating: 1.11, goals: 390, assists: 245 },
        { number: 4, name: 'pANcada (Bryan Luna)', position: 'Controller / Anchor', age: 25, rating: 1.12, goals: 402, assists: 220 },
        { number: 5, name: 'dgzin (Douglas Silva)', position: 'Duelist (Jett/Raze)', age: 23, rating: 1.18, goals: 475, assists: 95 }
      ],
      stats: { played: 24, wins: 19, draws: 0, losses: 5, goalsFor: 42, goalsAgainst: 16, form: ['V', 'V', 'V', 'V', 'D'] },
      history: { nationalTitles: 5, continentalTitles: 2, worldTitles: 1, lastChampionYear: 2025 }
    },
    {
      id: 'team-for',
      federation_id: 'fed-fpf',
      name: 'MIBR Valorant',
      short_name: 'MIBR',
      sport: 'Valorant',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2003,
      stadium: 'MIBR Raposa Facility SP',
      coach_name: 'fRoD (Danny Montaner)',
      primary_color: '#F59E0B',
      secondary_color: '#1E293B',
      elo_rating: 1900,
      roster: [
        { number: 1, name: 'aspas (Erick Santos)', position: 'Duelist (Jett/Neon)', age: 21, rating: 1.29, goals: 560, assists: 108 },
        { number: 2, name: 'nzr (Agustin Ibarra)', position: 'IGL / Initiator', age: 25, rating: 1.10, goals: 385, assists: 230 },
        { number: 3, name: 'artzin (Arthur Araujo)', position: 'Flex / Initiator', age: 21, rating: 1.11, goals: 410, assists: 165 },
        { number: 4, name: 'cortezia (Gabriel Cortez)', position: 'Sentinel (Cypher)', age: 20, rating: 1.09, goals: 395, assists: 140 },
        { number: 5, name: 'xenom (Eduardo Soeiro)', position: 'Controller (Omen)', age: 20, rating: 1.08, goals: 370, assists: 255 }
      ],
      stats: { played: 24, wins: 17, draws: 0, losses: 7, goalsFor: 38, goalsAgainst: 20, form: ['V', 'D', 'V', 'V', 'V'] },
      history: { nationalTitles: 4, continentalTitles: 3, lastChampionYear: 2024 }
    },
    {
      id: 'team-spfc',
      federation_id: 'fed-lnb',
      name: 'paiN Gaming',
      short_name: 'PAIN',
      sport: 'League of Legends',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2010,
      stadium: 'paiN Gaming Complex SP',
      coach_name: 'Xero (Sin Yeong-jin)',
      primary_color: '#EF4444',
      secondary_color: '#111111',
      elo_rating: 1925,
      roster: [
        { number: 1, name: 'Wizer (Choi Ui-seok)', position: 'Top Laner', age: 26, rating: 91, goals: 142, assists: 265 },
        { number: 2, name: 'Cariok (Marcos Oliveira)', position: 'Jungler', age: 24, rating: 90, goals: 118, assists: 340 },
        { number: 3, name: 'dyNquedo (Matheus Rossini)', position: 'Mid Laner', age: 26, rating: 91, goals: 175, assists: 290 },
        { number: 4, name: 'TitaN (Alexandre Lima)', position: 'Bot / ADC', age: 24, rating: 93, goals: 248, assists: 195 },
        { number: 5, name: 'Kuri (Choi Won-yeong)', position: 'Support', age: 24, rating: 89, goals: 34, assists: 460 }
      ],
      stats: { played: 22, wins: 18, draws: 0, losses: 4, goalsFor: 39, goalsAgainst: 14, form: ['V', 'V', 'V', 'V', 'D'] },
      history: { nationalTitles: 4, continentalTitles: 1, lastChampionYear: 2024 }
    },
    {
      id: 'team-cor',
      federation_id: 'fed-lnb',
      name: 'RED Canids Kalunga',
      short_name: 'RED',
      sport: 'League of Legends',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2016,
      stadium: 'RED Gaming House SP',
      coach_name: 'Coelho (Ramide Coelho)',
      primary_color: '#DC2626',
      secondary_color: '#FFFFFF',
      elo_rating: 1885,
      roster: [
        { number: 1, name: 'fNb (Francisco Natanael)', position: 'Top Laner', age: 23, rating: 89, goals: 129, assists: 240 },
        { number: 2, name: 'Aegis (Gabriel Lemos)', position: 'Jungler', age: 25, rating: 91, goals: 135, assists: 325 },
        { number: 3, name: 'Grevthar (Daniel Xavier)', position: 'Mid Laner', age: 25, rating: 88, goals: 140, assists: 280 },
        { number: 4, name: 'Brance (Diego Amaral)', position: 'Bot / ADC', age: 21, rating: 92, goals: 232, assists: 185 },
        { number: 5, name: 'Frosty (José Eduardo)', position: 'Support', age: 22, rating: 88, goals: 28, assists: 415 }
      ],
      stats: { played: 22, wins: 15, draws: 0, losses: 7, goalsFor: 34, goalsAgainst: 19, form: ['V', 'V', 'D', 'V', 'V'] },
      history: { nationalTitles: 3, continentalTitles: 0, lastChampionYear: 2023 }
    },
    {
      id: 'team-franca',
      federation_id: 'fed-cbf',
      name: 'Fluxo Esports',
      short_name: 'FX',
      sport: 'CS2',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2021,
      stadium: 'Arena Fluxo SP',
      coach_name: 'zews (Wilton Prado)',
      primary_color: '#8B5CF6',
      secondary_color: '#1E1B4B',
      elo_rating: 1875,
      roster: [
        { number: 1, name: 'arT (Andrei Piovezan)', position: 'IGL & Entry', age: 28, rating: 1.07, goals: 390, assists: 155 },
        { number: 2, name: 'zevy (Romeu Rocco)', position: 'AWPer', age: 23, rating: 1.15, goals: 442, assists: 84 },
        { number: 3, name: 'Lucaozy (Lucas Neves)', position: 'Rifler / Star', age: 22, rating: 1.18, goals: 470, assists: 105 },
        { number: 4, name: 'nicks (Nicollas Polonio)', position: 'Anchor / Support', age: 19, rating: 1.06, goals: 350, assists: 132 }
      ],
      stats: { played: 28, wins: 17, draws: 0, losses: 11, goalsFor: 41, goalsAgainst: 30, form: ['V', 'D', 'V', 'V', 'D'] },
      history: { nationalTitles: 3, continentalTitles: 1, lastChampionYear: 2024 }
    },
    {
      id: 'team-minas',
      federation_id: 'fed-cbv',
      name: 'Team Liquid Brasil',
      short_name: 'TL',
      sport: 'Rainbow Six',
      city: 'São Paulo',
      state: 'SP',
      founded_year: 2000,
      stadium: 'Alienware Training Facility SP',
      coach_name: 'Hugzord (Hugorocha)',
      primary_color: '#3B82F6',
      secondary_color: '#0F172A',
      elo_rating: 1915,
      roster: [
        { number: 1, name: 'Nesk (André Oliveira)', position: 'Entry Fragger', age: 29, rating: 1.21, goals: 315, assists: 88 },
        { number: 2, name: 'Paluh (Luccas Molina)', position: 'Soft Breacher / Flex', age: 25, rating: 1.25, goals: 340, assists: 112 },
        { number: 3, name: 'Lagonis (Pablo Oliveira)', position: 'IGL / Hard Support', age: 23, rating: 1.02, goals: 210, assists: 175 }
      ],
      stats: { played: 18, wins: 15, draws: 0, losses: 3, goalsFor: 32, goalsAgainst: 11, form: ['V', 'V', 'V', 'V', 'V'] },
      history: { nationalTitles: 6, continentalTitles: 3, worldTitles: 1 }
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

  // 4. Campeonatos de E-Sports (Pontos Corridos MD3, Playoffs Upper/Lower e Grupos + Playoffs)
  const prize1 = calculateTournamentPrizePool({ entryFee: 5000, maxTeams: 20, platformFeePct: 10 });
  const prize2 = calculateTournamentPrizePool({ entryFee: 2500, maxTeams: 16, platformFeePct: 8 });
  const prize3 = calculateTournamentPrizePool({ entryFee: 1500, maxTeams: 12, platformFeePct: 10 });

  const standingsCs2Elite = [
    { pos: 1, teamId: 'team-pal', teamName: 'FURIA Esports', short: 'FUR', pts: 66, played: 28, wins: 22, draws: 0, losses: 6, gf: 52, ga: 21, gd: 31, form: ['V', 'V', 'V', 'D', 'V'] },
    { pos: 2, teamId: 'team-fla', teamName: 'Imperial Esports', short: 'IMP', pts: 60, played: 28, wins: 20, draws: 0, losses: 8, gf: 47, ga: 25, gd: 22, form: ['V', 'V', 'D', 'V', 'V'] },
    { pos: 3, teamId: 'team-franca', teamName: 'Fluxo Esports', short: 'FX', pts: 51, played: 28, wins: 17, draws: 0, losses: 11, gf: 41, ga: 30, gd: 11, form: ['V', 'D', 'V', 'V', 'D'] },
    { pos: 4, teamId: 'team-bot', teamName: 'LOUD Esports', short: 'LLL', pts: 48, played: 28, wins: 16, draws: 0, losses: 12, gf: 39, ga: 31, gd: 8, form: ['V', 'V', 'D', 'V', 'V'] },
    { pos: 5, teamId: 'team-for', teamName: 'MIBR Esports', short: 'MIBR', pts: 45, played: 28, wins: 15, draws: 0, losses: 13, gf: 37, ga: 33, gd: 4, form: ['D', 'V', 'V', 'D', 'V'] },
    { pos: 6, teamId: 'team-spfc', teamName: 'paiN Gaming CS2', short: 'PAIN', pts: 42, played: 28, wins: 14, draws: 0, losses: 14, gf: 35, ga: 34, gd: 1, form: ['V', 'D', 'V', 'V', 'D'] }
  ];

  const tournaments = [
    {
      id: 'trn-brasileirao-2026',
      federation_id: 'fed-cbf',
      name: 'CBCS Major Brasil CS2 — Liga Elite Campeonei',
      sport: 'CS2',
      season: '2026 Split 1',
      format: 'PONTOS_CORRIDOS',
      status: 'IN_PROGRESS',
      max_teams: 20,
      registered_teams_count: 20,
      entry_fee: 5000,
      platform_fee_pct: 10,
      prize: prize1,
      scoring_rules: { win: 3, draw: 0, loss: 0, overtimeWin: 2 },
      tiebreaker_rules: ['SERIES_WINS', 'MAP_DIFF', 'ROUND_DIFF', 'HEAD_TO_HEAD', 'HLTV_TEAM_RATING'],
      official_data_source: 'Valve CS2 GSI + GRID Esports Official Feed',
      standings: standingsCs2Elite
    },
    {
      id: 'trn-copa-campeonei-2026',
      federation_id: 'fed-fpf',
      name: 'Copa Campeonei VCT Challengers Brasil (Playoffs MD3)',
      sport: 'Valorant',
      season: '2026 Stage 2',
      format: 'MATA_MATA',
      status: 'IN_PROGRESS',
      max_teams: 16,
      registered_teams_count: 16,
      entry_fee: 2500,
      platform_fee_pct: 8,
      prize: prize2,
      scoring_rules: { win: 3, draw: 0, loss: 0, deciderOvertimeTwoRounds: true },
      tiebreaker_rules: ['MAP_DIFF', 'ROUND_DIFF_ASCENT_DECIDER', 'ACS_COMBAT_SCORE'],
      official_data_source: 'Riot Games VCT Live Telemetry v3',
      standings: [
        { pos: 1, teamId: 'team-bot', teamName: 'LOUD Valorant', short: 'LLL', pts: 57, played: 24, wins: 19, draws: 0, losses: 5, gf: 42, ga: 16, gd: 26, form: ['V', 'V', 'V', 'V', 'D'] },
        { pos: 2, teamId: 'team-for', teamName: 'MIBR Valorant', short: 'MIBR', pts: 51, played: 24, wins: 17, draws: 0, losses: 7, gf: 38, ga: 20, gd: 18, form: ['V', 'D', 'V', 'V', 'V'] }
      ]
    },
    {
      id: 'trn-supercopa-grupos-2026',
      federation_id: 'fed-lnb',
      name: 'Split CBLOL / LTA Sul — Taça Campeonei (Grupos + Playoffs)',
      sport: 'League of Legends',
      season: '2026 Split 2',
      format: 'GRUPOS_MATA_MATA',
      status: 'OPEN_REGISTRATION',
      max_teams: 12,
      registered_teams_count: 10,
      entry_fee: 1500,
      platform_fee_pct: 10,
      prize: prize3,
      scoring_rules: { win: 3, draw: 0, loss: 0 },
      tiebreaker_rules: ['SERIES_WINS', 'HEAD_TO_HEAD', 'SHORTEST_AVG_WIN_TIME'],
      official_data_source: 'Riot Games LoL Esports Official API',
      standings: [
        { pos: 1, teamId: 'team-spfc', teamName: 'paiN Gaming', short: 'PAIN', pts: 54, played: 22, wins: 18, draws: 0, losses: 4, gf: 39, ga: 14, gd: 25, form: ['V', 'V', 'V', 'V', 'D'] },
        { pos: 2, teamId: 'team-cor', teamName: 'RED Canids Kalunga', short: 'RED', pts: 45, played: 22, wins: 15, draws: 0, losses: 7, gf: 34, ga: 19, gd: 15, form: ['V', 'V', 'D', 'V', 'V'] }
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

  // 5. Partidas de E-Sports Ao Vivo com Telemetria de Servidor e Mercados Específicos
  const matches = [
    {
      id: 'mch-pal-fla-live',
      tournament_id: 'trn-brasileirao-2026',
      tournament_name: 'CBCS Major Brasil CS2 • MD3 (Mapa 2: Mirage)',
      sport: 'CS2',
      round_name: 'Série MD3 (FURIA 1-0) • Mapa 2: de_mirage • Round 21',
      status: 'LIVE',
      minute: 21,
      home_team_id: 'team-pal',
      away_team_id: 'team-fla',
      home_team_name: 'FURIA Esports',
      away_team_name: 'Imperial Esports',
      home_short: 'FUR',
      away_short: 'IMP',
      home_score: 11,
      away_score: 9,
      official_feed_code: 'VALVE-GSI-CS2-MIRAGE-R21',
      stats: {
        possessionHome: 58,
        possessionAway: 42,
        shotsOnTargetHome: 14,
        shotsOnTargetAway: 11,
        cornersHome: 6,
        cornersAway: 4,
        yellowCardsHome: 1,
        yellowCardsAway: 2,
        xgHome: 1.24,
        xgAway: 1.08,
        lastEvent: 'Round 21 • KSCERATO vence Clutch 1v2 no Bomb A (AK-47 Headshot)!'
      },
      odds: {
        matchWinner: { home: 1.58, draw: 4.80, away: 2.45 },
        handicap: {
          homeMinus05: { label: 'FURIA -1.5 Mapas (2-0)', odds: 1.72 },
          awayPlus05: { label: 'Imperial +1.5 Mapas', odds: 2.08 },
          homeMinus15: { label: 'FURIA -2.5 Rounds (Mirage)', odds: 1.85 },
          awayPlus15: { label: 'Imperial +2.5 Rounds', odds: 1.92 }
        },
        goalsOverUnder: {
          over35: { label: 'Mais de 21.5 Rounds no Mapa', odds: 1.92 },
          under35: { label: 'Menos de 21.5 Rounds no Mapa', odds: 1.88 },
          over45: { label: 'Mais de 2.5 Mapas na Série', odds: 2.35 },
          under45: { label: 'Menos de 2.5 Mapas na Série', odds: 1.56 }
        },
        btts: { yes: 2.15, no: 1.68 },
        liveNextGoal: { home: 1.65, none: 12.0, away: 2.25 }
      }
    },
    {
      id: 'mch-bot-for-live',
      tournament_id: 'trn-copa-campeonei-2026',
      tournament_name: 'Copa Campeonei VCT Brasil • Upper Final MD3',
      sport: 'Valorant',
      round_name: 'Mapa 3 Decider: Ascent • Round 18 (Séries 1-1)',
      status: 'LIVE',
      minute: 18,
      home_team_id: 'team-bot',
      away_team_id: 'team-for',
      home_team_name: 'LOUD Valorant',
      away_team_name: 'MIBR Valorant',
      home_short: 'LLL',
      away_short: 'MIBR',
      home_score: 10,
      away_score: 8,
      official_feed_code: 'RIOT-VCT-ASCENT-R18',
      stats: {
        possessionHome: 55,
        possessionAway: 45,
        shotsOnTargetHome: 12,
        shotsOnTargetAway: 10,
        cornersHome: 5,
        cornersAway: 3,
        yellowCardsHome: 1,
        yellowCardsAway: 1,
        xgHome: 245,
        xgAway: 218,
        lastEvent: 'Round 18 • Less (Viper) garante 4K no Retake do Spike Site B!'
      },
      odds: {
        matchWinner: { home: 1.95, draw: 5.20, away: 2.10 },
        handicap: {
          homeMinus05: { label: 'LOUD -2.5 Rounds (Ascent)', odds: 1.95 },
          awayPlus05: { label: 'MIBR +2.5 Rounds (Ascent)', odds: 1.86 },
          homeMinus15: { label: 'LOUD -3.5 Rounds', odds: 2.65 },
          awayPlus15: { label: 'MIBR +3.5 Rounds', odds: 1.44 }
        },
        goalsOverUnder: {
          over25: { label: 'Mais de 21.5 Rounds (Ascent)', odds: 1.74 },
          under25: { label: 'Menos de 21.5 Rounds (Ascent)', odds: 2.05 },
          over35: { label: 'Prorrogação (Overtime Sim)', odds: 3.80 },
          under35: { label: 'Sem Prorrogação (Tempo Normal)', odds: 1.24 }
        },
        btts: { yes: 1.42, no: 2.75 },
        liveNextGoal: { home: 1.80, none: 15.0, away: 2.00 }
      }
    },
    {
      id: 'mch-spfc-cor-live',
      tournament_id: 'trn-supercopa-grupos-2026',
      tournament_name: 'Split CBLOL / LTA Sul • Semifinal MD5',
      sport: 'League of Legends',
      round_name: 'Jogo 3 • Summoner\'s Rift • 29 min (+6.4k Ouro PAI)',
      status: 'LIVE',
      minute: 29,
      home_team_id: 'team-spfc',
      away_team_id: 'team-cor',
      home_team_name: 'paiN Gaming',
      away_team_name: 'RED Canids Kalunga',
      home_short: 'PAIN',
      away_short: 'RED',
      home_score: 14,
      away_score: 9,
      official_feed_code: 'RIOT-LOL-LTA-SF-G3',
      stats: {
        possessionHome: 62,
        possessionAway: 38,
        shotsOnTargetHome: 8,
        shotsOnTargetAway: 3,
        cornersHome: 4,
        cornersAway: 1,
        yellowCardsHome: 1,
        yellowCardsAway: 0,
        xgHome: 58.4,
        xgAway: 52.0,
        lastEvent: '28:40 • paiN Gaming garante Alma Hextec + Barão Nashor (4x1 na Teamfight)!'
      },
      odds: {
        matchWinner: { home: 1.36, draw: 6.50, away: 3.15 },
        handicap: {
          homeMinus05: { label: 'paiN -5.5 Abates (Kills)', odds: 1.76 },
          awayPlus05: { label: 'RED Canids +5.5 Abates', odds: 1.98 },
          homeMinus15: { label: 'paiN -1.5 Mapas na Série', odds: 1.65 },
          awayPlus15: { label: 'RED Canids +1.5 Mapas', odds: 2.18 }
        },
        goalsOverUnder: {
          over15: { label: 'Mais de 26.5 Abates Totais', odds: 1.78 },
          under15: { label: 'Menos de 26.5 Abates Totais', odds: 2.02 },
          over25: { label: 'Duração: Mais de 33.5 Minutos', odds: 1.90 },
          under25: { label: 'Duração: Menos de 33.5 Minutos', odds: 1.86 }
        },
        btts: { yes: 1.55, no: 2.35 },
        liveNextGoal: { home: 1.52, none: 9.50, away: 2.45 }
      }
    },
    {
      id: 'mch-franca-nbb-live',
      tournament_id: 'trn-brasileirao-2026',
      tournament_name: 'Supercopa FPS • CS2 & Rainbow Six Showdown',
      sport: 'CS2',
      round_name: 'Mapa 1: de_inferno • Round 16 (2º Half Pistol)',
      status: 'LIVE',
      minute: 16,
      home_team_id: 'team-franca',
      away_team_id: 'team-minas',
      home_team_name: 'Fluxo Esports',
      away_team_name: 'Team Liquid Brasil',
      home_short: 'FX',
      away_short: 'TL',
      home_score: 9,
      away_score: 7,
      official_feed_code: 'CBGE-CS2-INFERNO-R16',
      stats: {
        possessionHome: 53,
        possessionAway: 47,
        shotsOnTargetHome: 11,
        shotsOnTargetAway: 9,
        cornersHome: 4,
        cornersAway: 4,
        yellowCardsHome: 1,
        yellowCardsAway: 1,
        xgHome: 1.16,
        xgAway: 1.11,
        lastEvent: 'Round 16 • Lucaozy conquista Triple Kill de USP-S no Pistol Round CT!'
      },
      odds: {
        matchWinner: { home: 1.68, draw: 4.90, away: 2.22 },
        handicap: {
          homeMinus05: { label: 'Fluxo -2.5 Rounds (Inferno)', odds: 1.85 },
          awayPlus05: { label: 'Team Liquid +2.5 Rounds', odds: 1.95 },
          homeMinus15: { label: 'Fluxo -1.5 Mapas (2-0)', odds: 2.55 },
          awayPlus15: { label: 'Team Liquid +1.5 Mapas', odds: 1.50 }
        },
        goalsOverUnder: {
          over25: { label: 'Mais de 21.5 Rounds no Mapa', odds: 1.88 },
          under25: { label: 'Menos de 21.5 Rounds no Mapa', odds: 1.92 },
          over35: { label: 'Mais de 2.5 Mapas na Série', odds: 2.10 },
          under35: { label: 'Menos de 2.5 Mapas na Série', odds: 1.70 }
        },
        btts: { yes: 1.95, no: 1.82 },
        liveNextGoal: { home: 1.72, none: 14.0, away: 2.10 }
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

  // 6. Ranking de Prognosticadores de E-Sports (Tipsters) e Mercado de Previsões
  const tipsters = [
    {
      user_id: 'usr-pro-01',
      display_name: 'Rafael "QuantCS" • HLTV & Economy Analytics',
      specialty_sport: 'CS2',
      avatar_initials: 'QC',
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
      display_name: 'Camila "VCT Scout" • Map Pool & First Blood Pro',
      specialty_sport: 'Valorant',
      avatar_initials: 'VS',
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
      display_name: 'Henrique "DraftKing" • CBLOL, LCK & Gold @15',
      specialty_sport: 'League of Legends',
      avatar_initials: 'DK',
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
      display_name: 'Beatriz "TacticalFPS" • R6 Siege & CS2 Totals',
      specialty_sport: 'Rainbow Six',
      avatar_initials: 'TF',
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
      tipster_name: 'Rafael "QuantCS" • HLTV & Economy Analytics',
      tipster_badge: 'GLOBAL ELITE PRO • ROI +28.4%',
      sport: 'CS2',
      match_id: 'mch-pal-fla-live',
      match_label: 'FURIA Esports vs Imperial Esports (CBCS Major CS2)',
      market_type: 'Total de Rounds (Mirage)',
      selection_label: 'Mais de 21.5 Rounds no Mapa 2',
      recommended_odds: 1.92,
      confidence_pct: 92,
      stake_units: 3.0,
      price: 29.9,
      analysis_preview: 'Economia TR da Imperial preservada ($18.5k acumulados) após plant de C4 garante pelo menos mais 2 gun rounds.',
      analysis_full:
        'RELATÓRIO QUANTITATIVO CS2 VIP: Com o placar em 11x9 na Mirage, a Imperial tem Loss Bonus máximo ($3.400 por player) e 4 AK-47 + AWP de HEN1 guardada. O winrate da Imperial em Full Buy TR na Mirage é de 54.8%. A odd justa calculada por simulação Monte Carlo (10.000 rounds) para Over 21.5 Rounds é @1.66, oferecendo +15.6% de Valor Esperado Positivo (+EV) na cotação atual @1.92. Entrada recomendada: 3 unidades.',
      result_status: 'PENDING',
      sales_count: 48
    },
    {
      id: 'pred-02',
      tipster_id: 'tipster-02',
      tipster_name: 'Camila "VCT Scout" • Map Pool & First Blood Pro',
      tipster_badge: 'RADIANT ANALYST • 73.0% WIN',
      sport: 'Valorant',
      match_id: 'mch-bot-for-live',
      match_label: 'LOUD vs MIBR (Copa Campeonei VCT - Ascent)',
      market_type: 'Vencedor da Série & Handicap Rounds',
      selection_label: 'LOUD Valorant vence a Série MD3',
      recommended_odds: 1.95,
      confidence_pct: 88,
      stake_units: 2.5,
      price: 19.9,
      analysis_preview: 'LOUD está no lado Defensivo da Ascent (68% de conversão de Retake com Viper + Killjoy de Less).',
      analysis_full:
        'ANÁLISE TÁTICA COMPLETA: A composição double-controller + Killjoy da LOUD na Ascent registra 71.4% de winrate no lado Defensivo neste Stage. Less e cauanzin já possuem Ultimates (Lockdown + Hunter\'s Fury) prontas para o Round 19, quebrando a execução B do MIBR. Recomendação de 2.5u na vitória da LOUD (@1.95) com proteção de cashout no match point.',
      result_status: 'PENDING',
      sales_count: 35
    },
    {
      id: 'pred-03',
      tipster_id: 'tipster-03',
      tipster_name: 'Henrique "DraftKing" • CBLOL, LCK & Gold @15',
      tipster_badge: 'CHALLENGER ANALYST • ROI +21.8%',
      sport: 'League of Legends',
      match_id: 'mch-spfc-cor-live',
      match_label: 'paiN Gaming vs RED Canids (CBLOL Semifinal)',
      market_type: 'Handicap de Abates (Kills)',
      selection_label: 'paiN Gaming -5.5 Abates no Jogo 3',
      recommended_odds: 1.76,
      confidence_pct: 90,
      stake_units: 3.0,
      price: 24.9,
      analysis_preview: 'Com Alma Hextec + buff do Barão ativo e +6.4k de ouro, o cerco às torres de inibidor força luta favorável para TitaN.',
      analysis_full:
        'PROGNÓSTICO CBLOL PRO: A paiN Gaming detém 100% de conversão quando abre +5k de ouro aos 25 minutos com composição de Hypercarry (Jinx/Azir). A RED Canids precisará forçar engaje desesperado no Dragão Ancião, onde o diferencial de itens garante pelo menos 3 a 4 abates extras antes do Nexus cair. Entrada de 3 unidades.',
      result_status: 'PENDING',
      sales_count: 29
    },
    {
      id: 'pred-04',
      tipster_id: 'usr-pro-01',
      tipster_name: 'Rafael "QuantCS" • HLTV & Economy Analytics',
      tipster_badge: 'GLOBAL ELITE PRO • ROI +28.4%',
      sport: 'CS2',
      match_id: 'mch-franca-nbb-live',
      match_label: 'Fluxo Esports vs Team Liquid (Supercopa FPS)',
      market_type: 'Pick Gratuita Verificada',
      selection_label: 'Mais de 21.5 Rounds (Inferno)',
      recommended_odds: 1.88,
      confidence_pct: 86,
      stake_units: 2.0,
      price: 0,
      analysis_preview: 'Inferno historicamente equilibrada entre Fluxo e Liquid com alta taxa de conversão de clutches no Bomb B.',
      analysis_full:
        'PICK PÚBLICA AUDITADA: Ambos os times venceram seus halfs de CT nas últimas 5 séries em de_inferno com média de 22.8 rounds por mapa. Excelente valor no Over 21.5 rounds.',
      result_status: 'GREEN',
      sales_count: 112
    },
    {
      id: 'pred-05',
      tipster_id: 'tipster-04',
      tipster_name: 'Beatriz "TacticalFPS" • R6 Siege & CS2 Totals',
      tipster_badge: 'FPS SPECIALIST',
      sport: 'Rainbow Six',
      match_id: 'mch-franca-nbb-live',
      match_label: 'Team Liquid vs FaZe Clan (BR6 Stage 1)',
      market_type: 'Handicap de Mapas',
      selection_label: 'Team Liquid -1.5 Mapas (2-0)',
      recommended_odds: 1.88,
      confidence_pct: 84,
      stake_units: 2.0,
      price: 14.9,
      analysis_preview: 'Dupla Nesk e Paluh registrou 1.31 de Rating combinado em Chalet e Clubhouse.',
      analysis_full:
        'ANÁLISE BR6: Team Liquid dominou os bans de operadores e fechou a série em 2x0 (7-4 Chalet, 7-5 Clubhouse), confirmando o GREEN auditado no histórico.',
      result_status: 'GREEN',
      sales_count: 41
    },
    {
      id: 'pred-06',
      tipster_id: 'tipster-02',
      tipster_name: 'Camila "VCT Scout" • Map Pool & First Blood Pro',
      tipster_badge: 'RADIANT ANALYST • 73.0% WIN',
      sport: 'Valorant',
      match_id: 'mch-bot-for-live',
      match_label: 'KRÜ Esports vs FURIA Valorant (VCT Americas)',
      market_type: 'Total de Mapas',
      selection_label: 'Mais de 2.5 Mapas na Série',
      recommended_odds: 1.98,
      confidence_pct: 78,
      stake_units: 1.5,
      price: 15.0,
      analysis_preview: 'Registro histórico transparente de prognóstico encerrado em 2x0 (Red contabilizado no ROI da analista).',
      analysis_full:
        'TRANSPARÊNCIA CAMPEONEI: Esta previsão foi encerrada como RED (série decidida em 2x0 na prorrogação da Lotus) e permanece 100% visível e imutável no histórico público da prognosticadora para auditoria dos compradores.',
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
    description: 'INSCRICAO CBCS FURIA'
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
    description: 'Pagamento de Inscrição PIX - CBCS Major Brasil CS2 (FURIA Esports)',
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

  // 8. Aposta Inicial Exemplo em E-Sports
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
        matchLabel: 'FURIA Esports vs Imperial Esports (CS2)',
        market: 'Vencedor da Série (MD3)',
        selection: 'FURIA Esports',
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

  // 9. Notificações Iniciais (Esports-First)
  const notifications = [
    {
      id: 'ntf-01',
      user_id: 'usr-admin-01',
      category: 'PAYMENT',
      channels: ['IN_APP', 'EMAIL', 'PUSH'],
      title: 'PIX Confirmado Instantaneamente (SPI BCB)',
      message: 'Transação TX-PIX-2026-0001 de R$ 5.000,00 (Inscrição CBCS Major CS2) conciliada e gravada no Ledger Imutável SHA-256.'
    },
    {
      id: 'ntf-02',
      user_id: 'usr-admin-01',
      category: 'MATCH',
      channels: ['IN_APP', 'PUSH'],
      title: 'CLUTCH AO VIVO CS2 • FURIA 11 x 9 Imperial (Mirage R21)',
      message: 'Telemetria Valve GSI: KSCERATO vence Clutch 1v2 no Bomb A! Cotações Ao Vivo da MD3 recalibradas.'
    },
    {
      id: 'ntf-03',
      user_id: 'usr-admin-01',
      category: 'TOURNAMENT',
      channels: ['IN_APP', 'EMAIL'],
      title: 'Premiação Automática Calculada • CBCS Major Brasil CS2',
      message: 'Prize Pool líquido de R$ 90.000,00 garantido em custódia: R$ 54.000 (1º), R$ 22.500 (2º), R$ 9.000 (3º) e R$ 4.500 (MVP HLTV).'
    },
    {
      id: 'ntf-04',
      user_id: 'usr-admin-01',
      category: 'SECURITY',
      channels: ['IN_APP', 'EMAIL'],
      title: 'Auditoria HSM & Integridade ESIC / ML Ativos',
      message: 'Chave mestra AES-256-GCM ativa no Slot 0 do HSM e motor anti-match-fixing (ESIC + Lei 14.790) operando com 0 violações.'
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
    'Validação de Comprovante de Residência e CNH Digital para Apostas Esports',
    'Enviei minha CNH Digital ICP-Brasil e conta de energia para liberar depósitos via PIX no CBCS Major.',
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
    'Rafael "QuantCS" Mendonça',
    'TOURNAMENT_HOMOLOGATION',
    'MEDIUM',
    'Sincronização de Telemetria Valve GSI e Veto de Mapas MD3',
    'Solicito homologação do log de veto de mapas (Mirage / Ancient / Nuke) da semifinal do CBCS.',
    'RESOLVED',
    'moderator',
    'Logs do servidor CS2 sincronizados via API oficial GRID Esports.',
    'Marina Costa (Head Marshal)',
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
    'Gabriel "kNgV" Silva (Pro Player Inscrito CBCS)',
    'INSIDER_BLOCK_LEI_14790',
    'Bloqueio preventivo de apostas conforme Art. 26 da Lei nº 14.790/2023 e Código de Integridade ESIC (vedação a pro-players e coaches inscritos em torneios oficiais).',
    'Lucas Fortunato',
    'super_admin',
    now
  );
}

module.exports = { seedDatabaseIfNeeded };
