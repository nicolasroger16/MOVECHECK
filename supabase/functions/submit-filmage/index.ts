// Appelée une fois que le patient a uploadé ses vidéos et rempli ses
// observations : marque le dossier comme "filmé", ce qui le fait remonter
// sur le mur du praticien (dashboard.html, abonné en temps réel).
//
// Déploiement : supabase functions deploy submit-filmage --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "MoveCheck <onboarding@resend.dev>";
const PRACTITIONER_EMAIL = Deno.env.get("PRACTITIONER_EMAIL") || "nicolasroger16@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { code, observations, videos } = await req.json().catch(() => ({}));
  if (!code || !Array.isArray(videos)) {
    return jsonResponse({ error: "code et videos requis" }, 400);
  }

  const { data: bilan } = await supabase
    .from("bilans")
    .select("id, prenom, nom")
    .eq("code", code)
    .maybeSingle();

  if (!bilan) return jsonResponse({ error: "code invalide" }, 404);

  const { error } = await supabase
    .from("bilans")
    .update({
      observations: observations || {},
      videos,
      status: "filme",
      filmed_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) return jsonResponse({ error: "échec de la mise à jour" }, 500);

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: PRACTITIONER_EMAIL,
        subject: `Vidéos reçues — ${bilan.prenom} ${bilan.nom}`,
        html: `<p>${bilan.prenom} ${bilan.nom} a terminé son filmage (code ${code}). Les vidéos et observations sont disponibles sur le dashboard.</p>`,
      }),
    }).catch(() => {});
  }

  return jsonResponse({ ok: true });
});
