import Link from "next/link";
import { signupAction } from "@/app/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-10">
      <section className="w-full rounded-2xl bg-white/90 p-6 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-bold text-slate-900">Student Signup</h1>
        {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <form action={signupAction} className="mt-5 space-y-4">
          <input name="fullName" placeholder="Full name" className="w-full rounded-lg border border-slate-300 p-3" required />
          <input name="idNo" placeholder="ID number" className="w-full rounded-lg border border-slate-300 p-3" required />
          <input name="email" type="email" placeholder="Email" className="w-full rounded-lg border border-slate-300 p-3" required />
          <input name="password" type="password" placeholder="Password (min 6)" className="w-full rounded-lg border border-slate-300 p-3" required minLength={6} />
          <button className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700" type="submit">
            Create Account
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-700">
          Already registered? <Link className="font-semibold text-indigo-600" href="/login">Login here</Link>
        </p>
      </section>
    </main>
  );
}
