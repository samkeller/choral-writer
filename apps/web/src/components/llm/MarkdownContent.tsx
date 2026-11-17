import ReactMarkdown from 'react-markdown';

import styles from './MarkdownContent.module.css';

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={[styles.markdown, className].filter(Boolean).join(' ')}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
