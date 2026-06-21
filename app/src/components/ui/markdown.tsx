"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders model-generated markdown (paragraphs, lists, bold, inline code,
 * tables, links) with Tailwind styling. No typography plugin required — child
 * selectors style the rendered elements, with dark-mode and RTL-friendly
 * logical properties.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
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
        "[&_table]:my-2 [&_table]:w-full [&_table]:text-xs",
        "[&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold dark:[&_th]:border-gray-700",
        "[&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-gray-700",
        "[&_blockquote]:border-s-2 [&_blockquote]:border-gray-300 [&_blockquote]:ps-3 [&_blockquote]:text-gray-500 dark:[&_blockquote]:border-gray-600",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
