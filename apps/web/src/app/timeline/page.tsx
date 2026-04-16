import { SiteHeader } from "@/components/site-header";
import { timelineItems } from "@/lib/content";

export default function TimelinePage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] paper-noise">
      <SiteHeader />
      <main className="mx-auto max-w-[1600px] px-6 py-12 md:px-10 md:py-16">
        <section className="grid grid-cols-12 gap-8 border-b border-black/10 pb-14">
          <div className="col-span-12 md:col-span-4">
            <p className="font-data text-xs tracking-[0.32em] text-[var(--burnt)]">科研时间线</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.9] tracking-[-0.08em] md:text-8xl">
              2026年4月至次年3月
            </h1>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p className="max-w-4xl font-editorial text-xl leading-9 text-black/74 md:text-3xl md:leading-[1.6]">
              项目按照“原型搭建、田野调查、数据注入、脱敏标注、系统定型、论文投递、结项答辩”的节奏按月推进，所有节点均取自申报书原始时间安排。
            </p>
          </div>
        </section>

        <section className="py-14">
          {timelineItems.map((item) => (
            <article
              key={item.month}
              className="grid grid-cols-12 gap-6 border-t border-black/10 py-7 md:gap-8"
            >
              <div className="col-span-12 md:col-span-2">
                <p className="text-5xl font-black leading-none tracking-[-0.06em]">{item.month}</p>
                <p className="mt-2 font-data text-xs tracking-[0.26em] text-black/44">{item.stage}</p>
              </div>
              <div className="col-span-12 md:col-span-6">
                <p className="text-lg leading-8 text-black/78">{item.work}</p>
              </div>
              <div className="col-span-12 md:col-span-4">
                <p className="font-data text-xs tracking-[0.26em] text-[var(--burnt)]">阶段成果</p>
                <p className="mt-3 text-sm leading-7 text-black/64">{item.result}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
