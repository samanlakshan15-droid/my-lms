import Link from "next/link";
import { eq } from "drizzle-orm";
import { logoutAction } from "@/app/actions";
import { db } from "@/db";
import { videoAccess, videos } from "@/db/schema";
import { requireUserSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatMinutes(seconds: number) {
  return Math.ceil(seconds / 60);
}

export default async function DashboardPage() {
  const session = await requireUserSession();

  const rows = await db
    .select({ access: videoAccess, video: videos })
    .from(videoAccess)
    .innerJoin(videos, eq(videoAccess.videoId, videos.id))
    .where(eq(videoAccess.userId, session.user.id));

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Dashboard</h1>
          <p className="text-sm text-slate-700">
            Welcome, {session.user.fullName} ({session.user.idNo})
          </p>
        </div>
        <form action={logoutAction}>
          <button className="rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700" type="submit">
            Logout
          </button>
        </form>
      </header>

      <section className="rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Your Accessible Videos</h2>
        {rows.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-700">No video access yet. Please contact your teacher.</p>
        ) : (
          <div className="grid gap-3">
            {rows.map(({ access, video }) => {
              const remaining = Math.max(0, access.allowedSeconds - access.usedSeconds);
              const isExpired = remaining <= 0;

              return (
                <article key={access.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">{video.title}</h3>
                  <p className="text-sm text-slate-600">Allocated Time: {formatMinutes(access.allowedSeconds)} minutes</p>
                  <p className={`mt-1 text-sm ${isExpired ? "text-red-700" : "text-emerald-700"}`}>
                    {isExpired ? "Expired" : `Remaining Time: ${formatMinutes(remaining)} minutes`}
                  </p>

                  <div className="mt-3">
                    <Link href={`/watch/${video.id}`} className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                      Open in LMS Player
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
