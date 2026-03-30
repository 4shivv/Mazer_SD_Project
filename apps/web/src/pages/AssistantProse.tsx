import { useRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./Chat.module.css";

type Props = {
  text: string;
};

function PreWithCopy({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  return (
    <div className={styles.codeBlockWrap}>
      <button
        type="button"
        className={styles.codeCopyBtn}
        onClick={() => {
          const t = preRef.current?.textContent ?? "";
          void navigator.clipboard.writeText(t);
        }}
        aria-label="Copy code"
      >
        Copy
      </button>
      <pre ref={preRef} className={styles.mdPre}>
        {children}
      </pre>
    </div>
  );
}

export default function AssistantProse({ text }: Props) {
  return (
    <div className={styles.assistantProse}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: PreWithCopy }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
