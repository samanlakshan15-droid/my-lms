import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrCreateSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  if (session?.role === "admin") {
    redirect("/admin");
  }

  if (session?.role === "user") {
    redirect("/dashboard");
  }

  const settings = await getOrCreateSiteSettings();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12">
      <section className="w-full rounded-3xl bg-white/90 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500">Online Learning Platform</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-900">{settings.welcomeText}</h1>
        <p className="mt-3 text-slate-700">
          Students can sign up and watch only teacher-approved videos with a controlled timer.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700">
            Student Signup
          </Link>
          <Link href="/login" className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700">
            Student Login
          </Link>
          <Link href="/admin/login" className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100">
            Teacher Login
          </Link>
        </div>
      </section>
    </main>
  );
}
