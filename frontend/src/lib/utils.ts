import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** shadcn/ui 标准类名合并工具：条件拼接 + Tailwind 冲突去重。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
