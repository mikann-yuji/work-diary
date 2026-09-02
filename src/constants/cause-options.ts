import type { CauseCategoryId, CauseSelections } from "@/types/work-record";

export type CauseOption = {
  id: string;
  label: string;
};

export type CauseCategory = {
  id: CauseCategoryId;
  label: string;
  options: CauseOption[];
};

export const OTHER_CAUSE_ID = "other";

export const causeCategories: CauseCategory[] = [
  {
    id: "sleep",
    label: "睡眠",
    options: [
      { id: "insufficient_sleep", label: "寝不足" },
      { id: "interrupted_sleep", label: "中途覚醒" },
      { id: "difficulty_waking", label: "起きられない" },
      { id: "reversed_sleep_cycle", label: "昼夜逆転" },
      { id: "hyperarousal", label: "過覚醒" },
      { id: "sleepy_despite_rest", label: "十分寝たのに眠い" },
      { id: OTHER_CAUSE_ID, label: "その他" },
    ],
  },
  {
    id: "disability_traits",
    label: "障害特性",
    options: [
      { id: "time_management", label: "時間管理" },
      { id: "time_slip", label: "タイムスリップ現象" },
      { id: "difficulty_preparing", label: "準備が進まない" },
      { id: "forgotten_items", label: "忘れ物" },
      { id: "difficulty_switching", label: "切り替え困難" },
      { id: "depression", label: "鬱" },
      { id: OTHER_CAUSE_ID, label: "その他" },
    ],
  },
  {
    id: "physical_condition",
    label: "体調",
    options: [
      { id: "headache", label: "頭痛" },
      { id: "dizziness", label: "眩暈" },
      { id: "slight_fever", label: "微熱" },
      { id: "nausea", label: "吐き気" },
      { id: "severe_fatigue", label: "強い疲労" },
      { id: "tearfulness", label: "涙が出る" },
      { id: "shallow_breathing", label: "呼吸が浅い" },
      { id: "stiff_shoulders", label: "肩こり" },
      { id: OTHER_CAUSE_ID, label: "その他" },
    ],
  },
  {
    id: "workload",
    label: "勤務負荷",
    options: [
      { id: "prior_day_fatigue_1f", label: "前日から疲労：1F" },
      { id: "prior_day_fatigue_2f", label: "前日から疲労：2F" },
      { id: "prior_day_fatigue_flow_work", label: "前日から疲労：流れ作業" },
      { id: "prior_day_fatigue_hyperfocus", label: "前日から疲労：過集中" },
      { id: "work_fatigue", label: "業務疲労" },
      { id: "commute_fatigue", label: "通勤疲労" },
      { id: OTHER_CAUSE_ID, label: "その他" },
    ],
  },
  {
    id: "lifestyle",
    label: "生活要因",
    options: [
      { id: "staying_up_late", label: "夜ふかし" },
      { id: "social_media", label: "SNS" },
      { id: "television", label: "TV" },
      { id: "caffeine", label: "カフェイン" },
      { id: "headache_medicine", label: "頭痛薬" },
      { id: "weather", label: "天候" },
      { id: OTHER_CAUSE_ID, label: "その他" },
    ],
  },
];

export function createEmptyCauseSelections(): CauseSelections {
  return {
    sleep: { selectedOptionIds: [], otherText: "" },
    disability_traits: { selectedOptionIds: [], otherText: "" },
    physical_condition: { selectedOptionIds: [], otherText: "" },
    workload: { selectedOptionIds: [], otherText: "" },
    lifestyle: { selectedOptionIds: [], otherText: "" },
  };
}

export function getCauseDisplayLabels(causes: CauseSelections) {
  return causeCategories.flatMap((category) => {
    const selection = causes[category.id];
    return selection.selectedOptionIds.map((optionId) => {
      const optionLabel = category.options.find((option) => option.id === optionId)?.label;
      if (optionId === OTHER_CAUSE_ID && selection.otherText.trim()) {
        return `${category.label}・その他：${selection.otherText.trim()}`;
      }
      if (optionId === OTHER_CAUSE_ID) return `${category.label}・その他`;
      return optionLabel ?? optionId;
    });
  });
}
