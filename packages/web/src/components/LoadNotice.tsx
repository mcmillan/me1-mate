import { useAtom } from 'jotai';
import { describeIssue } from '../lib/messages.ts';
import { loadIssuesAtom } from '../lib/store.ts';
import { Notice, NoticeTitle } from './Notice.tsx';
import { Action } from './ui.tsx';

/** How many reasons to list before summing up the rest. */
const SHOWN = 6;

/** Why the last files couldn't be opened, until it's dismissed or other files open. Shown on both screens. */
export const LoadNotice = () => {
  const [issues, setIssues] = useAtom(loadIssuesAtom);
  if (issues.length === 0) return null;
  return (
    <Notice
      role="alert"
      actions={
        <Action kind="subtle" className="target" px="4" onPress={() => setIssues([])}>
          Dismiss
        </Action>
      }
    >
      <NoticeTitle>Couldn’t open those files</NoticeTitle>
      <ul className="notice-list">
        {issues.slice(0, SHOWN).map((issue) => (
          <li key={`${issue.path}:${issue.reason}`}>{describeIssue(issue)}</li>
        ))}
        {issues.length > SHOWN && <li>…and {issues.length - SHOWN} more.</li>}
      </ul>
    </Notice>
  );
};
