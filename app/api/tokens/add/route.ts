import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // Identify the calling user from their session cookie
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const amount = Number(body.amount);

  if (!Number.isInteger(amount) || amount < 1) {
    return NextResponse.json(
      { error: "amount must be a positive integer." },
      { status: 400 }
    );
  }

  // Service-role client bypasses RLS
  const admin = createSupabaseAdminClient();

  // 1. Fetch current balance
  const { data: wallet, error: fetchError } = await admin
    .from("token_wallet")
    .select("balance")
    .eq("client_id", user.id)
    .single();

  if (fetchError || !wallet) {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }

  // 2. Update balance
  const { error: updateError } = await admin
    .from("token_wallet")
    .update({
      balance: wallet.balance + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update wallet." },
      { status: 500 }
    );
  }

  // 3. Record the transaction
  const { error: txError } = await admin.from("token_transactions").insert({
    client_id: user.id,
    amount,
    type: "purchase",
    description: `Manual top-up of ${amount} token${amount === 1 ? "" : "s"}.`,
  });

  if (txError) {
    // Non-fatal: wallet was updated; log and continue
    console.error("token_transactions insert failed:", txError);
  }

  return NextResponse.json({ success: true, added: amount });
}
