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

Sur votre ordinateur (pas dans cette session) :

```bash
npm install -g supabase
supabase login
cd movecheck   # ce dépôt cloné en local
supabase link --project-ref VOTRE_PROJECT_REF   # visible dans l'URL du dashboard Supabase

# Secrets utilisés par les fonctions (ne PAS mettre SUPABASE_URL /
# SUPABASE_SERVICE_ROLE_KEY : Supabase les injecte automatiquement)
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx   # obtenu à l'étape 4
supabase secrets set RESEND_API_KEY=re_xxx              # étape 3
supabase secrets set FROM_EMAIL="MoveCheck <onboarding@resend.dev>"
supabase secrets set SITE_URL=https://VOTRE-COMPTE.github.io/MOVECHECK
supabase secrets set PRACTITIONER_EMAIL=nicolasroger16@gmail.com

supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy get-code --no-verify-jwt
supabase functions deploy get-bilan --no-verify-jwt
supabase functions deploy get-upload-url --no-verify-jwt
supabase functions deploy submit-filmage --no-verify-jwt
```

Le `--no-verify-jwt` est nécessaire car ces fonctions sont appelées soit par
Stripe (pas de session Supabase), soit par des patients qui ne sont pas
connectés. La sécurité vient de la signature Stripe (pour le webhook) et du
code MC-XXXXXX (pour les autres) — personne ne peut deviner le code d'un
autre patient.

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
