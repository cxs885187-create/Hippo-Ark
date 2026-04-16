/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import {
  homeGallery,
  homeHero,
  homeHeroImage,
  homeMetrics,
  portalCards,
  projectFullName,
  projectHighlights,
  researchNews,
  timelineItems,
} from "@/lib/content";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] paper-noise">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1640px] flex-col gap-32 px-6 py-8 md:px-10 md:py-14">
        <section className="grid grid-cols-12 gap-6 md:gap-8">
          <div className="col-span-12 flex flex-col gap-10 md:col-span-7">
            <div className="flex flex-wrap items-center gap-4 text-[11px] tracking-[0.32em] text-[var(--burnt)]">
              <span className="font-data">{homeHero.eyebrow}</span>
              <span className="h-px w-14 bg-[var(--burnt)]" />
            </div>

            <div className="relative">
              <div className="max-w-xs md:absolute md:right-0 md:top-3">
                <p className="font-data text-[11px] tracking-[0.24em] text-black/42">PROJECT</p>
                <p className="mt-3 text-sm leading-7 text-black/58">{projectFullName}</p>
              </div>

              <div className="relative z-10 space-y-2">
                <h1 className="max-w-5xl text-[4.7rem] font-black leading-[0.94] tracking-[-0.07em] md:text-[8.4rem]">
                  {homeHero.titleLines[0]}
                </h1>
                <h1 className="max-w-5xl pl-0 text-[4.7rem] font-black leading-[0.94] tracking-[-0.07em] md:pl-16 md:text-[8.4rem]">
                  {homeHero.titleLines[1]}
                </h1>
              </div>

              <h1 className="relative z-20 mt-3 text-[4.1rem] font-black leading-[0.98] tracking-[-0.06em] md:absolute md:left-[28%] md:top-[76%] md:mt-0 md:bg-[var(--paper)] md:px-4 md:text-[6.4rem]">
                {homeHero.titleLines[2]}
              </h1>
            </div>

            <div className="grid grid-cols-12 gap-6 pt-8 md:pt-14">
              <div className="col-span-12 md:col-span-7">
                <p className="max-w-2xl font-editorial text-[1.65rem] leading-[1.82] text-black/76 md:text-[2.2rem]">
                  {homeHero.lead}
                </p>
              </div>
              <div className="col-span-12 md:col-span-5 md:pt-12">
                <p className="text-base leading-9 text-black/64">{homeHero.summary}</p>
                <p className="mt-8 font-data text-[11px] tracking-[0.28em] text-[var(--burnt)]">
                  {homeHero.sideNote}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-5 border-t border-black/10 pt-8">
              {homeMetrics.map((metric, index) => (
                <article
                  key={metric.label}
                  className={`${index === 1 ? "md:col-span-5" : "md:col-span-3"} col-span-12`}
                >
                  <p className="text-[2.35rem] font-black tracking-[-0.06em] md:text-[3rem]">{metric.value}</p>
                  <p className="mt-3 font-data text-xs tracking-[0.28em] text-[var(--burnt)]">{metric.label}</p>
                  <p className="mt-4 text-sm leading-8 text-black/62">{metric.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="relative col-span-12 md:col-span-5">
            <div className="absolute left-0 top-10 z-10 h-24 w-px bg-[var(--burnt)] md:left-12 md:top-0 md:h-40" />
            <img
              src={homeHeroImage}
              alt="纪实风格长者肖像"
              className="h-[34rem] w-full object-cover grayscale transition duration-500 hover:grayscale-0 md:ml-10 md:mt-10 md:h-[48rem]"
            />
            <div className="absolute -bottom-8 left-4 z-20 max-w-sm bg-[var(--paper)] px-6 py-5 md:-left-10">
              <p className="font-data text-[11px] tracking-[0.28em] text-[var(--burnt)]">项目判断</p>
              <p className="mt-3 text-base leading-8 text-black/68">{homeHero.quote}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-12 gap-6 md:gap-8">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">项目主轴</p>
            <h2 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-[5rem]">
              一次叙事
              <br />
              双重交付
            </h2>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-8 md:col-span-8">
            {projectHighlights.map((item, index) => (
              <article
                key={item.title}
                className={`${index === 1 ? "md:col-span-7 md:-mt-6" : "md:col-span-5"} col-span-12 border-t border-black/10 pt-7`}
              >
                <p className="font-data text-xs tracking-[0.28em] text-[var(--burnt)]">{item.eyebrow}</p>
                <h3 className="mt-5 text-[2rem] font-black leading-[1.18] tracking-[-0.04em] md:text-[2.4rem]">
                  {item.title}
                </h3>
                <p className="mt-5 text-base leading-8 text-black/66">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-6 md:gap-8">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">入口设计</p>
            <h2 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-[5rem]">
              三个主体
              <br />
              一条链路
            </h2>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-6 md:col-span-8">
            {portalCards.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${index === 1 ? "md:col-span-5 md:-mt-10" : "md:col-span-3"} group col-span-12 border border-black/10 bg-white/40 p-7 transition hover:-translate-y-1 hover:border-black/20`}
              >
                <p className="font-data text-xs tracking-[0.28em] text-[var(--burnt)]">{item.eyebrow}</p>
                <h3 className="mt-12 text-[2.2rem] font-black leading-[1.02] tracking-[-0.05em]">{item.title}</h3>
                <p className="mt-5 text-sm leading-8 text-black/62">{item.description}</p>
                <div className="mt-8 flex items-center gap-2 text-sm tracking-[0.18em] text-black/70">
                  进入
                  <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-6 md:gap-8">
          <div className="col-span-12 md:col-span-3">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">现场与资料</p>
            <h2 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-[4.8rem]">
              田野、
              <br />
              记忆、
              <br />
              技艺
            </h2>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-6 md:col-span-9">
            {homeGallery.map((image, index) => (
              <figure
                key={image.title}
                className={`${
                  index === 0
                    ? "md:col-span-5"
                    : index === 1
                      ? "md:col-span-4 md:mt-20"
                      : "md:col-span-3 md:-mt-10"
                } col-span-12`}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  className={`${image.ratio} w-full object-cover grayscale transition duration-500 hover:grayscale-0`}
                />
                <figcaption className="mt-4">
                  <p className="font-data text-xs tracking-[0.28em] text-[var(--burnt)]">{image.title}</p>
                  <p className="mt-2 text-sm leading-8 text-black/62">{image.description}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-6 border-t border-black/10 pt-12 md:gap-8">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">科研时间线</p>
            <h2 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-[5rem]">
              从原型到结项
            </h2>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-6 md:col-span-8">
            {timelineItems.slice(0, 4).map((item, index) => (
              <article
                key={item.month}
                className={`${index === 1 ? "md:col-span-7" : "md:col-span-5"} col-span-12 border-t border-black/10 pt-6`}
              >
                <p className="font-data text-xs tracking-[0.28em] text-black/42">{item.month}</p>
                <p className="mt-3 text-lg leading-8 text-black/76">{item.work}</p>
                <p className="mt-3 text-sm leading-8 text-black/58">{item.result}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-6 border-t border-black/10 py-12 md:gap-8">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">信息流</p>
            <h2 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-[4.8rem]">
              这个网站
              <br />
              具体追踪什么
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8">
            <div className="divide-y divide-black/10">
              {researchNews.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-start justify-between gap-6 py-6"
                >
                  <div>
                    <p className="text-[1.7rem] font-semibold leading-[1.5] tracking-[-0.03em]">{item.title}</p>
                    <p className="mt-3 max-w-3xl text-sm leading-8 text-black/60">{item.summary}</p>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
