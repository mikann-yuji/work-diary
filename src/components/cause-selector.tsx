import {
  causeCategories,
  OTHER_CAUSE_ID,
} from "@/constants/cause-options";
import type {
  CauseCategoryId,
  CauseSelections,
} from "@/types/work-record";

type CauseSelectorProps = {
  value: CauseSelections;
  onChange: (value: CauseSelections) => void;
};

export function CauseSelector({ value, onChange }: CauseSelectorProps) {
  function toggleOption(categoryId: CauseCategoryId, optionId: string) {
    const current = value[categoryId];
    const isSelected = current.selectedOptionIds.includes(optionId);
    const selectedOptionIds = isSelected
      ? current.selectedOptionIds.filter((id) => id !== optionId)
      : [...current.selectedOptionIds, optionId];

    onChange({
      ...value,
      [categoryId]: {
        selectedOptionIds,
        otherText:
          optionId === OTHER_CAUSE_ID && isSelected ? "" : current.otherText,
      },
    });
  }

  function updateOtherText(categoryId: CauseCategoryId, otherText: string) {
    onChange({
      ...value,
      [categoryId]: { ...value[categoryId], otherText },
    });
  }

  return (
    <section aria-labelledby="causes-heading" className="space-y-4 rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
      <div>
        <h2 id="causes-heading" className="text-lg font-bold text-slate-800">原因</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">当てはまるものがあれば、いくつでも選べます。</p>
      </div>

      {causeCategories.map((category) => {
        const selection = value[category.id];
        const showOther = selection.selectedOptionIds.includes(OTHER_CAUSE_ID);

        return (
          <fieldset key={category.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
            <legend className="px-1 text-sm font-bold text-teal-800">{category.label}</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {category.options.map((option) => {
                const checked = selection.selectedOptionIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm leading-5 transition ${
                      checked
                        ? "border-teal-300 bg-teal-50 font-semibold text-teal-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(category.id, option.id)}
                      className="h-5 w-5 shrink-0 accent-teal-700"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            {showOther ? (
              <label className="mt-3 block">
                <span className="mb-2 block text-xs font-semibold text-slate-600">{category.label}のその他</span>
                <input
                  type="text"
                  value={selection.otherText}
                  onChange={(event) => updateOtherText(category.id, event.target.value)}
                  placeholder="自由に入力してください"
                  className="input"
                />
              </label>
            ) : null}
          </fieldset>
        );
      })}
    </section>
  );
}
