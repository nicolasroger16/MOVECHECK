// Utilisé par filmage.html pour valider un code d'accès et afficher un
// accueil personnalisé, sans exposer les données des autres patients.
//
// Déploiement : supabase functions deploy get-bilan --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { code } = await req.json().catch(() => ({}));
  if (!code) return jsonResponse({ error: "code requis" }, 400);

  const { data } = await supabase
    .from("bilans")
    .select("prenom, status, videos")
    .eq("code", code)
    .maybeSingle();

  if (!data) return jsonResponse({ valid: false }, 404);

  return jsonResponse({
    valid: true,
    prenom: data.prenom,
    status: data.status,
    videos: data.videos,
  });
});
