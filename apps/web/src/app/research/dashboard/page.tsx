"use client";

import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Bell,
  Brain,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  Orbit,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { usePollingResource } from "@/hooks/use-polling-resource";
import { apiRequest } from "@/lib/api";
import type { ActivityPoint, AssetSnapshot, Interaction, Metrics, Subject } from "@/lib/types";

const qaLibrary = [
  {
    id: "weather",
    title: "气象经验",
    prompt: "以前没有天气预报，您出海前是怎么判断天气的？",
    intent: "帮助系统提取经验判断、自然观察方法与长期积累下来的生存技巧。",
  },
  {
    id: "craft",
    title: "手艺传承",
    prompt: "村里以前谁的手艺最好，您从他身上学到了什么？",
    intent: "引出师徒关系、社区互助与技艺如何在生活中被传下来。",
  },
  {
    id: "family-rules",
    title: "家风家规",
    prompt: "小时候家里有没有特别严格的家规或者做事规矩？",
    intent: "更容易提取家族秩序、价值观边界与日常行为准则。",
  },
  {
    id: "pride",
    title: "高光时刻",
    prompt: "您年轻时最自豪的一件事是什么？",
    intent: "用正向回忆带出自我效能、责任感与可讲述的代表性经历。",
  },
  {
    id: "motto",
    title: "留给晚辈",
    prompt: "如果给现在的晚辈留一句话，您最想告诉他们什么？",
    intent: "直接触达智慧层，帮助系统生成更像长辈口吻的传承箴言。",
  },
  {
    id: "hardship",
    title: "逆境应对",
    prompt: "遇到最困难的年月，家里是怎么熬过来的？",
    intent: "适合萃取家庭责任、行动策略与在困境中形成的经验逻辑。",
  },
];

