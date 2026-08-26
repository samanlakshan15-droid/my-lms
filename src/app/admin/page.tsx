import { eq, ilike, or } from "drizzle-orm";
import {
  createTeacherAccountAction,
  createVideoAction,
  grantVideoAccessAction,
  logoutAction,
  removeTeacherAccountAction,
  removeVideoAccessAction,
  updateSiteSettingsAction,
  updateVideoAction,
} from "@/app/actions";
import { db } from "@/db";
import { siteSettings, teacherAccounts, users, videoAccess, videos } from "@/db/schema";
import { requireTeacherSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireTeacherSession();

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const userRows = q
    ? await db
        .select()
        .from(users)
        .where(
          or(
            ilike(users.fullName, `%${q}%`),
            ilike(users.idNo, `%${q}%`),
            ilike(users.email, `%${q}%`),
          ),
        )
    : await db.select().from(users);

  const videoRows = await db.select().from(videos);
  const accessRows = await db.select().from(videoAccess);
  const teacherRows = await db.select().from(teacherAccounts);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teacher Dashboard</h1>
          <p className="text-sm text-slate-600">Manage users, videos, access time, teacher logins, and website theme.</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white">Logout</button>
        </form>
      </header>

      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p> : null}
      {success ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-700">{success}</p> : null}

      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Add New Video</h2>
          <form action={createVideoAction} className="mt-4 space-y-3">
            <input name="title" placeholder="Video title" className="w-full rounded-lg border border-slate-300 p-3" required />
            <input name="youtubeUrl" placeholder="YouTube unlisted URL or video ID" className="w-full rounded-lg border border-slate-300 p-3" required />
            <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white" type="submit">Add Video</button>
          </form>
        </article>

        <article className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Website Theme & Content</h2>
          <form action={updateSiteSettingsAction} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">Background Color</label>
            <input name="backgroundColor" defaultValue={settings?.backgroundColor ?? "#f1f5f9"} className="w-full rounded-lg border border-slate-300 p-3" />
            <label className="block text-sm font-medium text-slate-700">Text Color</label>
            <input name="textColor" defaultValue={settings?.textColor ?? "#0f172a"} className="w-full rounded-lg border border-slate-300 p-3" />
            <label className="block text-sm font-medium text-slate-700">Background Image URL</label>
            <input name="backgroundImageUrl" defaultValue={settings?.backgroundImageUrl ?? ""} placeholder="https://..." className="w-full rounded-lg border border-slate-300 p-3" />
            <label className="block text-sm font-medium text-slate-700">Welcome Text</label>
            <input name="welcomeText" defaultValue={settings?.welcomeText ?? "Welcome to the LMS"} className="w-full rounded-lg border border-slate-300 p-3" />
            <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white" type="submit">Update Website</button>
          </form>
        </article>
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Add Teacher Login</h2>
          <form action={createTeacherAccountAction} className="mt-4 space-y-3">
            <input name="username" placeholder="Teacher username" className="w-full rounded-lg border border-slate-300 p-3" required />
            <input name="password" type="password" minLength={6} placeholder="Teacher password (min 6)" className="w-full rounded-lg border border-slate-300 p-3" required />
            <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white" type="submit">Create Teacher Login</button>
          </form>
        </article>

        <article className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Existing Teacher Logins</h2>
          {teacherRows.length === 0 ? (
            <p className="text-sm text-slate-600">No extra teacher logins yet. Default teacher login remains available.</p>
          ) : (
            <div className="space-y-2">
              {teacherRows.map((teacher) => (
                <form key={teacher.id} action={removeTeacherAccountAction} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{teacher.username}</p>
                    <p className="text-xs text-slate-600">Created: {teacher.createdAt.toLocaleString()}</p>
                  </div>
                  <input type="hidden" name="teacherId" value={teacher.id} />
                  <button type="submit" className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Remove</button>
                </form>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="mb-6 rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Manage Videos</h2>
        {videoRows.length === 0 ? (
          <p className="text-slate-600">No videos added yet.</p>
        ) : (
          <div className="space-y-3">
            {videoRows.map((video) => (
              <form key={video.id} action={updateVideoAction} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[80px_1fr_1fr_auto] md:items-center">
                <input type="hidden" name="videoId" value={video.id} />
                <span className="text-sm font-semibold text-slate-600">#{video.id}</span>
                <input name="title" defaultValue={video.title} className="rounded-lg border border-slate-300 p-2" required />
                <input name="youtubeUrl" defaultValue={video.youtubeUrl} className="rounded-lg border border-slate-300 p-2" required />
                <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">Save</button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Users & Video Access Time</h2>
          <form method="get" action="/admin" className="flex flex-wrap items-center gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name, ID number, or email"
              className="w-72 rounded-lg border border-slate-300 p-2"
            />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Filter</button>
            <a href="/admin" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Clear</a>
          </form>
        </div>

        {userRows.length === 0 ? (
          <p className="text-slate-600">No users found.</p>
        ) : (
          <div className="space-y-4">
            {userRows.map((user) => {
              const userAccessRows = accessRows.filter((a) => a.userId === user.id);

              return (
                <article key={user.id} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">{user.fullName}</h3>
                  <p className="text-sm text-slate-600">ID: {user.idNo} | Email: {user.email}</p>

                  <div className="mt-3 space-y-2">
                    {userAccessRows.length === 0 ? (
                      <p className="text-sm text-slate-500">No video access yet.</p>
                    ) : (
                      userAccessRows.map((access) => {
                        const video = videoRows.find((v) => v.id === access.videoId);
                        return (
                          <div key={access.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                            <p className="text-sm text-slate-700">
                              {video?.title ?? `Video #${access.videoId}`} - {Math.round(access.allowedSeconds / 60)} minutes
                              {access.expiresAt ? ` (expires ${access.expiresAt.toLocaleString()})` : " (not started)"}
                            </p>
                            <form action={removeVideoAccessAction}>
                              <input type="hidden" name="accessId" value={access.id} />
                              <button type="submit" className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">
                                Remove Access
                              </button>
                            </form>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form action={grantVideoAccessAction} className="mt-4 grid gap-2 md:grid-cols-[1fr_140px_auto]">
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="videoId" className="rounded-lg border border-slate-300 p-2" required defaultValue="">
                      <option value="" disabled>Select video</option>
                      {videoRows.map((video) => (
                        <option key={video.id} value={video.id}>{video.title}</option>
                      ))}
                    </select>
                    <input name="minutes" type="number" min={1} defaultValue={30} className="rounded-lg border border-slate-300 p-2" required />
                    <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Grant / Add Time</button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
