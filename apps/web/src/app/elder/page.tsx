"use client";

import { Pause, Play, Square, SwitchCamera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePollingResource } from "@/hooks/use-polling-resource";
import { apiRequest } from "@/lib/api";
import type { Interaction, Subject } from "@/lib/types";

type RecorderState = "idle" | "recording" | "paused" | "uploading";

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTime(value: string | null) {
  if (!value) {
    return "刚刚";
  }

  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ElderPage() {
  const activeResource = usePollingResource<{ subject: Subject }>("/api/subjects/active", 2000);
  const activeSubject = activeResource.data?.subject ?? null;
  const feedResource = usePollingResource<{ items: Interaction[] }>(
    activeSubject ? `/api/subjects/${activeSubject.id}/feed?limit=30` : null,
    2000,
  );

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState("系统待命中");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const spokenPromptIdRef = useRef<number | null>(null);

  const feed = feedResource.data?.items ?? [];
  const latestPrompt =
    feed.find((item) => item.kind === "prompt" && (item.speaker === "ai" || item.speaker === "system")) ?? null;
  const elderItems = feed.filter((item) => item.speaker === "elder" && item.transcript);
  const totalCharacters = elderItems.reduce((sum, item) => sum + (item.transcript?.length ?? 0), 0);
  const depthStage = totalCharacters > 2400 ? 2 : totalCharacters > 900 ? 1 : 0;
  const bottleFill = Math.min(0.88, Math.max(0.14, totalCharacters / 3200));
  const bottlePercent = Math.round(bottleFill * 100);

  useEffect(() => {
    if (latestPrompt && latestPrompt.id !== spokenPromptIdRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latestPrompt.transcript ?? "");
      utterance.lang = "zh-CN";
      utterance.rate = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
      spokenPromptIdRef.current = latestPrompt.id;
    }
  }, [latestPrompt]);

  useEffect(() => {
    if (recorderState !== "recording") {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recorderState]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  async function uploadRecording(blob: Blob) {
    if (!activeSubject) {
      return;
    }

    setRecorderState("uploading");
    setStatusMessage("正在上传录音并等待转录");
    const form = new FormData();
    form.append("audio", blob, `hippoark-${Date.now()}.webm`);

    try {
      await apiRequest<{ item: Interaction }>(`/api/subjects/${activeSubject.id}/recordings`, {
        method: "POST",
        body: form,
      });
      setStatusMessage("录音已提交，系统正在同步最新结果");
      setSeconds(0);
      setRecorderState("idle");
      await feedResource.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "录音提交失败");
      setRecorderState("idle");
    }
  }

  async function startRecording() {
    if (!activeSubject) {
      setStatusMessage("当前没有激活的受试者");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatusMessage("当前浏览器不支持录音，请使用现代浏览器");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void uploadRecording(blob);
      };

      recorder.start();
      setSeconds(0);
      setRecorderState("recording");
      setStatusMessage("录音进行中，请自然讲述");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "无法启动录音");
    }
  }

  function pauseOrResume() {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state === "recording") {
      recorder.pause();
      setRecorderState("paused");
      setStatusMessage("录音已暂停");
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      setRecorderState("recording");
      setStatusMessage("录音已继续");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    recorder.stop();
  }

  async function requestTopicSwitch() {
    if (!activeSubject) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}/requests/topic-switch`, { method: "POST" });
    setStatusMessage("已向实验人员端发送换话题请求");
  }

  async function requestHalt() {
    if (!activeSubject) {
      return;
    }

    await apiRequest(`/api/subjects/${activeSubject.id}/requests/halt`, { method: "POST" });
    setStatusMessage("会话已申请停止，等待实验人员处理");
  }

  return (
    <div className="min-h-screen bg-[var(--warm-bg)] px-6 py-8 text-[var(--ink)] md:px-10 md:py-10">
      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1640px] grid-cols-12 gap-x-8 gap-y-14">
        <section className="col-span-12 grid grid-cols-12 gap-8 border-b border-neutral-300 pb-10">
          <div className="col-span-12 md:col-span-7">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-black/80" />
              <p className="font-data text-xs tracking-[0.34em] text-black/54">HIPPOARK VOICE SESSION</p>
            </div>
            <h1 className="mt-5 text-5xl font-light tracking-[-0.08em] md:text-[6.4rem]">海马体方舟</h1>
          </div>

          <div className="col-span-12 md:col-span-5 md:border-l md:border-neutral-300 md:pl-8">
            <p className="font-data text-xs tracking-[0.34em] text-black/44">SYSTEM STATUS</p>
            <p className="mt-5 text-sm leading-7 text-black/68">
              当前受试者：{activeSubject ? `${activeSubject.code} · ${activeSubject.display_name}` : "等待研究端激活"}
            </p>
            <p className="mt-2 text-sm leading-7 text-black/68">{statusMessage}</p>
            <p className="mt-2 text-sm leading-7 text-black/52">
              已沉淀文本 {totalCharacters} 字，系统会根据叙事深度缓慢更新右侧的可视化进度。
            </p>
          </div>
        </section>

        <section className="col-span-12 md:col-span-7">
          <p className="font-data text-xs tracking-[0.34em] text-black/44">CURRENT PROMPT</p>
          <div className="mt-8 max-w-4xl text-[2.8rem] leading-[1.52] text-black/88 md:text-[4.3rem] md:leading-[1.38]">
            {latestPrompt?.transcript ?? "您想从哪一段回忆开始都可以，我会在这里陪您慢慢听。"}
          </div>

          <div className="mt-16 flex h-24 items-end gap-2 overflow-hidden">
            {Array.from({ length: 24 }).map((_, index) => (
              <span
                key={index}
                className={`w-1 origin-bottom bg-black/80 ${recorderState === "recording" ? "" : "opacity-25"}`}
                style={{
                  height: `${18 + ((index * 19) % 68)}px`,
                  animation:
                    recorderState === "recording"
                      ? `waveform-rise ${0.72 + (index % 5) * 0.14}s ease-in-out infinite`
                      : "none",
                  animationDelay: `${index * 0.03}s`,
                }}
              />
            ))}
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-5 text-sm uppercase tracking-[0.22em] text-black/70">
            <button
              onClick={requestTopicSwitch}
              className="flex items-center gap-2 border-b border-black/35 pb-1 transition hover:border-black hover:text-black"
            >
              <SwitchCamera className="h-4 w-4" />
              换个话题
            </button>

            {recorderState === "idle" && (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 border-b border-black/35 pb-1 transition hover:border-black hover:text-black"
              >
                <Play className="h-4 w-4" />
                开始录音
              </button>
            )}

            {(recorderState === "recording" || recorderState === "paused") && (
              <>
                <button
                  onClick={pauseOrResume}
                  className="flex items-center gap-2 border-b border-black/35 pb-1 transition hover:border-black hover:text-black"
                >
                  <Pause className="h-4 w-4" />
                  {recorderState === "recording" ? "暂停" : "继续"}
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 border-b border-black/35 pb-1 transition hover:border-black hover:text-black"
                >
                  <Square className="h-4 w-4" />
                  结束并上传
                </button>
              </>
            )}

            <button
              onClick={requestHalt}
              className="flex items-center gap-2 border-b border-red-700/45 pb-1 text-red-700 transition hover:border-red-700 hover:text-red-800"
            >
              <Square className="h-4 w-4" />
              安全停止
            </button>
          </div>
        </section>

        <section className="col-span-12 md:col-span-2 md:border-l md:border-neutral-300 md:px-8">
          <p className="font-data text-xs tracking-[0.34em] text-black/44">SESSION TIMER</p>
          <div className="mt-8 overflow-hidden font-data text-[4.9rem] font-light leading-none tracking-[-0.08em] text-black md:text-[7rem]">
            {formatTimer(seconds)}
          </div>
          <p className="mt-5 text-sm leading-7 text-black/56">
            节奏不用着急，想停一下或者慢一点都可以。
          </p>
        </section>

        <aside className="col-span-12 md:col-span-3 md:border-l md:border-neutral-300 md:pl-10">
          <p className="font-data text-xs tracking-[0.34em] text-black/44">RECORDING DEPTH</p>

          <div className="mt-8 grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-5">
              <div className="mx-auto flex w-[9.5rem] flex-col items-center">
                <div className="relative h-[24rem] w-full">
                  <div className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 rounded-t-[1.6rem] border-[3px] border-black/70 border-b-0" />
                  <div className="absolute left-1/2 top-10 h-[19rem] w-full -translate-x-1/2 overflow-hidden rounded-[3rem] border-[3px] border-black/70 bg-transparent">
                    <div
                      className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
                      style={{ height: `${bottleFill * 100}%` }}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.08),rgba(17,17,17,0.2))]" />
                      <div className="absolute -top-4 left-[-8%] h-8 w-[116%] rounded-[50%] bg-black/14 bottle-wave-1" />
                      <div className="absolute -top-5 left-[-4%] h-8 w-[118%] rounded-[50%] bg-black/8 bottle-wave-2" />
                      <span className="absolute bottom-14 left-6 h-2.5 w-2.5 rounded-full bg-black/12 bottle-bubble-1" />
                      <span className="absolute bottom-24 right-7 h-2 w-2 rounded-full bg-black/10 bottle-bubble-2" />
                      <span className="absolute bottom-9 right-10 h-3 w-3 rounded-full bg-black/10 bottle-bubble-3" />
                    </div>
                  </div>
                </div>
                <p className="font-data text-[11px] tracking-[0.28em] text-black/42">MEMORY RESERVOIR</p>
                <p className="mt-2 text-sm leading-7 text-black/58">当前汇聚度约 {bottlePercent}%</p>
              </div>
            </div>

            <div className="col-span-12 space-y-9 lg:col-span-7">
              {[
                ["BASE", "先说清人物、地点与发生了什么。"],
                ["CORE", "逐步进入经验、情绪与判断方式。"],
                ["RICH", "沉淀出可以传下去的人生箴言与技艺逻辑。"],
              ].map(([label, description], index) => {
                const active = index === depthStage;
                return (
                  <div key={label} className="flex gap-5">
                    <div
                      className="mt-2 h-2.5 w-2.5 rounded-full"
                      style={{ background: active ? "#101010" : "#c8c4bd" }}
                    />
                    <div>
                      <p
                        className={`font-data text-xs tracking-[0.34em] ${
                          active ? "text-black" : "text-black/34"
                        }`}
                      >
                        {label}
                      </p>
                      <p className={`mt-3 text-sm leading-7 ${active ? "text-black/72" : "text-black/40"}`}>
                        {description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-14 border-t border-neutral-300 pt-6">
            <p className="font-data text-xs tracking-[0.34em] text-black/44">SESSION ARCHIVE</p>
            <div className="mt-6 space-y-4">
              {elderItems.slice(0, 4).map((item) => (
                <article key={item.id} className="border-t border-neutral-300 pt-4">
                  <p className="font-data text-[11px] tracking-[0.24em] text-black/42">{formatTime(item.created_at)}</p>
                  <p className="mt-3 text-sm leading-7 text-black/68">{item.transcript}</p>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <style jsx>{`
        @keyframes bottle-wave {
          0% {
            transform: translateX(-10px);
          }
          50% {
            transform: translateX(12px);
          }
          100% {
            transform: translateX(-10px);
          }
        }

        @keyframes bottle-bubble {
          0% {
            transform: translateY(0px);
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-54px);
            opacity: 0;
          }
        }

        .bottle-wave-1 {
          animation: bottle-wave 6s linear infinite;
        }

        .bottle-wave-2 {
          animation: bottle-wave 8s linear infinite reverse;
        }

        .bottle-bubble-1 {
          animation: bottle-bubble 5.5s ease-in-out infinite;
        }

        .bottle-bubble-2 {
          animation: bottle-bubble 6.6s ease-in-out infinite 1s;
        }

        .bottle-bubble-3 {
          animation: bottle-bubble 5.9s ease-in-out infinite 0.6s;
        }
      `}</style>
    </div>
  );
}
