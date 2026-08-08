# 🎲 Monopolie

Jeu de plateau multijoueur (type Monopoly) à jouer entre amis **sur le même réseau local**, en français.

## Démarrage

### Avec Docker (recommandé)

```bash
./start.sh
# → http://<ip-locale>:3000  (l'IP est détectée et affichée)
```

`start.sh` crée `.env` avec des secrets aléatoires au premier lancement, détecte
l'IP locale (elle change au gré du DHCP), l'inscrit dans le certificat HTTPS et
démarre la pile. Ensuite, `docker compose up -d` suffit tant que l'IP ne bouge pas.

### Architecture des services

| Service | Rôle | Redémarrage indépendant |
|---------|------|--------------------------|
| `db`    | PostgreSQL 17 — comptes, plateaux, historique | ✅ volume `db-data` |
| `minio` | Stockage objet S3 pour les images importées   | ✅ volume `minio-data` |
| `api`   | Express + Socket.IO, **sans état**            | ✅ redéployable à chaud |
| `web`   | nginx — client statique + reverse proxy, HTTP **et** HTTPS | ✅ volume `certs` |

```bash
docker compose logs -f api        # journaux d'un seul service
docker compose restart api        # redémarrer l'API sans toucher aux données
docker compose up -d --build web  # reconstruire uniquement le front
docker compose down               # tout arrêter (les volumes sont conservés)
```

Console MinIO : `http://localhost:9001` (identifiants dans `.env`).

### Sans Docker (développement)

La base et le stockage restent dans Docker ; seul le code tourne en local :

```bash
npm install
docker compose up -d db minio     # dépendances uniquement

npm run dev
# → client : http://localhost:5173 (proxy vers l'API sur :3100)
```

Vos amis rejoignent via `http://<votre-ip>:3000` (ou `:5173` en dev), créent un compte et entrent dans votre salon (lien ou liste publique).

## Fonctionnalités

- **Jouer sans compte** : un pseudo suffit pour rejoindre n'importe quelle partie
  (publique ou privée). Le compte reste optionnel et sert uniquement à conserver
  les statistiques, l'historique, les plateaux créés et les images importées.
- **Salons** publics ou privés, jusqu'à 8 joueurs, hôte avec paramètres complets :
  argent de départ (500 → 3000 $), nombre de dés (1-3) et faces (D6/D10/D20),
  loyer ×2 sur groupe complet, cagnotte de vacances, enchères, pas de loyer en prison,
  hypothèques, construction équilibrée, ordre aléatoire, bots.
- **Jeu complet** : achat, loyers, maisons/hôtels, hypothèques, prison (caution, doubles, carte),
  taxes, cartes Trésor/Surprise, enchères, échanges (aussi avec les bots), faillite, statistiques de fin.
- **Éditeur de plateaux** : dimensions libres (5×5 → 16×16), remplissage automatique des prix
  et loyers sur tout le plateau (ou par groupe), cases/prix/loyers personnalisés,
  groupes de couleurs (drapeaux ou image importée), cartes prédéfinies / personnalisées / mélangées,
  plateaux publics ou privés.
- **Remplissage équilibré des cartes** : génère un deck cohérent (gains, pertes, déplacements et
  effets spéciaux appariés), avec montants mis à l'échelle du plateau et espérance ramenée à ~0 $.
  Un indicateur affiche en permanence l'équilibre du deck joué.
- **Profils** : victoires, défaites, ratio, historique détaillé avec courbe de valeur nette.
- **Interface** responsive (mobile → grand écran), thème sombre, icônes SVG, dés animés,
  pions animés case par case, chat intégré, panneaux repliables.

## Architecture

| Dossier   | Rôle                                                                    |
|-----------|-------------------------------------------------------------------------|
| `shared/` | Types TypeScript, plateau classique, cartes prédéfinies (client+serveur) |
| `server/` | Express + Socket.IO + PostgreSQL (`pg`) — logique de jeu 100 % côté serveur |
| `client/` | React + Vite — interface                                                 |
| `docker/` | Dockerfiles et configuration nginx des services `api` et `web`           |

Sécurité : mots de passe hachés (bcrypt), sessions JWT en cookie httpOnly (secret dans
`JWT_SECRET`, donc conservé d'un redémarrage à l'autre), validation zod de toutes les
entrées (HTTP et socket), rate-limiting sur l'authentification, helmet.
L'API ne stocke rien sur disque : tout vit dans PostgreSQL et MinIO.

## Images personnalisées (groupes de propriétés)

Les images importées passent par un pipeline durci :
ré-encodage canvas côté client → vérification de la **signature binaire** côté serveur
(PNG/JPEG/WebP uniquement, jamais le nom de fichier → aucun bypass par double extension),
clé de stockage = UUID sans extension, servi avec `X-Content-Type-Options: nosniff`,
120 Ko max, quota et rate-limit par utilisateur, authentification requise.

Stockage : MinIO (service `minio`) par défaut. Pour pointer vers un autre S3,
ajustez dans `.env` :

```bash
S3_BUCKET=mon-bucket          # active le backend S3
S3_REGION=eu-west-3
S3_ENDPOINT=http://minio:9000  # MinIO / S3 compatible (optionnel pour AWS)
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=1          # requis pour MinIO
```

Les objets ne sont jamais exposés publiquement : le serveur les relaie avec ses
propres en-têtes sûrs.

## Accès depuis un téléphone / une autre machine

Ouvrez `http://<ip-locale>:3000` (l'IP s'affiche au démarrage du serveur).

**Le port accepte HTTP *et* HTTPS.** Les navigateurs mobiles récents (Firefox
« HTTPS-First », Chrome, Safari) tentent souvent `https://` d'eux-mêmes : face à
un serveur en clair, la connexion échouait alors durement
(`SSL_ERROR_RX_RECORD_TOO_LONG`) sans repli possible. Le serveur regarde
désormais le premier octet de chaque connexion (`0x16` = handshake TLS) et
répond dans le bon protocole. C'est nginx qui s'en charge, via le module
`ssl_preread` — voir `docker/web/nginx.conf`.

Le certificat HTTPS est auto-signé et généré au premier démarrage du conteneur
`web` : le navigateur affiche **un avertissement à accepter une fois**
(« Avancé » → « Continuer »). En HTTP, aucun avertissement.

Docker masque l'IP réseau de la machine hôte : `start.sh` la détecte et la
renseigne dans `MONOPOLIE_HOSTS` pour qu'elle figure dans le certificat.

Les en-têtes qui forcent le HTTPS (`upgrade-insecure-requests`,
`Strict-Transport-Security`) sont désactivés : sinon les navigateurs tentent de
charger les assets en `https://` et n'affichent qu'une page blanche. Les autres
protections de helmet restent actives.

Si la page ne s'ouvre toujours pas : le téléphone doit être sur le **même réseau
Wi-Fi** (pas de données mobiles, pas de réseau « invité »), et le routeur ne
doit pas isoler les clients (option « AP isolation »).
