import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { videoAccess } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session || session.role !== "user" || !session.user) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { accessId?: number; consumedSeconds?: number };
    const accessId = Number(body.accessId);
    const consumedSeconds = Number(body.consumedSeconds);

    if (!Number.isFinite(accessId) || !Number.isFinite(consumedSeconds) || consumedSeconds <= 0) {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const delta = Math.min(Math.floor(consumedSeconds), 30);

    const [row] = await db
      .select()
      .from(videoAccess)
      .where(and(eq(videoAccess.id, accessId), eq(videoAccess.userId, session.user.id)))
      .limit(1);

    if (!row) {
      return Response.json({ ok: false, error: "Access record not found" }, { status: 404 });
    }

    const nextUsed = Math.min(row.allowedSeconds, row.usedSeconds + delta);

    await db
      .update(videoAccess)
      .set({
        usedSeconds: nextUsed,
        watchStartedAt: row.watchStartedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoAccess.id, row.id));

    return Response.json({ ok: true, remainingSeconds: Math.max(0, row.allowedSeconds - nextUsed) });
  } catch {
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
