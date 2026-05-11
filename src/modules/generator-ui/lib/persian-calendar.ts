import jalaali from 'jalaali-js';

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export interface Occasion {
  month: number;
  day: number;
  title: string;
}

// Major Solar Hijri occasions
export const PERSIAN_OCCASIONS: Occasion[] = [
  { month: 1, day: 1, title: 'عید نوروز' },
  { month: 1, day: 2, title: 'عید نوروز' },
  { month: 1, day: 3, title: 'عید نوروز' },
  { month: 1, day: 4, title: 'عید نوروز' },
  { month: 1, day: 12, title: 'روز جمهوری اسلامی' },
  { month: 1, day: 13, title: 'روز طبیعت (سیزده به در)' },
  { month: 3, day: 14, title: 'رحلت امام خمینی' },
  { month: 3, day: 15, title: 'قیام ۱۵ خرداد' },
  { month: 11, day: 22, title: 'پیروزی انقلاب اسلامی' },
  { month: 12, day: 29, title: 'روز ملی شدن صنعت نفت' },
];

export function getTodayJalali() {
  const now = new Date();
  const j = jalaali.toJalaali(now);
  return {
    year: j.jy,
    month: j.jm,
    day: j.jd,
    monthName: JALALI_MONTHS[j.jm - 1],
  };
}

export function getTodayOccasion() {
  const { month, day } = getTodayJalali();
  return PERSIAN_OCCASIONS.find((o) => o.month === month && o.day === day);
}

export function formatJalaliDate(year: number, month: number, day: number) {
  return `${day} ${JALALI_MONTHS[month - 1]} ${year}`;
}
