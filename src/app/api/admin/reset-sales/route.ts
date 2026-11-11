import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const confirmation = String(body.confirmation || "").trim();
    const resetExpenses = Boolean(body.resetExpenses);

    if (confirmation !== "RESET") {
      return NextResponse.json(
        { error: "Confirmation keyword mismatch. Please type RESET to proceed." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Delete returns & sales_returns
    await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("sales_returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 2. Delete payments
    await supabase.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 3. Delete order_items
    await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 4. Delete orders
    const { error: ordersError } = await supabase
      .from("orders")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (ordersError) {
      return NextResponse.json(
        {
          error:
            "Direct API delete restricted by Supabase RLS. Please run reset_sales_and_dues.sql in your Supabase SQL Editor.",
          details: ordersError.message,
        },
        { status: 403 }
      );
    }

    // 5. Optional: Delete expenses
    if (resetExpenses) {
      await supabase.from("expenses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "All previous sales, dues, payments, returns, and profits have been completely reset to zero.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
