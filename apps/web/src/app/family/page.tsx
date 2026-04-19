"use client";

import {
  Activity,
  ArrowUpRight,
  Bell,
  Brain,
  ChevronLeft,
  ChevronRight,
  Home,
  Orbit,
  RefreshCw,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { usePollingResource } from "@/hooks/use-polling-resource";
import { apiRequest } from "@/lib/api";
import type { ActivityPoint, AssetSnapshot, Metrics, Subject } from "@/lib/types";

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(target * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [duration, target]);

  return value;
}

function MetricTile({
  label,
  hint,
  value,
  decimals = 0,
}: {
  label: string;
  hint: string;
  value: number;
  decimals?: number;
}) {
  const animated = useCountUp(value);

  return (
    <article className="rounded-[1.7rem] border border-white/40 bg-white/36 p-5 backdrop-blur-3xl transition hover:border-white/70 hover:shadow-[0_0_30px_rgba(243,199,111,0.22)]">
      <p className="font-data text-[11px] uppercase tracking-[0.32em] text-slate-500">{label}</p>
      <p className="mt-5 font-data text-4xl tracking-[-0.08em] text-slate-900">
        {animated.toFixed(decimals)}
      </p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </article>
  );
}

export default function FamilyPage() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const activeResource = usePollingResource<{ subject: Subject }>("/api/subjects/active", 3000);
  const subject = activeResource.data?.subject ?? null;
  const metricsResource = usePollingResource<{ metrics: Metrics }>(
    subject ? `/api/subjects/${subject.id}/metrics` : null,
    3000,
  );
  const activityResource = usePollingResource<{ items: ActivityPoint[] }>(
    subject ? `/api/subjects/${subject.id}/activity-series` : null,
    3000,
  );
  const assetResource = usePollingResource<{ asset: AssetSnapshot | null }>(
    subject ? `/api/subjects/${subject.id}/assets/latest` : null,
    3000,
  );

  const metrics = metricsResource.data?.metrics ?? null;
  const activity = activityResource.data?.items ?? [];
  const asset = assetResource.data?.asset ?? null;
  const familyCode = asset?.payload_json.family_code;
  const maxBar = Math.max(...activity.map((item) => item.characters), 1);

  async function refreshAll() {
    await Promise.all([
      activeResource.refresh(),
      metricsResource.refresh(),
      activityResource.refresh(),
      assetResource.refresh(),
    ]);
  }

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function generateAsset() {
    if (!subject) {
      return;
    }

    setIsGenerating(true);
    try {
      await apiRequest(`/api/subjects/${subject.id}/assets/generate`, {
        method: "POST",
        body: JSON.stringify({ source_interaction_id: null }),
      });
      await refreshAll();
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#ebf1f4] text-slate-900">
      <div className="absolute inset-0 scale-110 bg-[url('https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1600')] bg-cover bg-center opacity-25 blur-2xl brightness-105" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(245,248,250,0.92),rgba(226,235,241,0.94))]" />
      <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-white/75 blur-[120px]" />
      <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-amber-200/35 blur-[140px]" />
      <div className="absolute bottom-8 right-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-[120px]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] gap-6 px-5 py-5">
        <aside className="family-float-slow hidden w-[92px] shrink-0 self-start rounded-[2rem] border border-white/35 bg-white/28 px-4 py-5 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_24px_80px_rgba(36,64,90,0.12)] md:flex md:flex-col md:items-center md:justify-between">
          <div className="space-y-4">
            {[
              { icon: Orbit, label: "跳转到家庭总览", action: () => scrollToSection("family-overview") },
              { icon: UserRound, label: "跳转到当前对象", action: () => scrollToSection("family-subject") },
              { icon: Brain, label: "跳转到指标区", action: () => scrollToSection("family-metrics") },
              { icon: Shield, label: "跳转到家族法典", action: () => scrollToSection("family-asset") },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                onClick={item.action}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/45 bg-white/42 text-slate-700 transition hover:border-white/70 hover:text-slate-900 hover:shadow-[0_0_24px_rgba(243,199,111,0.16)]"
              >
                <item.icon className="h-5 w-5" />
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="同步家族法典"
            onClick={() => void generateAsset()}
            disabled={!subject || isGenerating}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/55 bg-white/42 text-amber-700 transition hover:shadow-[0_0_24px_rgba(243,199,111,0.2)] disabled:opacity-50"
          >
            {isGenerating ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </button>
        </aside>

        <div className="flex-1 space-y-6">
          <header className="family-float rounded-full border border-white/35 bg-white/28 px-4 py-3 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_80px_rgba(36,64,90,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/40 bg-white/40 px-3 py-2">
                  <button
                    type="button"
                    aria-label="返回首页"
                    onClick={() => router.push("/")}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <Home className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="跳转到当前对象"
                    onClick={() => scrollToSection("family-subject")}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="跳转到家族法典"
                    onClick={() => scrollToSection("family-asset")}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-[260px] rounded-full border border-white/40 bg-white/40 px-4 py-3 text-sm text-slate-600">
                  family.hippoark / {subject ? `${subject.code} ${subject.display_name}` : "当前家庭观察"}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="刷新家庭端数据"
                  onClick={() => void refreshAll()}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/42 text-slate-600 transition hover:border-white/70 hover:text-slate-900"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="跳转到页面说明"
                  onClick={() => scrollToSection("family-note")}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/42 text-slate-600 transition hover:border-white/70 hover:text-slate-900"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <button
                  onClick={generateAsset}
                  disabled={!subject || isGenerating}
                  className="flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/14 px-4 py-2 text-sm text-slate-800 transition hover:border-cyan-400/65 hover:shadow-[0_0_28px_rgba(75,198,255,0.18)] disabled:opacity-50"
                >
                  {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  同步《家族法典》
                </button>
              </div>
            </div>
          </header>

          <section id="family-overview" className="grid grid-cols-12 gap-6">
            <aside
              id="family-subject"
              className="family-float col-span-12 rounded-[2rem] border border-white/35 bg-white/28 p-5 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_24px_80px_rgba(36,64,90,0.12)] md:col-span-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-500">家庭视图</p>
                  <h2 className="cjk-heading mt-3 text-xl font-semibold text-slate-900">当前观察对象</h2>
                </div>
                <UserRound className="h-5 w-5 text-amber-600" />
              </div>

              <div className="mt-6 rounded-[1.4rem] border border-white/45 bg-white/42 p-4">
                <p className="font-data text-[10px] uppercase tracking-[0.26em] text-slate-500">受试者编号</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-900">
                  {subject?.code ?? "等待激活"}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {subject ? subject.display_name : "研究人员尚未在控制台激活受试者。"}
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {["认知辅助指标", "表达活跃趋势", "家族法典结构", "双流同步状态"].map((label, index) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-full border border-white/45 bg-white/34 px-3 py-3 text-sm text-slate-700"
                  >
                    <span className="font-data text-xs text-slate-500">0{index + 1}</span>
                    {label}
                  </div>
                ))}
              </div>

              <div id="family-note" className="mt-6 border-t border-white/35 pt-6">
                <p className="font-data text-[11px] uppercase tracking-[0.3em] text-slate-500">说明</p>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  家庭端只读取当前激活对象的逻辑流指标与资产流快照，不涉及实验人员后台的编辑权限。
                </p>
              </div>
            </aside>

            <section className="col-span-12 space-y-6 md:col-span-9">
              <div id="family-metrics" className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-3">
                  <MetricTile label="TTR" hint="词汇丰富度" value={metrics?.ttr ?? 0} decimals={2} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <MetricTile label="MLU" hint="平均语句长度" value={metrics?.mlu ?? 0} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <MetricTile label="UNIQUE" hint="独立词汇数" value={metrics?.unique_words ?? 0} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <MetricTile label="FLOW" hint="有效转录条目" value={metrics?.transcript_count ?? 0} />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6">
                <article className="family-float col-span-12 rounded-[2rem] border border-white/35 bg-white/28 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_24px_80px_rgba(36,64,90,0.12)] md:col-span-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-500">逻辑流</p>
                      <h2 className="cjk-heading mt-3 text-2xl font-semibold text-slate-900">表达活跃度与记录密度</h2>
                    </div>
                    <Activity className="h-5 w-5 text-cyan-600" />
                  </div>

                  <div className="mt-8 flex h-60 items-end gap-3 overflow-hidden rounded-[1.5rem] border border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(223,234,241,0.32))] px-4 pb-4 pt-8">
                    {activity.length ? (
                      activity.slice(-8).map((item, index) => (
                        <div key={item.interaction_id} className="flex flex-1 flex-col items-center gap-3">
                          <div className="relative flex w-full items-end justify-center">
                            <div
                              className="absolute bottom-0 w-4/5 rounded-full bg-amber-300/42"
                              style={{ height: `${Math.max(18, (item.characters / maxBar) * 120)}px` }}
                            />
                            <div
                              className="relative w-3/5 rounded-full bg-cyan-400/75 shadow-[0_0_28px_rgba(75,198,255,0.24)]"
                              style={{
                                height: `${Math.max(28, (item.characters / maxBar) * 150)}px`,
                                animation: `slow-float ${4 + index * 0.25}s ease-in-out infinite`,
                              }}
                            />
                          </div>
                          <span className="font-data text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            {item.label}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                        等待老年端录音数据进入系统。
                      </div>
                    )}
                  </div>
                </article>

                <article
                  id="family-asset"
                  className="family-float col-span-12 rounded-[2rem] border border-white/35 bg-white/28 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_24px_80px_rgba(36,64,90,0.12)] md:col-span-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-500">资产流</p>
                      <h2 className="cjk-heading mt-3 text-2xl font-semibold text-slate-900">最新《家族法典》</h2>
                    </div>
                    <Shield className="h-5 w-5 text-amber-600" />
                  </div>

                  {familyCode ? (
                    <div className="mt-6 space-y-6">
                      <div>
                        <p className="font-data text-[10px] uppercase tracking-[0.24em] text-amber-700">事实层</p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {familyCode.fact_layer?.time_period ?? "系统尚未提炼出清晰的时间线描述。"}
                        </p>
                      </div>
                      <div>
                        <p className="font-data text-[10px] uppercase tracking-[0.24em] text-amber-700">归因层</p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {familyCode.attribution_layer?.driving_motivation ?? "系统仍需更多叙事材料。"}
                        </p>
                      </div>
                      <div>
                        <p className="font-data text-[10px] uppercase tracking-[0.24em] text-amber-700">智慧层</p>
                        <blockquote className="mt-2 border-l border-amber-400/80 pl-4 text-base leading-8 text-slate-900">
                          {familyCode.wisdom_layer?.family_motto ?? "系统仍需更多叙事材料。"}
                        </blockquote>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 text-sm leading-7 text-slate-500">
                      当前还没有结构化资产快照。点击右上角按钮即可同步最新《家族法典》。
                    </div>
                  )}

                  <div className="mt-8 flex items-center gap-2 text-sm text-slate-700">
                    家庭端与研究端后台保持同一条数据链路
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </article>
              </div>
            </section>
          </section>
        </div>
      </main>

      <style jsx>{`
        @keyframes family-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes family-float-slow {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-12px);
          }
        }

        .family-float {
          animation: family-float 9s ease-in-out infinite;
        }

        .family-float-slow {
          animation: family-float-slow 11s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
