import { medicationPeriods, sleepDepthOptions } from "@/constants/wellness-options";
import type {
  Medication,
  PreviousDayState,
  SleepDepth,
  WakingState,
} from "@/types/work-record";

type MedicationSectionProps = {
  value: Medication;
  onChange: (value: Medication) => void;
};

export function MedicationSection({ value, onChange }: MedicationSectionProps) {
  return (
    <SectionCard title="服薬" description="時間帯ごとに、わかる範囲で記録できます。">
      <div className="space-y-4">
        {medicationPeriods.map((period) => {
          const entry = value[period.id];
          return (
            <fieldset key={period.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
              <legend className="px-1 text-sm font-bold text-teal-800">{period.label}</legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <ChoiceButton selected={entry.status === null} onClick={() => onChange({ ...value, [period.id]: { ...entry, status: null } })}>未入力</ChoiceButton>
                <ChoiceButton selected={entry.status === "taken"} onClick={() => onChange({ ...value, [period.id]: { ...entry, status: "taken" } })}>有</ChoiceButton>
                <ChoiceButton selected={entry.status === "not_taken"} onClick={() => onChange({ ...value, [period.id]: { ...entry, status: "not_taken" } })}>無</ChoiceButton>
              </div>
              <label className="mt-3 block">
                <span className="mb-2 block text-xs font-semibold text-slate-600">薬の名前・補足 <Optional /></span>
                <input
                  type="text"
                  value={entry.note}
                  onChange={(event) => onChange({ ...value, [period.id]: { ...entry, note: event.target.value } })}
                  placeholder="薬の名前など"
                  className="input"
                />
              </label>
            </fieldset>
          );
        })}
      </div>
    </SectionCard>
  );
}

type PreviousDaySectionProps = {
  value: PreviousDayState;
  onChange: (value: PreviousDayState) => void;
};

export function PreviousDaySection({ value, onChange }: PreviousDaySectionProps) {
  function numberOrNull(rawValue: string) {
    return rawValue === "" ? null : Number(rawValue);
  }

  function changeWentOut(wentOut: boolean | null) {
    onChange({ ...value, wentOut, outingLoad: wentOut === true ? value.outingLoad : null });
  }

  return (
    <SectionCard title="前日の状態" description="睡眠や疲れ、外出について記録します。">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">睡眠時間 <Optional /></span>
            <div className="relative">
              <input type="number" min="0" max="24" step="0.5" value={value.sleepHours ?? ""} onChange={(event) => onChange({ ...value, sleepHours: numberOrNull(event.target.value) })} className="input pr-12" placeholder="未入力" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">時間</span>
            </div>
          </label>
          <label>
            <span className="label">中途覚醒 <Optional /></span>
            <div className="relative">
              <input type="number" min="0" step="1" value={value.awakenings ?? ""} onChange={(event) => onChange({ ...value, awakenings: numberOrNull(event.target.value) })} className="input pr-10" placeholder="未入力" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">回</span>
            </div>
          </label>
        </div>

        <fieldset>
          <legend className="label">眠りの深さ <Optional /></legend>
          <div className="grid grid-cols-4 gap-2">
            <ChoiceButton selected={value.sleepDepth === null} onClick={() => onChange({ ...value, sleepDepth: null })}>未入力</ChoiceButton>
            {sleepDepthOptions.map((option) => (
              <ChoiceButton key={option.id} selected={value.sleepDepth === option.id} onClick={() => onChange({ ...value, sleepDepth: option.id as SleepDepth })}>{option.label}</ChoiceButton>
            ))}
          </div>
        </fieldset>

        <RatingField legend="帰宅後の疲労" value={value.fatigueAfterReturningHome} onChange={(rating) => onChange({ ...value, fatigueAfterReturningHome: rating })} lowLabel="少ない" highLabel="非常に強い" />

        <fieldset>
          <legend className="label">前日の外出 <Optional /></legend>
          <div className="grid grid-cols-3 gap-2">
            <ChoiceButton selected={value.wentOut === null} onClick={() => changeWentOut(null)}>未入力</ChoiceButton>
            <ChoiceButton selected={value.wentOut === true} onClick={() => changeWentOut(true)}>有</ChoiceButton>
            <ChoiceButton selected={value.wentOut === false} onClick={() => changeWentOut(false)}>無</ChoiceButton>
          </div>
        </fieldset>

        {value.wentOut === true ? (
          <RatingField legend="外出の負荷" value={value.outingLoad} onChange={(rating) => onChange({ ...value, outingLoad: rating })} lowLabel="少ない" highLabel="非常に強い" />
        ) : null}
      </div>
    </SectionCard>
  );
}

type WakingSectionProps = {
  value: WakingState;
  onChange: (value: WakingState) => void;
};

export function WakingSection({ value, onChange }: WakingSectionProps) {
  return (
    <SectionCard title="起床時の状態" description="起きたときの感覚を記録できます。">
      <div className="space-y-5">
        <RatingField legend="起床時の眠気" value={value.sleepiness} onChange={(rating) => onChange({ ...value, sleepiness: rating })} lowLabel="ほとんどない" highLabel="非常に強い" />
        <label className="block">
          <span className="label">起床時の体調 <Optional /></span>
          <textarea
            value={value.conditionNote}
            onChange={(event) => onChange({ ...value, conditionNote: event.target.value })}
            placeholder="起きたときの体調を短く記録"
            rows={3}
            className="input min-h-24 resize-y py-3"
          />
        </label>
      </div>
    </SectionCard>
  );
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function RatingField({ legend, value, onChange, lowLabel, highLabel }: { legend: string; value: number | null; onChange: (value: number | null) => void; lowLabel: string; highLabel: string }) {
  return (
    <fieldset>
      <legend className="label">{legend} <Optional /></legend>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <ChoiceButton key={rating} selected={value === rating} onClick={() => onChange(value === rating ? null : rating)}>{rating}</ChoiceButton>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400"><span>1：{lowLabel}</span><span>5：{highLabel}</span></div>
    </fieldset>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition ${selected ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>
      {children}
    </button>
  );
}

function Optional() {
  return <span className="font-normal text-slate-400">（任意）</span>;
}
