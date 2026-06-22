"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownTheme = "dashboard" | "github";

const themes: Record<MarkdownTheme, string[]> = {
  dashboard: [
    "text-sm leading-relaxed text-gray-700 dark:text-gray-300",
    "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5",
    "[&_li]:my-0.5 [&_li>ul]:mt-1 [&_li>ol]:mt-1",
    "[&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100",
    "[&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400",
    "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100",
    "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100",
    "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100",
    "[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-gray-700",
    "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:text-xs dark:[&_pre]:bg-gray-900",
    "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
    "[&_table]:my-2 [&_table]:w-full",
    "[&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold dark:[&_th]:border-gray-700",
    "[&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-gray-700",
    "[&_blockquote]:border-s-2 [&_blockquote]:border-gray-300 [&_blockquote]:ps-3 [&_blockquote]:text-gray-500 dark:[&_blockquote]:border-gray-600",
  ],
  github: [
    "text-sm leading-relaxed text-[#24292f] dark:text-[#c9d1d9]",
    "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
    "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-6",
    "[&_li]:my-1 [&_li>p]:my-1 [&_li>ul]:mt-1 [&_li>ol]:mt-1",
    "[&_strong]:font-semibold [&_strong]:text-[#24292f] dark:[&_strong]:text-[#f0f6fc]",
    "[&_a]:text-[#0969da] [&_a]:underline dark:[&_a]:text-[#58a6ff]",
    "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#d0d7de] dark:[&_hr]:border-[#30363d]",
    "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:border-b [&_h1]:border-[#d0d7de] [&_h1]:pb-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-[#24292f] dark:[&_h1]:border-[#30363d] dark:[&_h1]:text-[#f0f6fc]",
    "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-[#d0d7de] [&_h2]:pb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-[#24292f] dark:[&_h2]:border-[#30363d] dark:[&_h2]:text-[#f0f6fc]",
    "[&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-tight [&_h3]:text-[#24292f] dark:[&_h3]:text-[#f0f6fc]",
    "[&_code]:rounded-md [&_code]:bg-[#afb8c133] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[85%] dark:[&_code]:bg-[#6e768166]",
    "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[#f6f8fa] [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[85%] [&_pre]:leading-relaxed dark:[&_pre]:bg-[#161b22]",
    "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
    "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden",
    "[&_tr:nth-child(2n)]:bg-[#f6f8fa] dark:[&_tr:nth-child(2n)]:bg-[#161b22]",
    "[&_th]:border [&_th]:border-[#d0d7de] [&_th]:bg-[#f6f8fa] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-start [&_th]:font-semibold dark:[&_th]:border-[#30363d] dark:[&_th]:bg-[#161b22]",
    "[&_td]:border [&_td]:border-[#d0d7de] [&_td]:px-3 [&_td]:py-1.5 dark:[&_td]:border-[#30363d]",
    "[&_blockquote]:my-3 [&_blockquote]:border-s-4 [&_blockquote]:border-[#d0d7de] [&_blockquote]:ps-4 [&_blockquote]:text-[#57606a] dark:[&_blockquote]:border-[#30363d] dark:[&_blockquote]:text-[#8b949e]",
  ],
};

/**
 * Renders model-generated markdown (paragraphs, lists, bold, inline code,
 * tables, links) with Tailwind styling. No typography plugin required — child
 * selectors style the rendered elements, with dark-mode and RTL-friendly
 * logical properties.
 */
export function Markdown({
  children,
  className,
  theme = "dashboard",
}: {
  children: string;
  className?: string;
  theme?: MarkdownTheme;
}) {
  return (
    <div
      className={cn(
        themes[theme],
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
