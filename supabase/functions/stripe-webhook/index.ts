// Reçoit les événements Stripe (checkout.session.completed) après paiement
// du bilan MoveCheck, crée le dossier patient, génère son code d'accès et
// lui envoie l'email de confirmation.
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

  if (event.type !== "checkout.session.completed") {
    return jsonResponse({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email || "";
  const prenom = customField(session, "prenom") || (session.customer_details?.name?.split(" ")[0] ?? "");
  const nom = customField(session, "nom") || (session.customer_details?.name?.split(" ").slice(1).join(" ") ?? "");
  const zone = customField(session, "zone");
  const telephone = session.customer_details?.phone || "";

  // Idempotent : un webhook Stripe peut être renvoyé plusieurs fois pour le
  // même événement, on ne crée donc le dossier que s'il n'existe pas déjà.
  const { data: existing } = await supabase
    .from("bilans")
    .select("id, code, email_sent")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  let code = existing?.code;

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
    });
    if (error) {
      console.error("Erreur insertion bilan:", error);
      return jsonResponse({ error: "db insert failed" }, 500);
    }
  }

  if (!existing?.email_sent) {
    const filmageUrl = `${SITE_URL}/filmage.html?code=${code}`;
    const sent = await sendEmail(
      email,
      "Votre code d'accès MoveCheck",
      `<p>Bonjour ${prenom},</p>
       <p>Merci pour votre paiement. Voici votre code d'accès aux consignes de filmage :</p>
       <p style="font-size:20px;font-weight:bold;">${code}</p>
       <p><a href="${filmageUrl}">Accéder aux consignes de filmage</a></p>
       <p>À bientôt,<br>Nicolas Roger, Ostéopathe D.O.</p>`,
    );
    await sendEmail(
      PRACTITIONER_EMAIL,
      `Nouvelle demande de bilan MoveCheck — ${prenom} ${nom}`,
      `<p>Nouvelle demande payée par ${prenom} ${nom} (${email}).</p>
       <p>Zone : ${zone || "non renseignée"}</p>
       <p>Code : ${code}</p>`,
    );
    if (sent) {
      await supabase.from("bilans").update({ email_sent: true }).eq("stripe_session_id", session.id);
    }
  }

  return jsonResponse({ received: true, code });
});
