import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * MarkdownText — renders assistant/AI text as formatted markdown so **bold**,
 * bullet/numbered lists and headings display properly instead of leaking raw
 * asterisks. Tight spacing so it sits well inside chat bubbles.
 */
export default function MarkdownText({ children, className = "" }) {
    return (
        <div className={`markdown-body ${className}`} data-testid="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ node, ...p }) => <p className="mb-2 last:mb-0 leading-relaxed" {...p} />,
                    ul: ({ node, ...p }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
                    ol: ({ node, ...p }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
                    li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
                    strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
                    em: ({ node, ...p }) => <em className="italic" {...p} />,
                    a: ({ node, ...p }) => <a className="underline" target="_blank" rel="noopener noreferrer" {...p} />,
                    h1: ({ node, ...p }) => <p className="font-semibold mb-1" {...p} />,
                    h2: ({ node, ...p }) => <p className="font-semibold mb-1" {...p} />,
                    h3: ({ node, ...p }) => <p className="font-semibold mb-1" {...p} />,
                    code: ({ node, ...p }) => <code className="px-1 rounded bg-black/5 text-[0.85em]" {...p} />,
                }}
            >
                {children || ""}
            </ReactMarkdown>
        </div>
    );
}
