// Configuration MoveCheck — à remplir une fois votre projet Supabase et
// votre lien de paiement Stripe créés. Voir SETUP.md pour le détail.
// Ce fichier est le SEUL endroit à modifier : toutes les pages le chargent.

window.MOVECHECK_CONFIG = {
  SUPABASE_URL: "https://hjzlqwidgkdfcbghxnhp.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ljLod-0jzSLOG0XndtUlbg_WDPg_G98",
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/bJe28sblH2sIdU4523c3m00",
  // Lien de paiement Stripe pour l'abonnement "suivi trimestriel" (45€/3 mois).
  // À créer dans Stripe Dashboard → Payment Links (voir SETUP.md), puis coller ici.
  STRIPE_SUBSCRIPTION_LINK: "",
};
