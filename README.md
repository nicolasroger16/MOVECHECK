# MOVECHECK
MOVECHECK - Bilan de mobilite a distance

Parcours patient complet : flyer/site → présentation → paiement Stripe →
consignes de filmage avec upload vidéo → dashboard praticien en temps réel.

Voir [SETUP.md](./SETUP.md) pour la mise en route (création des comptes,
clés à configurer, déploiement).

- `docs/` — pages statiques (à héberger via GitHub Pages)
- `supabase/` — schéma de base de données et fonctions serveur (Edge
  Functions) : webhook Stripe, génération de code, upload vidéo,
  soumission du filmage
