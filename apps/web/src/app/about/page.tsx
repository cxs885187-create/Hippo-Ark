import { SiteHeader } from "@/components/site-header";
import { aboutSections, meaningDimensions, projectFullName } from "@/lib/content";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] paper-noise">
      <SiteHeader />
      <main className="mx-auto max-w-[1600px] px-6 py-12 md:px-10 md:py-16">
        <section className="grid grid-cols-12 gap-8 border-b border-black/10 pb-14">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">科研说明</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.9] tracking-[-0.08em] md:text-8xl">项目从何而来</h1>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p className="max-w-4xl font-editorial text-xl leading-9 text-black/74 md:text-3xl md:leading-[1.6]">
              {projectFullName} 围绕“隐性知识资产化”与“认知健康无感监测”两条主轴展开，所有说明内容均根据立项申报书整理，用于对应本网站中的首页、老年端、实验人员入口、家庭端与科研时间线。
            </p>
          </div>
        </section>

        <section className="grid grid-cols-12 gap-8 py-14">
          <div className="col-span-12 md:col-span-3">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">核心章节</p>
          </div>
          <div className="col-span-12 space-y-8 md:col-span-9">
            {aboutSections.map((section) => (
              <article key={section.title} className="grid grid-cols-12 gap-6 border-t border-black/10 pt-6">
                <div className="col-span-12 md:col-span-3">
                  <p className="font-data text-xs tracking-[0.28em] text-[var(--burnt)]">{section.title}</p>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="max-w-4xl text-lg leading-8 text-black/74">{section.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-8 border-t border-black/10 py-14">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">研究意义</p>
            <h2 className="mt-5 text-4xl font-black leading-[0.92] tracking-[-0.06em] md:text-6xl">
              六个维度共同支撑项目成立
            </h2>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-6 md:col-span-8">
            {meaningDimensions.map((item, index) => (
              <article
                key={item.title}
                className={`${index % 3 === 1 ? "md:col-span-7" : "md:col-span-5"} col-span-12 border-t border-black/10 pt-5`}
              >
                <p className="font-data text-xs tracking-[0.28em] text-black/42">{item.title}</p>
                <p className="mt-4 text-base leading-7 text-black/72">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
