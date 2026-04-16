"use client";

import { LockKeyhole, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiRequest } from "@/lib/api";

export default function ResearchLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("researcher");
  const [password, setPassword] = useState("hippoark2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push("/research/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--hud-bg)] text-slate-100">
      <div className="absolute inset-0 scale-110 bg-[url('https://images.pexels.com/photos/325229/pexels-photo-325229.jpeg?auto=compress&cs=tinysrgb&w=1600')] bg-cover bg-center opacity-16 blur-2xl brightness-50" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,20,0.9),rgba(5,8,20,0.98))]" />
      <div className="absolute inset-0 ambient-grid opacity-25" />
      <div className="absolute left-8 top-16 h-64 w-64 rounded-full bg-cyan-400/18 blur-[120px]" />
      <div className="absolute right-12 top-24 h-72 w-72 rounded-full bg-amber-300/16 blur-[140px]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1400px] items-center justify-center px-6 py-10">
        <div className="grid w-full grid-cols-12 gap-6">
          <section className="rounded-[2rem] border border-white/10 bg-slate-800/28 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_rgba(0,0,0,0.36)] col-span-12 md:col-span-5">
            <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">实验人员入口</p>
            <h1 className="mt-4 text-6xl font-black leading-[0.88] tracking-[-0.08em] text-slate-100">
              控制台
              <br />
              鉴权登录
            </h1>
            <p className="mt-6 max-w-md text-base leading-8 text-slate-300/78">
              只有实验人员入口需要鉴权。登录后可切换受试者、下发追问、查看实时转录并进行 WoZ 人工覆写。
            </p>
            <div className="mt-10 flex items-center gap-3 text-sm text-slate-300/74">
              <LockKeyhole className="h-4 w-4 text-amber-300" />
              未配置环境变量时，默认本地账号为 researcher / hippoark2026
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-800/32 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_rgba(0,0,0,0.36)] col-span-12 md:col-span-7">
            <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-5">
              <div className="col-span-12">
                <label className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">用户名</label>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-3 w-full rounded-[1.4rem] border border-white/10 bg-slate-950/45 px-5 py-4 text-slate-100 outline-none transition focus:border-amber-300/60"
                />
              </div>
              <div className="col-span-12">
                <label className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-3 w-full rounded-[1.4rem] border border-white/10 bg-slate-950/45 px-5 py-4 text-slate-100 outline-none transition focus:border-amber-300/60"
                />
              </div>
              {error && <p className="col-span-12 text-sm text-red-300">{error}</p>}
              <div className="col-span-12 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-5 py-3 text-sm text-slate-100 transition hover:border-cyan-300/60 hover:shadow-[0_0_28px_rgba(73,196,255,0.3)] disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? "登录中…" : "进入控制台"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
