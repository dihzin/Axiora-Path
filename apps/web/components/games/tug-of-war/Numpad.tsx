"use client";

type NumpadProps = {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onConfirm: () => void;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function Numpad({ disabled, onDigit, onDelete, onConfirm }: NumpadProps) {
  return (
    <div className="mt-4 rounded-[20px] border-[3px] border-[#222] bg-[#f8fcff] p-4 shadow-[0_10px_22px_rgba(32,49,74,0.12)]">
      <div className="grid grid-cols-3 gap-2">
        {DIGITS.slice(0, 9).map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(digit)}
            className="h-12 rounded-2xl border-2 border-[#c7d5ee] bg-white text-xl font-black text-[#1f2937] shadow-[0_3px_0_rgba(184,200,239,0.9)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="h-12 rounded-2xl border-2 border-[#fbbf24] bg-[#fef3c7] text-sm font-black text-[#92400e] shadow-[0_3px_0_rgba(217,119,6,0.24)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Del
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onDigit("0")}
          className="h-12 rounded-2xl border-2 border-[#c7d5ee] bg-white text-xl font-black text-[#1f2937] shadow-[0_3px_0_rgba(184,200,239,0.9)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="h-12 rounded-2xl border-2 border-[#16a34a] bg-[#86efac] text-sm font-black text-[#14532d] shadow-[0_3px_0_rgba(22,101,52,0.28)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
