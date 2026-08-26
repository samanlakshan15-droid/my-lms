import Link from "next/link";
import { loginUserAction } from "@/app/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-10">
      <section className="w-full rounded-2xl bg-white/90 p-6 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-bold text-slate-900">Student Login</h1>
        {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p> : null}

        <form action={loginUserAction} className="mt-5 space-y-4">
          <input name="email" type="email" placeholder="Email" className="w-full rounded-lg border border-slate-300 p-3" required />
          <input name="password" type="password" placeholder="Password" className="w-full rounded-lg border border-slate-300 p-3" required />
          <button className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700" type="submit">
            Login
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link className="font-semibold text-indigo-600" href="/signup">Create new account</Link>
          <Link className="font-semibold text-slate-700" href="/admin/login">Teacher Login</Link>
        </div>
      </section>
    </main>
  );
}
