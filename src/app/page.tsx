import { WorkDiary } from "@/components/work-diary";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 px-1">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm shadow-teal-900/15">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8">
              <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
              <path d="m8 14 2.2 2.2L16 11" />
            </svg>
          </div>
          <p className="text-sm font-semibold tracking-[0.16em] text-teal-700">WORK NOTE</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">仕事上の傾向と対策</h1>
          <p className="mt-2 text-[15px] leading-6 text-slate-500">今日の状況を、無理のないペースで記録しましょう。</p>
        </header>
        <WorkDiary />
      </div>
    </main>
  );
}
