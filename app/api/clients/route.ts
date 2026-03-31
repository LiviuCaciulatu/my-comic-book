import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CreateClientPayload = {
  email?: string;
  password?: string;
  fullName?: string;
  preferredLanguage?: string;
  consentAccepted?: boolean;
};

function normalizeText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value?: string) {
  const email = normalizeText(value)?.toLowerCase();
  return email ?? null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateClientPayload;
    const email = normalizeEmail(payload.email);
    const password = normalizeText(payload.password);
    const fullName = normalizeText(payload.fullName);
    const preferredLanguage = normalizeText(payload.preferredLanguage) ?? "en";
    const consentAccepted = Boolean(payload.consentAccepted);

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "email, password, and fullName are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          preferred_language: preferredLanguage,
        },
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Could not create auth user." },
        { status: 500 },
      );
    }

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        preferred_language: preferredLanguage,
        consent_accepted: consentAccepted,
        consent_timestamp: consentAccepted ? new Date().toISOString() : null,
      })
      .select("id, email, full_name, preferred_language, created_at")
      .single();

    if (clientError) {
      await supabase.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: clientError.message || "Could not create client profile." },
        { status: 500 },
      );
    }

    const { error: walletError } = await supabase
      .from("token_wallet")
      .insert({ client_id: authData.user.id });

    if (walletError) {
      console.error("Could not create wallet:", walletError.message);
    }

    return NextResponse.json({
      client: clientData,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to create user." },
      { status: 500 },
    );
  }
}