const interventionPrompts = [
  { label: "晚辈求教", transcript: "这个我还真不懂，您能再多讲讲吗？", speaker: "ai" as const },
  { label: "情绪安抚", transcript: "我们先慢一点，挑一段让您舒服的回忆继续说。", speaker: "system" as const },
  { label: "价值肯定", transcript: "您说的这些细节很珍贵，对后辈来说就是能传下去的经验。", speaker: "ai" as const },
];

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
    <article className="rounded-[1.7rem] border border-white/10 bg-slate-900/28 p-4 transition hover:border-white/20 hover:shadow-[0_0_28px_rgba(243,199,111,0.18)]">
      <p className="font-data text-[11px] uppercase tracking-[0.32em] text-slate-400">{label}</p>
      <p className="mt-5 font-data text-4xl tracking-[-0.08em] text-slate-100">
        {animated.toFixed(decimals)}
      </p>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </article>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "刚刚";
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResearchDashboardPage() {
  const router = useRouter();
  const meResource = usePollingResource<{ user: { id: number; username: string } }>("/api/auth/me", 12000);
  const subjectsResource = usePollingResource<{ subjects: Subject[]; active_subject_id: number | null }>(
    "/api/subjects",
    2500,
  );
  const subjects = subjectsResource.data?.subjects ?? [];
  const activeSubject = subjects.find((subject) => subject.is_active) ?? null;
  const feedResource = usePollingResource<{ items: Interaction[] }>(
    activeSubject ? `/api/subjects/${activeSubject.id}/feed?limit=18` : null,
    2000,
  );
  const metricsResource = usePollingResource<{ metrics: Metrics }>(
    activeSubject ? `/api/subjects/${activeSubject.id}/metrics` : null,
    3000,
  );
  const activityResource = usePollingResource<{ items: ActivityPoint[] }>(
    activeSubject ? `/api/subjects/${activeSubject.id}/activity-series` : null,
    3000,
  );
  const assetResource = usePollingResource<{ asset: AssetSnapshot | null }>(
    activeSubject ? `/api/subjects/${activeSubject.id}/assets/latest` : null,
    4000,
  );

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [editState, setEditState] = useState<{ subjectId: number | null; code: string; name: string }>({
    subjectId: null,
    code: "",
    name: "",
  });
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState(qaLibrary[0].id);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const feed = feedResource.data?.items ?? [];
  const metrics = metricsResource.data?.metrics ?? null;
  const activity = activityResource.data?.items ?? [];
  const asset = assetResource.data?.asset ?? null;
  const maxBar = Math.max(...activity.map((item) => item.characters), 1);
  const selectedPrompt = qaLibrary.find((item) => item.id === selectedPromptId) ?? qaLibrary[0];
  const editCode = activeSubject && editState.subjectId === activeSubject.id ? editState.code : activeSubject?.code ?? "";
  const editName =
    activeSubject && editState.subjectId === activeSubject.id ? editState.name : activeSubject?.display_name ?? "";

  useEffect(() => {
    if (meResource.error) {
      router.replace("/research/login");
    }
  }, [meResource.error, router]);

  async function refreshAll() {
    await Promise.all([
      subjectsResource.refresh(),
      feedResource.refresh(),
      metricsResource.refresh(),
      activityResource.refresh(),
      assetResource.refresh(),
    ]);
  }

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRefresh() {
    await refreshAll();
    setMessage("控制台数据已刷新。");
  }

  async function cycleSubject(offset: number) {
    if (!subjects.length || !activeSubject) {
      return;
    }

    const currentIndex = subjects.findIndex((subject) => subject.id === activeSubject.id);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = (currentIndex + offset + subjects.length) % subjects.length;
    const nextSubject = subjects[nextIndex];
    if (nextSubject && nextSubject.id !== activeSubject.id) {
      await activateSubject(nextSubject.id);
    }
  }

  async function handleLogout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    router.replace("/research/login");
  }

  async function createSubject() {
    await apiRequest("/api/subjects", {
      method: "POST",
      body: JSON.stringify({ code: newCode, display_name: newName }),
    });
    setNewCode("");
    setNewName("");
    setMessage("新受试者已创建。");
    await subjectsResource.refresh();
  }

  async function activateSubject(subjectId: number) {
    await apiRequest(`/api/subjects/${subjectId}/activate`, { method: "POST" });
    setMessage("当前受试者已切换。");
    await refreshAll();
  }

  async function saveSubject() {
    if (!activeSubject) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}`, {
      method: "PATCH",
      body: JSON.stringify({ code: editCode, display_name: editName }),
    });
    setMessage("当前受试者信息已更新。");
    await subjectsResource.refresh();
  }

  async function removeSubject() {
    if (!activeSubject || !window.confirm(`确定删除 ${activeSubject.display_name} 吗？`)) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}`, { method: "DELETE" });
    setMessage("受试者已删除。");
    await refreshAll();
  }

  async function sendPrompt(transcript: string, speaker: "ai" | "system" = "ai") {
    if (!activeSubject) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}/prompts`, {
      method: "POST",
      body: JSON.stringify({ transcript, speaker }),
    });
    setMessage("话术已下发到老年端。");
    await feedResource.refresh();
  }

  async function saveTranscript(interactionId: number) {
    await apiRequest(`/api/interactions/${interactionId}/transcript`, {
      method: "PATCH",
      body: JSON.stringify({ transcript: drafts[interactionId] ?? "" }),
    });
    setMessage("WoZ 转录已保存。");
    await refreshAll();
  }

  async function overrideRecording(interactionId: number, file: File) {
    const form = new FormData();
    form.append("audio", file);
    await apiRequest(`/api/interactions/${interactionId}/override-recording`, {
      method: "POST",
      body: form,
    });
    setMessage("普通话覆写音频已提交。");
    await refreshAll();
  }

  async function generateAsset(sourceInteractionId: number | null) {
    if (!activeSubject) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}/assets/generate`, {
      method: "POST",
      body: JSON.stringify({ source_interaction_id: sourceInteractionId }),
    });
    setMessage(sourceInteractionId ? "本条语音的结构化资产已生成。" : "最新《家族法典》已生成。");
    await assetResource.refresh();
  }

  if (meResource.loading && !meResource.data) {
    return (
      <div className="min-h-screen bg-[var(--hud-bg)] text-slate-100">
        <div className="flex min-h-screen items-center justify-center">正在校验实验人员权限…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--hud-bg)] text-slate-100">
      <div className="absolute inset-0 scale-110 bg-[url('https://images.pexels.com/photos/325229/pexels-photo-325229.jpeg?auto=compress&cs=tinysrgb&w=1600')] bg-cover bg-center opacity-18 blur-2xl brightness-50" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,20,0.88),rgba(5,8,20,0.97))]" />
      <div className="absolute inset-0 ambient-grid opacity-20" />
      <div className="absolute -left-16 top-12 h-80 w-80 rounded-full bg-cyan-400/16 blur-[120px]" />
      <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-amber-300/10 blur-[140px]" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-slate-200/8 blur-[120px]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] gap-6 px-5 py-5">
        <aside className="dashboard-float-slow hidden w-[92px] shrink-0 self-start rounded-[2rem] border border-white/10 bg-slate-800/28 px-4 py-5 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.32)] md:flex md:flex-col md:items-center md:justify-between">
          <div className="space-y-4">
            {[
              { icon: Orbit, label: "跳转到受试者区", action: () => scrollToSection("dashboard-subjects") },
              { icon: Brain, label: "跳转到指标区", action: () => scrollToSection("dashboard-metrics") },
              { icon: UserRound, label: "跳转到实时流", action: () => scrollToSection("dashboard-feed") },
              { icon: Sparkles, label: "跳转到话术区", action: () => scrollToSection("dashboard-prompts") },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                onClick={item.action}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/4 text-slate-300 transition hover:border-white/20 hover:text-white hover:shadow-[0_0_22px_rgba(243,199,111,0.12)]"
              >
                <item.icon className="h-5 w-5" />
              </button>
            ))}
          </div>

          <button
            onClick={handleLogout}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/8 text-amber-100 transition hover:border-amber-300/45 hover:shadow-[0_0_24px_rgba(243,199,111,0.2)]"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </aside>

        <div className="flex-1 space-y-6">
          <header className="dashboard-float rounded-full border border-white/10 bg-slate-800/30 px-4 py-3 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.26)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-2">
                  <button
                    type="button"
                    aria-label="返回首页"
                    onClick={() => router.push("/")}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/4 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Home className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="切换到上一位受试者"
                    onClick={() => void cycleSubject(-1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/4 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="切换到下一位受试者"
                    onClick={() => void cycleSubject(1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/4 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex min-w-[260px] items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  <Search className="h-4 w-4 text-slate-500" />
                  research.hippoark / 控制台 / {activeSubject ? `${activeSubject.code} ${activeSubject.display_name}` : "等待激活"}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="刷新控制台数据"
                  onClick={() => void handleRefresh()}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/4 text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="跳转到系统反馈"
                  onClick={() => scrollToSection(message ? "dashboard-message" : "dashboard-feed")}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/4 text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <div className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-200">
                  {meResource.data?.user.username ?? "researcher"}
                </div>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-12 gap-6">
            <section
              id="dashboard-subjects"
              className="dashboard-float col-span-12 rounded-[2rem] border border-white/10 bg-slate-800/26 p-5 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.28)] md:col-span-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">受试者中控</p>
                  <h2 className="cjk-heading mt-3 text-xl font-semibold text-slate-100">切换与管理现场对象</h2>
                </div>
                <UserRound className="h-5 w-5 text-amber-300" />
              </div>

              <div className="mt-6 space-y-3">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => activateSubject(subject.id)}
                    className={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition ${
                      subject.is_active
                        ? "border-cyan-300/45 bg-cyan-400/12 text-slate-100 shadow-[0_0_28px_rgba(75,198,255,0.18)]"
                        : "border-white/10 bg-white/4 text-slate-300 hover:border-white/20 hover:shadow-[0_0_24px_rgba(243,199,111,0.12)]"
                    }`}
                  >
                    <p className="font-data text-[10px] uppercase tracking-[0.24em] text-slate-400">{subject.code}</p>
                    <p className="mt-2 text-sm">{subject.display_name}</p>
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                <p className="font-data text-[11px] uppercase tracking-[0.3em] text-slate-500">新增受试者</p>
                <input
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value)}
                  placeholder="P05"
                  className="w-full rounded-[1rem] border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/45"
                />
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="请输入受试者姓名"
                  className="w-full rounded-[1rem] border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/45"
                />
                <button
                  onClick={createSubject}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/12 px-4 py-3 text-sm text-slate-100 transition hover:border-cyan-300/50 hover:shadow-[0_0_28px_rgba(75,198,255,0.22)]"
                >
                  <Plus className="h-4 w-4" />
                  创建受试者
                </button>
              </div>

              {activeSubject && (
                <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                  <p className="font-data text-[11px] uppercase tracking-[0.3em] text-slate-500">当前对象信息</p>
                  <input
                    value={editCode}
                    onChange={(event) =>
                      setEditState({
                        subjectId: activeSubject.id,
                        code: event.target.value,
                        name: editName,
                      })
                    }
                    className="w-full rounded-[1rem] border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-amber-300/45"
                  />
                  <input
                    value={editName}
                    onChange={(event) =>
                      setEditState({
                        subjectId: activeSubject.id,
                        code: editCode,
                        name: event.target.value,
                      })
                    }
                    className="w-full rounded-[1rem] border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-amber-300/45"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={saveSubject}
                      className="flex-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm transition hover:border-amber-300/50 hover:shadow-[0_0_26px_rgba(243,199,111,0.18)]"
                    >
                      保存
                    </button>
                    <button
                      onClick={removeSubject}
                      className="flex-1 rounded-full border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200 transition hover:border-white/20"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="col-span-12 space-y-6 md:col-span-6">
              <div id="dashboard-metrics" className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-6">
                  <MetricTile label="TTR" hint="词汇丰富度" value={metrics?.ttr ?? 0} decimals={2} />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <MetricTile label="MLU" hint="平均语句长度" value={metrics?.mlu ?? 0} />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <MetricTile label="UNIQUE" hint="独立词汇数" value={metrics?.unique_words ?? 0} />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <MetricTile label="FLOW" hint="有效转录条目" value={metrics?.transcript_count ?? 0} />
                </div>
              </div>

              <article className="dashboard-float rounded-[2rem] border border-white/10 bg-slate-800/26 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.28)]">
                <div className="flex items-center justify-between">
                    <div>
                      <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">逻辑流图层</p>
                    <h2 className="cjk-heading mt-3 text-2xl font-semibold text-slate-100">实时表达活跃度</h2>
                  </div>
                  <Activity className="h-5 w-5 text-cyan-300" />
                </div>

                <div className="mt-8 flex h-60 items-end gap-3 overflow-hidden rounded-[1.5rem] border border-white/8 bg-black/16 px-4 pb-4 pt-8">
                  {activity.length ? (
                    activity.slice(-8).map((item, index) => (
                      <div key={item.interaction_id} className="flex flex-1 flex-col items-center gap-3">
                        <div className="relative flex w-full items-end justify-center">
                          <div
                            className="absolute bottom-0 w-4/5 rounded-full bg-amber-300/24"
                            style={{ height: `${Math.max(20, (item.characters / maxBar) * 110)}px` }}
                          />
                          <div
                            className="relative w-3/5 rounded-full bg-cyan-400/80 shadow-[0_0_28px_rgba(75,198,255,0.3)]"
                            style={{
                              height: `${Math.max(32, (item.characters / maxBar) * 148)}px`,
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
                      等待老年端录音上传。
                    </div>
                  )}
                </div>
              </article>

              <article
                id="dashboard-feed"
                className="dashboard-float rounded-[2rem] border border-white/10 bg-slate-800/26 p-6 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.28)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">实时流</p>
                    <h2 className="cjk-heading mt-3 text-2xl font-semibold text-slate-100">转录、覆写与资产触发</h2>
                  </div>
                  <AudioLines className="h-5 w-5 text-amber-300" />
                </div>

                <div className="mt-6 space-y-4">
                  {feed.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[1.4rem] border border-white/10 bg-black/14 p-4 transition hover:border-white/20 hover:shadow-[0_0_22px_rgba(243,199,111,0.12)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-slate-400">
                            {item.speaker} · {item.status}
                          </p>
                          <p className="mt-2 font-data text-[11px] tracking-[0.18em] text-slate-500">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                        {item.audio_url && <audio controls src={item.audio_url} className="h-8 max-w-[240px]" />}
                      </div>

                      {item.speaker === "elder" ? (
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={drafts[item.id] ?? item.transcript ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                            className="min-h-28 w-full rounded-[1rem] border border-white/10 bg-white/4 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-cyan-300/45"
                          />
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => saveTranscript(item.id)}
                              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/20"
                            >
                              <Save className="h-4 w-4" />
                              保存覆写
                            </button>
                            <label className="cursor-pointer rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/20">
                              上传普通话覆写音频
                              <input
                                type="file"
                                accept="audio/*"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) {
                                    void overrideRecording(item.id, file);
                                  }
                                }}
                              />
                            </label>
                            <button
                              onClick={() => generateAsset(item.id)}
                              className="flex items-center gap-2 rounded-full border border-amber-300/22 bg-amber-300/8 px-4 py-2 text-xs uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-300/45 hover:shadow-[0_0_24px_rgba(243,199,111,0.18)]"
                            >
                              <Sparkles className="h-4 w-4" />
                              生成本条资产
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm leading-7 text-slate-200/86">{item.transcript}</p>
                      )}
                    </article>
                  ))}
                </div>
              </article>
            </section>

            <section
              className="dashboard-float col-span-12 space-y-6 rounded-[2rem] border border-white/10 bg-slate-800/26 p-5 backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.28)] md:col-span-3"
            >
              <article>
                <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">人工干预库</p>
                <div className="mt-5 space-y-3">
                  {interventionPrompts.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => sendPrompt(item.transcript, item.speaker)}
                      className="w-full rounded-[1.4rem] border border-white/10 bg-black/14 px-4 py-4 text-left transition hover:border-white/20 hover:shadow-[0_0_24px_rgba(243,199,111,0.14)]"
                    >
                      <p className="font-data text-[10px] uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-200/82">{item.transcript}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article id="dashboard-prompts" className="border-t border-white/10 pt-6">
                <div className="rounded-[1.7rem] border border-amber-200/20 bg-[linear-gradient(180deg,rgba(253,249,240,0.98),rgba(243,236,220,0.96))] p-4 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-data text-[11px] tracking-[0.28em] text-slate-500">预设提问库</p>
                      <h2 className="cjk-heading mt-3 text-xl font-semibold text-slate-950">按现场语境挑一句就能下发</h2>
                    </div>
                    <Sparkles className="h-5 w-5 text-amber-700" />
                  </div>

                  <div className="mt-5 space-y-3">
                    {qaLibrary.map((item) => {
                      const active = item.id === selectedPrompt.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedPromptId(item.id)}
                          className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
                            active
                              ? "border-slate-900/12 bg-white text-slate-950 shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                              : "border-white/70 bg-white/72 text-slate-900 hover:border-slate-900/12 hover:bg-white"
                          }`}
                        >
                          <p className="font-data text-[10px] tracking-[0.22em] text-slate-500">{item.title}</p>
                          <p className="mt-2 text-sm leading-7 text-slate-950">{item.prompt}</p>
                          <p className="mt-3 text-xs leading-6 text-slate-600">{item.intent}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-[1.3rem] border border-slate-900/8 bg-white/90 p-4">
                    <p className="font-data text-[10px] tracking-[0.22em] text-slate-500">即将下发</p>
                    <p className="mt-2 text-sm leading-7 text-slate-950">{selectedPrompt.prompt}</p>
                    <p className="mt-2 text-xs leading-6 text-slate-600">{selectedPrompt.intent}</p>
                  </div>

                  <button
                    onClick={() => sendPrompt(selectedPrompt.prompt)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-slate-900/12 bg-slate-950 px-4 py-3 text-sm text-white transition hover:bg-slate-900 hover:shadow-[0_0_28px_rgba(15,23,42,0.26)]"
                  >
                    <Send className="h-4 w-4" />
                    下发预设提问
                  </button>
                </div>

                <div className="mt-5 rounded-[1.6rem] border border-white/10 bg-black/14 p-4">
                  <p className="font-data text-[11px] uppercase tracking-[0.28em] text-slate-400">自定义话术</p>
                  <textarea
                    value={customPrompt}
                    onChange={(event) => setCustomPrompt(event.target.value)}
                    placeholder="输入自定义追问、安抚或结束语"
                    className="mt-4 min-h-32 w-full rounded-[1rem] border border-white/10 bg-white/4 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-amber-300/45"
                  />
                  <button
                    onClick={() => {
                      if (customPrompt.trim()) {
                        void sendPrompt(customPrompt.trim());
                        setCustomPrompt("");
                      }
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm transition hover:border-amber-300/50 hover:shadow-[0_0_28px_rgba(243,199,111,0.2)]"
                  >
                    <Send className="h-4 w-4" />
                    发送自定义话术
                  </button>
                </div>
              </article>

              <article id="dashboard-asset" className="border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-data text-[11px] uppercase tracking-[0.34em] text-slate-400">资产流快照</p>
                    <h2 className="cjk-heading mt-3 text-xl font-semibold text-slate-100">最新《家族法典》</h2>
                  </div>
                  <Shield className="h-5 w-5 text-amber-300" />
                </div>
                {asset?.payload_json.family_code ? (
                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-[0.22em] text-amber-200">事实层</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300/82">
                        {asset.payload_json.family_code.fact_layer?.time_period ?? "暂无时间线描述。"}
                      </p>
                    </div>
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-[0.22em] text-amber-200">归因层</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300/82">
                        {asset.payload_json.family_code.attribution_layer?.driving_motivation ?? "仍需进一步追问。"}
                      </p>
                    </div>
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-[0.22em] text-amber-200">智慧层</p>
                      <p className="mt-2 text-base leading-8 text-slate-100">
                        {asset.payload_json.family_code.wisdom_layer?.family_motto ?? "仍需进一步追问。"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-7 text-slate-400">当前还没有结构化资产快照。</p>
                )}
                <button
                  onClick={() => generateAsset(null)}
                  className="mt-5 flex items-center gap-2 text-sm text-amber-100 transition hover:text-white"
                >
                  重新生成当前资产
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </article>

              {message && (
                <article
                  id="dashboard-message"
                  className="rounded-[1.4rem] border border-cyan-300/18 bg-cyan-400/8 p-4 text-sm text-slate-200"
                >
                  {message}
                </article>
              )}
            </section>
          </section>
        </div>
      </main>

      <style jsx>{`
        @keyframes dashboard-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes dashboard-float-slow {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-12px);
          }
        }

        .dashboard-float {
          animation: dashboard-float 9s ease-in-out infinite;
        }

        .dashboard-float-slow {
          animation: dashboard-float-slow 11s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
