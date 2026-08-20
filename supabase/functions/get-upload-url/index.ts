// Fournit à filmage.html une URL signée pour uploader une vidéo directement
// dans le bucket privé "videos", sans exposer la clé service_role au
// navigateur du patient.
//
// Déploiement : supabase functions deploy get-upload-url --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { code, fileName } = await req.json().catch(() => ({}));
  if (!code || !fileName) return jsonResponse({ error: "code et fileName requis" }, 400);

  const { data: bilan } = await supabase
    .from("bilans")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (!bilan) return jsonResponse({ error: "code invalide" }, 404);

  const path = `${code}/${Date.now()}-${fileName}`;
  const { data, error } = await supabase.storage.from("videos").createSignedUploadUrl(path);

  if (error || !data) return jsonResponse({ error: "impossible de créer l'URL d'upload" }, 500);

  return jsonResponse({ signedUrl: data.signedUrl, token: data.token, path });
});
