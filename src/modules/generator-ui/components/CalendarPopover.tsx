import { Calendar } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getTodayJalali, getTodayOccasion } from '../lib/persian-calendar';

export function CalendarPopover() {
  const today = getTodayJalali();
  const occasion = getTodayOccasion();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.06] hover:text-emerald-100"
          type="button"
          aria-label="View Persian calendar"
          title="مشاهده تاریخ شمسی و مناسبت‌ها"
        >
          <Calendar className="h-[14px] w-[14px]" aria-hidden="true" />
          <span>{today.day} {today.monthName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border-white/10 bg-black text-zinc-100 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">امروز</span>
            <h3 className="text-sm font-semibold text-zinc-100">
              {today.day} {today.monthName} {today.year}
            </h3>
          </div>

          {occasion ? (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <p className="text-xs font-medium text-emerald-200">
                مناسبت امروز:
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {occasion.title}
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">
              امروز مناسبت خاصی ثبت نشده است.
            </p>
          )}

          <div className="border-t border-white/10 pt-3">
            <p className="text-[10px] text-zinc-600 leading-relaxed text-center">
              تقویم هجری شمسی ۱۰۰٪ دقیق
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
