import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function GET() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const [clientResult, walletResult] = await Promise.all([
    admin.from("clients").select("full_name").eq("id", user.id).single(),
    admin
      .from("token_wallet")
      .select("balance")
      .eq("client_id", user.id)
      .single(),
  ]);

  return NextResponse.json({
    fullName: clientResult.data?.full_name ?? user.email ?? "User",
    balance: walletResult.data?.balance ?? 0,
  });
}
