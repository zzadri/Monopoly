import type { Card } from './types.js';

/**
 * Decks prédéfinis en français.
 * Les cases `goto` référencent le plateau classique (40 cases) ;
 * pour un plateau custom, la destination est ramenée modulo le nombre de cases.
 */

export const PREDEFINED_TREASURE: Card[] = [
  { id: 'tr-1', text: 'Erreur de la banque en votre faveur. Recevez $200.', action: { kind: 'gain', amount: 200 } },
  { id: 'tr-2', text: 'Votre téléphone est mort. Payez $50 de réparation.', action: { kind: 'pay', amount: 50 } },
  { id: 'tr-3', text: 'Remboursement de vos impôts. Recevez $20.', action: { kind: 'gain', amount: 20 } },
  { id: 'tr-4', text: "C'est votre anniversaire ! Chaque joueur vous offre $10.", action: { kind: 'gain-each', amount: 10 } },
  { id: 'tr-5', text: 'Votre assurance vie vous rapporte $100.', action: { kind: 'gain', amount: 100 } },
  { id: 'tr-6', text: "Frais d'hôpital. Payez $100.", action: { kind: 'pay', amount: 100 } },
  { id: 'tr-7', text: 'Frais de scolarité. Payez $50.', action: { kind: 'pay', amount: 50 } },
  { id: 'tr-8', text: 'Vous héritez de $100.', action: { kind: 'gain', amount: 100 } },
  { id: 'tr-9', text: 'Vous vendez vos vieux meubles. Recevez $50.', action: { kind: 'gain', amount: 50 } },
  { id: 'tr-10', text: 'Vous gagnez le deuxième prix du concours de beauté. Recevez $10.', action: { kind: 'gain', amount: 10 } },
  { id: 'tr-11', text: 'Carte « Sortie de prison ». Conservez-la.', action: { kind: 'jail-card' } },
  { id: 'tr-12', text: 'Allez en prison, sans passer par la case Départ.', action: { kind: 'goto-prison' } },
  { id: 'tr-13', text: 'Retournez à la case Départ et recevez $200.', action: { kind: 'goto-start' } },
  { id: 'tr-14', text: 'Réparations : payez $40 par maison et $115 par hôtel.', action: { kind: 'repairs', perHouse: 40, perHotel: 115 } },
  { id: 'tr-15', text: 'Votre placement rapporte. Recevez $25.', action: { kind: 'gain', amount: 25 } },
  { id: 'tr-16', text: 'Amende de stationnement. Payez $15.', action: { kind: 'pay', amount: 15 } },
];

export const PREDEFINED_SURPRISE: Card[] = [
  { id: 'su-1', text: 'Avancez jusqu’à la case Départ et recevez $200.', action: { kind: 'goto-start' } },
  { id: 'su-2', text: 'Avancez jusqu’à Venise.', action: { kind: 'goto', tile: 11 } },
  { id: 'su-3', text: 'Avancez jusqu’à Paris.', action: { kind: 'goto', tile: 29 } },
  { id: 'su-4', text: 'Avancez jusqu’à New York.', action: { kind: 'goto', tile: 39 } },
  { id: 'su-5', text: 'Reculez de trois cases.', action: { kind: 'move', steps: -3 } },
  { id: 'su-6', text: 'Avancez de cinq cases.', action: { kind: 'move', steps: 5 } },
  { id: 'su-7', text: 'Allez en prison, sans passer par la case Départ.', action: { kind: 'goto-prison' } },
  { id: 'su-8', text: 'Carte « Sortie de prison ». Conservez-la.', action: { kind: 'jail-card' } },
  { id: 'su-9', text: 'La banque vous verse un dividende de $50.', action: { kind: 'gain', amount: 50 } },
  { id: 'su-10', text: 'Amende pour excès de vitesse. Payez $15.', action: { kind: 'pay', amount: 15 } },
  { id: 'su-11', text: 'Vous êtes élu président du conseil. Payez $50 à chaque joueur.', action: { kind: 'pay-each', amount: 50 } },
  { id: 'su-12', text: 'Votre immeuble rapporte. Recevez $150.', action: { kind: 'gain', amount: 150 } },
  { id: 'su-13', text: 'Réparations générales : payez $25 par maison et $100 par hôtel.', action: { kind: 'repairs', perHouse: 25, perHotel: 100 } },
  { id: 'su-14', text: 'Frais de dossier. Payez $50.', action: { kind: 'pay', amount: 50 } },
  { id: 'su-15', text: 'Vous remportez un concours de mots croisés. Recevez $100.', action: { kind: 'gain', amount: 100 } },
  { id: 'su-16', text: 'Avancez de dix cases.', action: { kind: 'move', steps: 10 } },
];
