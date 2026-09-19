// Reçoit les événements Stripe après paiement d'un bilan MoveCheck (ponctuel
// ou abonnement trimestriel), crée le dossier patient, génère son code
// d'accès et lui envoie l'email de confirmation.
//
// Événements écoutés côté Stripe (Dashboard → Webhooks) :
//   - checkout.session.completed : paiement ponctuel OU 1er cycle d'un abonnement
//   - invoice.paid               : renouvellement d'un abonnement (cycles suivants)
//   - customer.subscription.deleted : annulation d'un abonnement
//
// Déploiement : supabase functions deploy stripe-webhook --no-verify-jwt
// (Stripe n'envoie pas de JWT Supabase, donc la vérification par défaut
// doit être désactivée ; la sécurité vient de la signature Stripe ci-dessous)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "MoveCheck <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://nicolasroger16.github.io/MOVECHECK";
const PRACTITIONER_EMAIL = Deno.env.get("PRACTITIONER_EMAIL") || "nicolasroger16@gmail.com";

function genCode() {
  return "MC-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

function customField(session: Stripe.Checkout.Session, key: string) {
  const field = session.custom_fields?.find((f) => f.key === key);
  return field?.text?.value?.trim() || "";
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY manquant, email non envoyé:", subject);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

async function sendCodeEmails(params: {
  code: string;
  prenom: string;
  nom: string;
  email: string;
  zone: string;
  intro: string;
  practitionerSubject: string;
}) {
  const { code, prenom, nom, email, zone, intro, practitionerSubject } = params;
  const filmageUrl = `${SITE_URL}/filmage.html?code=${code}`;
  await sendEmail(
    email,
    "Votre code d'accès MoveCheck",
    `<p>Bonjour ${prenom},</p>
     <p>${intro} Voici votre code d'accès aux consignes de filmage :</p>
     <p style="font-size:20px;font-weight:bold;">${code}</p>
     <p><a href="${filmageUrl}">Accéder aux consignes de filmage</a></p>
     <p>À bientôt,<br>Nicolas Roger, Ostéopathe D.O.</p>`,
  );
  await sendEmail(
    PRACTITIONER_EMAIL,
    `${practitionerSubject} — ${prenom} ${nom}`,
    `<p>${practitionerSubject} pour ${prenom} ${nom} (${email}).</p>
     <p>Zone : ${zone || "non renseignée"}</p>
     <p>Code : ${code}</p>`,
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email || "";
  const prenom = customField(session, "prenom") || (session.customer_details?.name?.split(" ")[0] ?? "");
  const nom = customField(session, "nom") || (session.customer_details?.name?.split(" ").slice(1).join(" ") ?? "");
  const zone = customField(session, "zone");
  const telephone = session.customer_details?.phone || "";
  const isSubscription = session.mode === "subscription";

  // Idempotent : un webhook Stripe peut être renvoyé plusieurs fois pour le
  // même événement, on ne crée donc le dossier que s'il n'existe pas déjà.
  const { data: existing } = await supabase
    .from("bilans")
    .select("id, code, email_sent")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  let code = existing?.code;
  let abonnementId: string | null = null;

  if (isSubscription && !existing) {
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;

    const { data: existingAbonnement } = await supabase
      .from("abonnements")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (existingAbonnement) {
      abonnementId = existingAbonnement.id;
    } else {
      const { data: newAbonnement, error } = await supabase
        .from("abonnements")
        .insert({ stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, prenom, nom, email })
        .select("id")
        .single();
      if (error || !newAbonnement) {
        console.error("Erreur insertion abonnement:", error);
        return jsonResponse({ error: "db insert failed" }, 500);
      }
      abonnementId = newAbonnement.id;
    }
  }

  if (!existing) {
    code = genCode();
    const { error } = await supabase.from("bilans").insert({
      code,
      stripe_session_id: session.id,
      prenom,
      nom,
      email,
      telephone,
      zone,
      status: "paye",
      kind: isSubscription ? "abonnement" : "ponctuel",
      abonnement_id: abonnementId,
      cycle_number: 1,
    });
    if (error) {
      console.error("Erreur insertion bilan:", error);
      return jsonResponse({ error: "db insert failed" }, 500);
    }
  }

  if (!existing?.email_sent) {
    await sendCodeEmails({
      code: code!,
      prenom,
      nom,
      email,
      zone,
      intro: isSubscription
        ? "Merci pour votre inscription au suivi trimestriel."
        : "Merci pour votre paiement.",
      practitionerSubject: isSubscription ? "Nouvel abonnement MoveCheck" : "Nouvelle demande de bilan MoveCheck",
    });
    await supabase.from("bilans").update({ email_sent: true }).eq("stripe_session_id", session.id);
  }

  return jsonResponse({ received: true, code });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Le tout premier paiement d'un abonnement est déjà traité par
  // checkout.session.completed ; on ne réagit ici qu'aux renouvellements
  // automatiques (cycles suivants, tous les 3 mois).
  if (invoice.billing_reason !== "subscription_cycle") {
    return jsonResponse({ received: true });
  }

  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return jsonResponse({ received: true });

  const { data: abonnement } = await supabase
    .from("abonnements")
    .select("id, prenom, nom, email")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!abonnement) {
    console.error("Abonnement introuvable pour la facture:", invoice.id);
    return jsonResponse({ received: true });
  }

  // Idempotent : une facture ne doit générer qu'un seul rebilan.
  const { data: existingBilan } = await supabase
    .from("bilans")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();
  if (existingBilan) return jsonResponse({ received: true });

  const { data: previousCycles } = await supabase
    .from("bilans")
    .select("cycle_number, zone")
    .eq("abonnement_id", abonnement.id)
    .order("cycle_number", { ascending: false })
    .limit(1);

  const cycleNumber = (previousCycles?.[0]?.cycle_number ?? 0) + 1;
  const zone = previousCycles?.[0]?.zone ?? "";
  const code = genCode();

  const { error } = await supabase.from("bilans").insert({
    code,
    stripe_invoice_id: invoice.id,
    prenom: abonnement.prenom,
    nom: abonnement.nom,
    email: abonnement.email,
    zone,
    status: "paye",
    kind: "abonnement",
    abonnement_id: abonnement.id,
    cycle_number: cycleNumber,
    email_sent: true,
  });
  if (error) {
    console.error("Erreur insertion rebilan:", error);
    return jsonResponse({ error: "db insert failed" }, 500);
  }

  await sendCodeEmails({
    code,
    prenom: abonnement.prenom,
    nom: abonnement.nom,
    email: abonnement.email,
    zone,
    intro: `C'est l'heure de votre rebilan trimestriel (cycle ${cycleNumber}).`,
    practitionerSubject: `Rebilan MoveCheck (cycle ${cycleNumber})`,
  });

  return jsonResponse({ received: true, code });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabase
    .from("abonnements")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);
  return jsonResponse({ received: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error("Signature Stripe invalide:", err);
    return jsonResponse({ error: "invalid signature" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
      return await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    case "invoice.paid":
      return await handleInvoicePaid(event.data.object as Stripe.Invoice);
    case "customer.subscription.deleted":
      return await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      return jsonResponse({ received: true });
  }
});
