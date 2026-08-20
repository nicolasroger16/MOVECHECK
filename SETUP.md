# MoveCheck — Guide de mise en route

Ce dépôt contient maintenant le parcours complet :

```
Flyer (QR) / site  →  index.html (présentation)
                          ↓ clic "Commencer mon bilan"
                    Stripe Payment Link (59€)
                          ↓ paiement réussi (webhook)
        Supabase crée le dossier + génère un code MC-XXXXXX
                          ↓
       Email au patient (code) + email à vous (nouvelle demande)
       + le dossier apparaît en direct sur dashboard.html (le mur)
                          ↓
        merci.html affiche aussi le code immédiatement
                          ↓
   Patient va sur filmage.html?code=MC-XXXXXX, filme les 5 tests
   (upload vidéo direct depuis le téléphone) + note ses observations
                          ↓
      Soumission → statut "filmé", email + notification en direct
                sur dashboard.html (le mur)
                          ↓
        Vous consultez vidéos + observations sur dashboard.html
              et marquez le dossier "terminé"
```

Tout le code est prêt. Il reste des étapes de configuration que seul vous
pouvez faire (création de comptes, clés secrètes). Comptez ~45 minutes.

## 1. Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com), créez un compte et un
   nouveau projet (choisissez une région proche de la France).
2. Dans **SQL Editor**, collez le contenu de `supabase/schema.sql` et
   exécutez-le. Cela crée la table `bilans`, ses règles de sécurité, et le
   bucket de stockage `videos`.
3. Dans **Project Settings → API**, notez :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → à garder secrète, utilisée seulement côté serveur

4. Créez votre compte pour vous connecter au dashboard : **Authentication →
   Users → Add user**, entrez votre email et un mot de passe. C'est cet
   email/mot de passe qui vous servira à vous connecter sur `dashboard.html`.

## 2. Déployer les fonctions (Edge Functions)

Le déploiement se fait automatiquement via **GitHub Actions**
(`.github/workflows/deploy-supabase-functions.yml`), à chaque modification
dans `supabase/functions/`, ou manuellement via l'onglet **Actions** du
repo → *Déployer les fonctions Supabase* → **Run workflow**.

Il vous suffit d'ajouter les secrets suivants dans **Settings → Secrets and
variables → Actions → New repository secret** :

