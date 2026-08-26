import Link from "next/link";
import { and, eq } from "drizzle-orm";
import WatchPlayer from "@/components/watch-player";
import { db } from "@/db";
import { videoAccess, videos } from "@/db/schema";
import { requireUserSession } from "@/lib/auth";
import { buildYoutubeEmbedUrl, extractYoutubeId } from "@/lib/youtube";

type Params = Promise<{ videoId: string }>;

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Params }) {
  const session = await requireUserSession();
  const { videoId } = await params;
  const parsedVideoId = Number.parseInt(videoId, 10);

  if (!Number.isFinite(parsedVideoId)) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Invalid video request.</p>
      </main>
    );
  }

  const [row] = await db
    .select({ access: videoAccess, video: videos })
    .from(videoAccess)
    .innerJoin(videos, eq(videoAccess.videoId, videos.id))
    .where(and(eq(videoAccess.userId, session.user.id), eq(videoAccess.videoId, parsedVideoId)))
    .limit(1);

  if (!row) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">You do not have access to this video.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">Back to dashboard</Link>
      </main>
    );
  }

  const now = new Date();
  let expiresAt = row.access.expiresAt;
  let watchStartedAt = row.access.watchStartedAt;

  if (!watchStartedAt || !expiresAt) {
    watchStartedAt = now;
    expiresAt = new Date(now.getTime() + row.access.allowedSeconds * 1000);

    await db
      .update(videoAccess)
      .set({ watchStartedAt, expiresAt, updatedAt: new Date() })
      .where(eq(videoAccess.id, row.access.id));
  }

  if (expiresAt.getTime() <= Date.now()) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Your viewing time has expired. Contact your teacher to extend access.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">Back to dashboard</Link>
      </main>
    );
  }

  const youtubeId = extractYoutubeId(row.video.youtubeUrl);
  if (!youtubeId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Video source is invalid. Please inform admin.</p>
      </main>
    );
  }

  const embedUrl = buildYoutubeEmbedUrl(youtubeId);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <div className="mb-4">
        <Link href="/dashboard" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          ← Back to Dashboard
        </Link>
      </div>
      <WatchPlayer title={row.video.title} embedUrl={embedUrl} expiresAtIso={expiresAt.toISOString()} />
    </main>
  );
}
