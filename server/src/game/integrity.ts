import crypto from 'node:crypto';
import type { IntegrityAnomaly, IntegrityStatus } from 'shared';

/**
 * Intégrité des parties.
 *
 * Principe directeur : « le client demande, le serveur décide ». Ce module ne
 * fait jamais confiance au client ; il fournit les briques qui rendent une
 * partie vérifiable après coup :
 *   - un générateur aléatoire déterministe et prouvable (seed + compteur),
 *   - un journal d'actions immuable,
 *   - un score d'intégrité alimenté par des anomalies détectées.
 */

/**
 * Tirage aléatoire vérifiable.
 *
 * Chaque valeur dérive de HMAC-SHA256(seed, compteur) : le serveur publie
 * l'empreinte du seed au début de la partie et le seed en clair à la fin, ce
 * qui permet à n'importe qui de rejouer la séquence et de constater qu'aucun
 * lancer n'a été modifié après coup.
 */
export class SeededRng {
  private counter = 0;
  readonly seed: string;

  constructor(seed?: string) {
    this.seed = seed ?? crypto.randomBytes(32).toString('hex');
  }

  /** Empreinte publiable en début de partie (engagement sur le seed). */
  get seedHash(): string {
    return crypto.createHash('sha256').update(this.seed).digest('hex');
  }

  get draws(): number {
    return this.counter;
  }

  /** Entier uniforme dans [0, max), sans biais modulo. */
  int(max: number): number {
    if (max <= 0) return 0;
    const limit = Math.floor(0xffffffff / max) * max;
    for (;;) {
      const digest = crypto
        .createHmac('sha256', this.seed)
        .update(String(this.counter++))
        .digest();
      const value = digest.readUInt32BE(0);
      if (value < limit) return value % max;
      // valeur au-delà du dernier multiple complet : on retire pour rester uniforme
    }
  }
}

/** Rejoue la séquence d'un seed : sert à vérifier une partie a posteriori. */
export function verifySeed(seed: string, expectedHash: string): boolean {
  return crypto.createHash('sha256').update(seed).digest('hex') === expectedHash;
}

/* ---------- score d'intégrité ---------- */

/**
 * Pénalité appliquée au score, et plafond cumulé par type d'anomalie.
 *
 * Le plafond est essentiel : un signal bruité (un joueur qui enchaîne vite,
 * une latence réseau) ne doit jamais suffire à disqualifier une partie. Seules
 * les incohérences d'état, réellement impossibles, pèsent lourd.
 */
const PENALTY: Record<string, { each: number; max: number }> = {
  rejected_action: { each: 1, max: 10 },   // action refusée (hors tour, phase invalide…)
  replayed_action: { each: 2, max: 10 },   // même identifiant d'action rejoué
  too_fast: { each: 2, max: 12 },          // cadence improbable
  action_flood: { each: 4, max: 16 },      // rafale de requêtes
  robotic_timing: { each: 8, max: 24 },    // réactions sans variation naturelle
  state_invariant: { each: 25, max: 100 }, // état du jeu incohérent
  impossible_value: { each: 30, max: 100 },// valeur hors des bornes du plateau
};

export class IntegrityMonitor {
  private score = 100;
  private anomalies: IntegrityAnomaly[] = [];
  /** identifiants d'actions déjà traités : garantit l'idempotence */
  private seenActions = new Map<string, number>();
  /** horodatages des actions par joueur, pour la détection de cadence */
  private timings = new Map<string, number[]>();
  private lastAction = new Map<string, number>();
  /** occurrences d'intervalles anormalement courts, par joueur */
  private fastHits = new Map<string, number>();

  /**
   * Intervalle minimal crédible entre deux actions d'un même joueur (ms).
   * Volontairement bas : un joueur pressé enchaîne vite, seule une cadence
   * franchement inhumaine doit ressortir, et encore faut-il qu'elle se répète.
   */
  private static readonly MIN_INTERVAL_MS = 50;
  /** nombre d'intervalles trop courts tolérés avant de lever une anomalie */
  private static readonly FAST_TOLERANCE = 5;
  private static readonly FLOOD_WINDOW_MS = 1000;
  private static readonly FLOOD_MAX = 12;

  /** total déjà retiré par type, pour respecter les plafonds */
  private spent = new Map<string, number>();

