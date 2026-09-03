import { SectionCard } from "@/components/wellness-sections";
import { futureMeasureExecutionOptions } from "@/constants/measure-options";
import type {
  FutureMeasure,
  FutureMeasureExecution,
  TodayMeasures,
} from "@/types/work-record";

type FutureMeasures = [FutureMeasure, FutureMeasure, FutureMeasure, FutureMeasure, FutureMeasure];

export function CountermeasureSection({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <SectionCard title="対策" description="今回考えたことや、次に試したいことを記録できます。">
      <label className="block">
        <span className="label">今回考えた対策 <Optional /></span>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="今回考えた対策を入力" rows={4} className="input min-h-28 resize-y py-3" />
      </label>
    </SectionCard>
  );
}

export function TodayMeasuresSection({ value, onChange }: { value: TodayMeasures; onChange: (value: TodayMeasures) => void }) {
  function updateMedication(index: number, patch: Partial<TodayMeasures["medications"][number]>) {
    const medications = value.medications.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) as TodayMeasures["medications"];
    onChange({ ...value, medications });
  }

  function updateOther(index: number, nextValue: string) {
    const others = value.others.map((item, itemIndex) => itemIndex === index ? nextValue : item) as TodayMeasures["others"];
    onChange({ ...value, others });
  }

  return (
    <SectionCard title="当日の対策" description="当日に行った服薬や、そのほかの対応を記録できます。">
      <div className="space-y-5">
        <div>
          <h3 className="label">服薬・対応 <Optional /></h3>
          <div className="space-y-3">
            {value.medications.map((item, index) => (
              <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="mb-2 block text-xs font-bold text-teal-800">服薬 {index + 1}</span>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                  <label><span className="sr-only">服薬{index + 1}の薬・対応内容</span><input type="text" value={item.detail} onChange={(event) => updateMedication(index, { detail: event.target.value })} placeholder="薬・対応内容" className="input" /></label>
                  <label><span className="sr-only">服薬{index + 1}の実施時間</span><input type="time" value={item.time} onChange={(event) => updateMedication(index, { time: event.target.value })} className="input" /></label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="label">その他 <Optional /></h3>
          <div className="space-y-2">
            {value.others.map((item, index) => <label key={index} className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">{index + 1}</span><span className="sr-only">その他の当日対策{index + 1}</span><input type="text" value={item} onChange={(event) => updateOther(index, event.target.value)} placeholder="当日に行った対策" className="input" /></label>)}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function FutureMeasuresSection({ value, onChange }: { value: FutureMeasures; onChange: (value: FutureMeasures) => void }) {
  function updateItem(index: number, patch: Partial<FutureMeasure>) {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) as FutureMeasures);
  }

  function toggleExecution(index: number, execution: Exclude<FutureMeasureExecution, null>) {
    updateItem(index, { execution: value[index].execution === execution ? null : execution });
  }

  return (
    <SectionCard title="今後の対策" description="今後試すことと、実行後の結果を記録できます。">
      <div className="space-y-4">
        {value.map((item, index) => (
          <fieldset key={index} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
            <legend className="px-1 text-sm font-bold text-teal-800">{index + 1}件目 <Optional /></legend>
            <div className="space-y-3">
              <label className="block"><span className="label">今後の対策</span><textarea value={item.action} onChange={(event) => updateItem(index, { action: event.target.value })} rows={2} className="input min-h-20 resize-y py-3" /></label>
              <fieldset><legend className="label">実行</legend><div className="grid grid-cols-3 gap-2">{futureMeasureExecutionOptions.map((option) => <button key={option.id} type="button" aria-pressed={item.execution === option.id} onClick={() => toggleExecution(index, option.id)} className={`min-h-11 rounded-xl border text-base font-bold transition ${item.execution === option.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>{option.label}</button>)}</div></fieldset>
              <label className="block"><span className="label">結果</span><textarea value={item.result} onChange={(event) => updateItem(index, { result: event.target.value })} rows={2} className="input min-h-20 resize-y py-3" /></label>
            </div>
          </fieldset>
        ))}
      </div>
    </SectionCard>
  );
}

export function MemoSection({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <SectionCard title="メモ" description="ほかの欄に分類しにくい内容を記録できます。">
      <label className="block"><span className="label">全体メモ <Optional /></span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="そのほかに残しておきたいこと" rows={4} className="input min-h-28 resize-y py-3" /></label>
    </SectionCard>
  );
}

function Optional() {
  return <span className="font-normal text-slate-400">（任意）</span>;
}
