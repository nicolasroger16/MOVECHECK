// Utilisé par merci.html juste après le paiement : le webhook Stripe peut
// prendre quelques secondes à traiter, cette fonction est donc interrogée
// en polling jusqu'à ce que le dossier (et son code) existe.
//
// Déploiement : supabase functions deploy get-code --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SITE_URL = Deno.env.get("SITE_URL") || "https://nicolasroger16.github.io/MOVECHECK";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { session_id } = await req.json().catch(() => ({}));
  if (!session_id) return jsonResponse({ error: "session_id requis" }, 400);

  const { data } = await supabase
    .from("bilans")
    .select("code, prenom")
    .eq("stripe_session_id", session_id)
    .maybeSingle();

  if (!data) return jsonResponse({ ready: false });

  return jsonResponse({
    ready: true,
    code: data.code,
    prenom: data.prenom,
    filmageUrl: `${SITE_URL}/filmage.html?code=${data.code}`,
  });
});