| Secret | Valeur |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Jeton généré sur [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF` | La partie avant `.supabase.co` dans votre Project URL |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (Développeurs → Clés API) |
| `STRIPE_WEBHOOK_SECRET` | Obtenu à l'étape 4 ci-dessous |
| `RESEND_API_KEY` | Obtenu à l'étape 3 ci-dessous |

`FROM_EMAIL`, `SITE_URL` et `PRACTITIONER_EMAIL` sont optionnels : des
valeurs par défaut correctes sont déjà utilisées si vous ne les ajoutez pas.

Vous pouvez ajouter `SUPABASE_ACCESS_TOKEN` et `SUPABASE_PROJECT_REF` dès
maintenant pour déployer les 4 fonctions qui n'ont pas besoin de Stripe/Resend
(`get-code`, `get-bilan`, `get-upload-url`, `submit-filmage`), puis ajouter
les 3 autres secrets une fois les étapes 3 et 4 faites, et relancer le
workflow (Actions → *Run workflow*) — pas besoin de tout faire d'un coup.

Le `--no-verify-jwt` utilisé dans le workflow est nécessaire car ces
fonctions sont appelées soit par Stripe (pas de session Supabase), soit par
des patients qui ne sont pas connectés. La sécurité vient de la signature
Stripe (pour le webhook) et du code MC-XXXXXX (pour les autres) — personne
ne peut deviner le code d'un autre patient.

*(Alternative : vous pouvez aussi déployer depuis votre ordinateur avec
`npm install -g supabase && supabase login && supabase link --project-ref ... && supabase functions deploy <nom> --no-verify-jwt` pour chacune des 5 fonctions, si vous préférez ne pas utiliser GitHub Actions.)*

## 3. Créer un compte Resend (envoi des emails)

1. [resend.com](https://resend.com) → créez un compte gratuit (100
   emails/jour, 3000/mois, largement suffisant pour démarrer).
2. **API Keys → Create API Key**, copiez la clé → c'est votre
   `RESEND_API_KEY` de l'étape 2.
3. Pour commencer, vous pouvez envoyer depuis `onboarding@resend.dev` sans
   configuration supplémentaire (déjà la valeur par défaut dans le code).
   Plus tard, si vous voulez envoyer depuis `movecheck@nicolasroger.fr`,
   ajoutez et vérifiez ce domaine dans Resend, puis changez `FROM_EMAIL`.

## 4. Configurer le Payment Link Stripe

Sur votre lien de paiement existant (Stripe Dashboard → Payment Links → le
lien du bilan à 59€) :

1. **Collecter des informations client** : activez la collecte du
   téléphone.
2. **Champs personnalisés** (Custom fields, jusqu'à 3) : ajoutez-en un pour
   chaque valeur ci-dessous, avec exactement ces clés (key) :
   - `prenom` → « Prénom »
   - `nom` → « Nom »
   - `zone` → « Zone douloureuse principale »
3. **Après le paiement** : choisissez « Rediriger les clients vers votre
   site », et entrez :
   ```
   https://VOTRE-COMPTE.github.io/MOVECHECK/merci.html?session_id={CHECKOUT_SESSION_ID}
   ```
4. Dans **Développeurs → Webhooks**, créez un endpoint pointant vers :
   ```
   https://VOTRE-PROJECT-REF.supabase.co/functions/v1/stripe-webhook
   ```
   Écoutez l'événement `checkout.session.completed`. Copiez le **Signing
   secret** (`whsec_...`) → c'est votre `STRIPE_WEBHOOK_SECRET` de l'étape 2.

## 5. Remplir `docs/config.js`

Éditez `docs/config.js` dans ce dépôt avec vos vraies valeurs :

```js
window.MOVECHECK_CONFIG = {
  SUPABASE_URL: "https://VOTRE-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",             // la clé "anon public", pas service_role
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/xxx",
};
```

## 6. Activer GitHub Pages

Sur GitHub, dans ce dépôt : **Settings → Pages → Source** = branche `main`,
dossier `/docs`. Une fois activé, votre site est disponible à :

```
https://VOTRE-COMPTE.github.io/MOVECHECK/
```

Mettez à jour `SITE_URL` (étape 2) et le lien de redirection Stripe (étape
4) si l'URL diffère.

## 7. Imprimer le flyer

Ouvrez `docs/flyer.html` dans un navigateur une fois le site en ligne (le
QR code se génère automatiquement vers votre `index.html`), puis
Fichier → Imprimer → Enregistrer en PDF (format A5 déjà configuré).

## 8. Tester avant de passer en production

1. Passez votre compte Stripe en **mode test**, utilisez une carte de test
   (4242 4242 4242 4242).
2. Parcourez tout le flux : `index.html` → paiement → `merci.html` (le code
   doit s'afficher en quelques secondes) → email reçu → `filmage.html?code=...`
   → filmez avec un vrai fichier vidéo → soumettez → vérifiez que le
   dossier apparaît et se met à jour sur `dashboard.html`.
3. Repassez en mode live une fois satisfait, et re-créez le webhook en mode
   live (les clés/secrets de test et live sont différents dans Stripe).

## Notes

- Le stockage vidéo Supabase gratuit inclut 1 Go ; au-delà, l'espace est
  facturé au Go. Pensez à archiver/supprimer les vidéos anciennes depuis le
  dashboard Supabase (Storage → videos) une fois les programmes envoyés.
- `dashboard.html` est public (comme les autres pages) mais protégé par
  connexion Supabase Auth — seul votre compte créé à l'étape 1.4 peut voir
  les dossiers patients.
- Pour ajouter un deuxième praticien, créez un utilisateur Supabase Auth
  supplémentaire.