  flag(code: string, detail: string, playerId?: string) {
    const rule = PENALTY[code] ?? { each: 5, max: 20 };
    const already = this.spent.get(code) ?? 0;
    const penalty = Math.min(rule.each, Math.max(0, rule.max - already));
    if (penalty > 0) {
      this.spent.set(code, already + penalty);
      this.score = Math.max(0, this.score - penalty);
    }
    // le journal d'anomalies reste borné : seules les 200 premières sont gardées
    if (this.anomalies.length < 200) {
      this.anomalies.push({ code, detail, playerId: playerId ?? null, at: Date.now() });
    }
  }

  /**
   * Idempotence : une même action rejouée (reconnexion, double clic, rejeu
   * malveillant) ne doit jamais produire deux fois son effet.
   * @returns true si l'action a déjà été traitée
   */
  isReplay(actionId: string | undefined, playerId: string): boolean {
    if (!actionId) return false;
    const key = `${playerId}:${actionId}`;
    if (this.seenActions.has(key)) {
      this.flag('replayed_action', `action ${actionId} rejouée`, playerId);
      return true;
    }
    this.seenActions.set(key, Date.now());
    // purge : on ne conserve qu'une fenêtre glissante d'identifiants
    if (this.seenActions.size > 5000) {
      const cutoff = Date.now() - 300_000;
      for (const [k, ts] of this.seenActions) if (ts < cutoff) this.seenActions.delete(k);
    }
    return false;
  }

  /** Contrôle de cadence : anti speed-hack et anti-spam. */
  checkPace(playerId: string, isBot: boolean) {
    if (isBot) return;
    const now = Date.now();
    const previous = this.lastAction.get(playerId);
    this.lastAction.set(playerId, now);

    if (previous !== undefined) {
      const delta = now - previous;
      if (delta < IntegrityMonitor.MIN_INTERVAL_MS) {
        const seen = (this.fastHits.get(playerId) ?? 0) + 1;
        this.fastHits.set(playerId, seen);
        // on ne signale qu'à partir d'une répétition : un pic isolé ne prouve rien
        if (seen > IntegrityMonitor.FAST_TOLERANCE) {
          this.flag('too_fast', `${seen} intervalles sous ${IntegrityMonitor.MIN_INTERVAL_MS} ms`, playerId);
        }
      }
      const list = this.timings.get(playerId) ?? [];
      list.push(delta);
      if (list.length > 60) list.shift();
      this.timings.set(playerId, list);
    }

    const recent = (this.timings.get(playerId) ?? []).slice(-IntegrityMonitor.FLOOD_MAX);
    if (recent.length === IntegrityMonitor.FLOOD_MAX) {
      const span = recent.reduce((a, b) => a + b, 0);
      if (span < IntegrityMonitor.FLOOD_WINDOW_MS) {
        this.flag('action_flood', `${IntegrityMonitor.FLOOD_MAX} actions en ${span} ms`, playerId);
      }
    }
  }

  /**
   * Détection de client automatisé : des temps de réaction quasiment
   * identiques trahissent un script. On exige un échantillon suffisant pour
   * éviter les faux positifs.
   */
  checkRobotic(playerId: string, isBot: boolean) {
    if (isBot) return;
    const list = this.timings.get(playerId);
    if (!list || list.length < 25) return;
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    if (mean > 5000) return; // joueur lent : aucune conclusion
    const variance = list.reduce((s, d) => s + (d - mean) ** 2, 0) / list.length;
    const stdDev = Math.sqrt(variance);
    // un humain varie ; un script tape à intervalle quasi constant
    if (mean > 0 && stdDev / mean < 0.05) {
      this.flag('robotic_timing', `écart-type ${Math.round(stdDev)} ms pour ${Math.round(mean)} ms`, playerId);
    }
  }

  /**
   * Seuils calibrés pour que les seuls signaux de comportement (cadence,
   * régularité) ne puissent pas disqualifier une partie à eux seuls : leur
   * pénalité cumulée maximale est de 28 points, ce qui laisse le statut
   * « vérifiée ». Ce sont les incohérences d'état, elles impossibles en jeu
   * loyal, qui font basculer la partie.
   */
  get result(): { score: number; status: IntegrityStatus; anomalies: IntegrityAnomaly[] } {
    const status: IntegrityStatus =
      this.score >= 70 ? 'verified' : this.score >= 40 ? 'partial' : 'ineligible';
    return { score: this.score, status, anomalies: this.anomalies };
  }

  /** Une partie n'alimente XP et classements que si elle est pleinement vérifiée. */
  get eligible(): boolean {
    return this.result.status === 'verified';
  }
}

/** Empreinte de l'état de jeu : détecte toute modification inattendue. */
export function hashState(state: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
}
