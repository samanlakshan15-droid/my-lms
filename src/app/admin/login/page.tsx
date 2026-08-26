import { redirect } from "next/navigation";
import { loginAdminAction } from "@/app/actions";
import { getSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (session?.role === "admin") {
    redirect("/admin");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-10">
      <section className="w-full rounded-2xl bg-white/90 p-6 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-bold text-slate-900">Teacher Login</h1>
        {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <form action={loginAdminAction} className="mt-5 space-y-4">
          <input name="username" placeholder="Teacher username" className="w-full rounded-lg border border-slate-300 p-3" required />
          <input name="password" type="password" placeholder="Teacher password" className="w-full rounded-lg border border-slate-300 p-3" required />
          <button className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700" type="submit">
            Login as Teacher
          </button>
        </form>
      </section>
    </main>
  );
}
