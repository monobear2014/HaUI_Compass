"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import styles from "./document-markdown.module.css";

// Never execute raw HTML, remote images or trusted LaTeX from uploaded/model text.
export function DocumentMarkdown({ text }: { text: string }) {
  return (
    <div className={styles.content}>
      <Markdown
        skipHtml
        disallowedElements={["img", "iframe", "script", "style"]}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { trust: false, strict: "ignore", maxExpand: 1000 }],
        ]}
        components={{ a: ({ children }) => <span>{children}</span> }}
      >
        {text}
      </Markdown>
    </div>
  );
}
