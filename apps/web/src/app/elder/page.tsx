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
      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1600px] grid-cols-12 gap-x-8 gap-y-16">
        <section className="col-span-12 grid grid-cols-12 gap-8 border-b border-neutral-300 pb-8">
          <div className="col-span-12 md:col-span-7">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-black/80" />
              <p className="font-data text-xs tracking-[0.34em] text-black/54">HIPPOARK VOICE SESSION</p>
            </div>
            <h1 className="mt-5 text-5xl font-light tracking-[-0.08em] md:text-[6.5rem]">海马体方舟</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-black/62">
              这里不出现复杂容器，也不出现额外功能。系统只做一件事：让长者在没有压力的情况下继续自然讲述。
            </p>
          </div>

          <div className="col-span-12 md:col-span-5 md:border-l md:border-neutral-300 md:pl-8">
            <p className="font-data text-xs tracking-[0.34em] text-black/44">SYSTEM STATUS</p>
            <p className="mt-5 text-sm leading-7 text-black/68">
              当前受试者：{activeSubject ? `${activeSubject.code} · ${activeSubject.display_name}` : "等待研究端激活"}
            </p>
            <p className="mt-2 text-sm leading-7 text-black/68">{statusMessage}</p>
            <p className="mt-2 text-sm leading-7 text-black/52">
              已沉淀文本 {totalCharacters} 字，系统会根据叙事深度自动更新右侧阶段提示。
            </p>
          </div>
        </section>

        <section className="col-span-12 md:col-span-8">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-8">
              <p className="font-data text-xs tracking-[0.34em] text-black/44">CURRENT PROMPT</p>
              <div className="mt-8 max-w-4xl text-3xl leading-[1.55] text-black/86 md:text-5xl md:leading-[1.45]">
                {latestPrompt?.transcript ?? "研究人员下发的新问题会显示在这里，系统也会自动读给长者听。"}
              </div>
            </div>

            <div className="col-span-12 md:col-span-4 md:border-l md:border-neutral-300 md:pl-8">
              <p className="font-data text-xs tracking-[0.34em] text-black/44">SESSION TIMER</p>
              <div className="mt-6 font-data text-[5.5rem] font-light tabular-nums tracking-[-0.1em] text-black md:text-[9rem]">
                {formatTimer(seconds)}
              </div>
            </div>
          </div>

          <div className="mt-14 flex h-24 items-end gap-2 overflow-hidden">
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

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-5 text-sm uppercase tracking-[0.22em] text-black/70">
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

        <aside className="col-span-12 md:col-span-4 md:border-l md:border-neutral-300 md:pl-10">
          <p className="font-data text-xs tracking-[0.34em] text-black/44">RECORDING DEPTH</p>
          <div className="mt-10 space-y-10">
            {[
              ["BASE", "先说清人物、地点与发生了什么。"],
              ["CORE", "逐步进入经验、情绪与判断方式。"],
              ["RICH", "沉淀出可以传下去的人生箴言与技艺逻辑。"],
            ].map(([label, description], index) => {
              const active = index === depthStage;
              return (
                <div key={label} className="flex gap-5">
                  <div
                    className="mt-2 h-2 w-2 rounded-full"
                    style={{ background: active ? "#101010" : "#bcb7b0" }}
                  />
                  <div>
                    <p className={`font-data text-xs tracking-[0.34em] ${active ? "text-black" : "text-black/35"}`}>
                      {label}
                    </p>
                    <p className={`mt-2 text-sm leading-7 ${active ? "text-black/72" : "text-black/38"}`}>
                      {description}
                    </p>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
