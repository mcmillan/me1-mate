import { useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import type { TamaguiElement } from 'tamagui';
import { announce } from '../lib/announce.ts';
import {
  deleteSessionAtom,
  openSessionAtom,
  type SessionSummary,
  sessionsAtom,
} from '../lib/session.ts';
import { keyStyle } from '../lib/theme.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { Action } from './ui.tsx';

/**
 * Each session is a raised card: a picture of its 16 keys, its name, when it
 * was edited and where it came from. The name is the button; its hit area is
 * stretched over the whole card (`::after`), and the focus ring is drawn on
 * the card. Delete is a separate button above that area: quiet until the card
 * is hovered or holds focus, and always there where nothing hovers.
 *
 * The newest session is the one to carry on with: it spans the list, and its
 * picture is the key grid itself, labels and all. Cards lay themselves out by
 * their own width.
 *
 * In forced colours the tiles' fills go; their transparent borders are what's
 * left, so an assigned key is still a solid outline and an empty one a dashed.
 */
const SESS_CSS = `
.sess-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.sess-item { display: grid; min-inline-size: 0; }
.sess-item[data-first] { grid-column: 1 / -1; }

.sess-card { container: sess / inline-size; position: relative; border-radius: 20px; }
.sess-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "keys text delete"; align-items: center; gap: 12px 16px; padding: 14px 10px 14px 16px; }
.sess-keys { grid-area: keys; display: grid; grid-template-columns: repeat(8, 13px); gap: 3px; }
.sess-key { box-sizing: border-box; block-size: 13px; border: 1.5px solid transparent; border-radius: 4px; background: var(--k); }
.sess-key[data-empty] { border-color: var(--line); background: transparent; }
.sess-keylabel { display: none; }
.sess-text { grid-area: text; display: grid; gap: 2px; min-inline-size: 0; }
.sess-carry { display: none; margin: 0; color: var(--muted); font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.3; }
.sess-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 0; font-size: 1.1875rem; line-height: 1.25; }
.sess-meta { margin: 0; color: var(--muted); font-size: 0.8125rem; font-weight: var(--w-text); line-height: 1.4; overflow-wrap: anywhere; }
.sess-dirty { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.8125rem; font-weight: var(--w-text); letter-spacing: 0; white-space: nowrap; }
.sess-dot { flex: none; box-sizing: border-box; inline-size: 9px; block-size: 9px; border: 1.5px solid var(--ink); border-radius: 50%; background: var(--k); }

.sess-list .sess-open { display: inline; block-size: auto; min-block-size: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--ink); font: inherit; letter-spacing: inherit; text-align: start; overflow-wrap: anywhere; cursor: pointer; }
.sess-list .sess-open::after { content: ""; position: absolute; inset: 0; border-radius: 20px; }
.sess-list .sess-open:is(:hover, :active) { background: transparent; }
.sess-list .sess-open:focus-visible { outline: none; }
.sess-card:has(.sess-open:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) {
  .sess-card:has(.sess-open:hover) { box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--line) 40%, var(--muted)); }
}

.sess-list .sess-delete { grid-area: delete; position: relative; z-index: 1; inline-size: max(36px, var(--target)); min-inline-size: 0; block-size: max(36px, var(--target)); padding: 0; color: var(--muted); opacity: 0; }
.sess-list .sess-delete:is(:hover, :focus-visible) { color: var(--ink); }
.sess-card:is(:hover, :focus-within) .sess-delete, .sess-list .sess-delete[aria-expanded="true"] { opacity: 1; }
@media (hover: none) {
  .sess-list .sess-delete { opacity: 1; }
}
.sess-bin { display: block; inline-size: 16px; block-size: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

/* The one to carry on with. */
.sess-item[data-first] .sess-row { padding: 18px 12px 18px 22px; gap: 14px 24px; }
.sess-item[data-first] .sess-carry { display: block; }
.sess-item[data-first] .sess-title { font-size: 1.875rem; line-height: 1.1; }
.sess-item[data-first] .sess-text { gap: 3px; }
@container sess (inline-size >= 420px) {
  .sess-item[data-first] .sess-keys { grid-template-columns: repeat(8, 20px); gap: 4px; }
  .sess-item[data-first] .sess-key { block-size: 20px; border-radius: 6px; }
}
@container sess (inline-size >= 760px) {
  .sess-item[data-first] .sess-row { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "text keys delete"; }
  .sess-item[data-first] .sess-keys { grid-template-columns: repeat(8, minmax(0, 66px)); gap: 5px; }
  .sess-item[data-first] .sess-key { display: flex; align-items: center; block-size: auto; min-block-size: 32px; padding: 3px 9px; border-radius: 10px; color: var(--on-key); }
  .sess-item[data-first] .sess-keylabel { display: block; min-inline-size: 0; overflow: hidden; font-size: 0.8125rem; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .sess-item[data-first] .sess-key[data-empty] .sess-keylabel { display: none; }
}

@media (prefers-reduced-motion: no-preference) {
  .sess-card { transition: box-shadow 140ms ease-out, scale 200ms var(--spring); }
  .sess-card:has(.sess-open:active) { scale: 0.99; }
  .sess-list .sess-delete { transition: opacity 120ms ease-out, color 120ms ease-out, background-color 120ms ease-out, scale 200ms var(--spring); }
  .sess-list .sess-delete:active { scale: 0.92; }
}
@media (forced-colors: active) {
  .sess-card { border: 1px solid CanvasText; }
  .sess-key[data-empty] { border-style: dashed; }
  .sess-dot { background: CanvasText; }
}
`;

const DAY = 86_400_000;

/** The calendar day a moment falls on, where the user is, as a count of days. */
const dayOf = (time: number): number => {
  const d = new Date(time);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

const ago = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/** When something happened, as you'd say it: "just now", "5 minutes ago", "yesterday", and a date beyond a month. */
const editedWhen = (then: number, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return ago(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  const days = dayOf(now) - dayOf(then);
  // Late last night is still "3 hours ago" in the small hours.
  if (days < 1 || hours < 6) return ago(hours, 'hour');
  if (days === 1) return 'yesterday';
  if (days < 14) return ago(days, 'day');
  if (days <= 31) return ago(Math.floor(days / 7), 'week');
  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

/** The time now, kept fresh while `active`: on a timer, and when the tab comes back into view. */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
};

const nameOf = (session: SessionSummary): string => session.configName.trim() || 'Untitled';

/** The files a session came from, in words. */
const cameFrom = ({ files }: SessionSummary): string =>
  [files.me1, files.meu].filter(Boolean).join(' + ') || 'started from scratch';

/** A session's 16 keys as the ME-1 lays them out: an assigned key is a block of its colour, an empty one an open slot. */
const KeyPicture = ({ keys }: { readonly keys: SessionSummary['keys'] }) => (
  <div className="sess-keys" aria-hidden="true">
    {Array.from({ length: 16 }, (_, index) => {
      const key = keys[index];
      const empty = !key || key.type === 'unassigned';
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the 16 keys are fixed places
          key={index}
          className="sess-key"
          data-empty={empty ? '' : undefined}
          style={empty ? undefined : keyStyle(index)}
        >
          <span className="display sess-keylabel">{key?.label}</span>
        </span>
      );
    })}
  </div>
);

const Bin = () => (
  <svg className="sess-bin" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 4.25h11M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 8.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8l.6-8.2M6.75 7v3.5M9.25 7v3.5" />
  </svg>
);

interface SessionCardProps {
  readonly session: SessionSummary;
  readonly first: boolean;
  readonly now: number;
  /** Whether this card's delete dialog is open. */
  readonly asking: boolean;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}

const SessionCard = ({ session, first, now, asking, onOpen, onDelete }: SessionCardProps) => {
  const name = nameOf(session);
  const when = editedWhen(session.savedAt, now);
  const saved = new Date(session.savedAt);
  return (
    <li className="sess-item" data-first={first ? '' : undefined} data-session={session.id}>
      <article className="card sess-card">
        <div className="sess-row">
          <KeyPicture keys={session.keys} />
          <div className="sess-text">
            {first && <p className="sess-carry">Carry on with</p>}
            <h3 className="display sess-title">
              <Action
                kind="ghost"
                className="sess-open"
                aria-label={`Open ${name}, edited ${when}`}
                onPress={onOpen}
              >
                {name}
              </Action>
              {session.dirty && (
                <span className="sess-dirty">
                  <span className="sess-dot" style={keyStyle(1)} aria-hidden="true" />
                  not exported yet
                </span>
              )}
            </h3>
            <p className="sess-meta">
              <time dateTime={saved.toISOString()} title={saved.toLocaleString()}>
                {when}
              </time>
              {' · '}
              {cameFrom(session)}
            </p>
          </div>
          <Action
            kind="ghost"
            className="sess-delete"
            aria-label={`Delete ${name}`}
            aria-haspopup="dialog"
            aria-expanded={asking}
            onPress={onDelete}
          >
            <Bin />
          </Action>
        </div>
      </article>
    </li>
  );
};

/**
 * Past sessions, newest first, each one click from the editor; nothing is
 * rendered when there are none. Deleting asks first, then moves focus to the
 * session that takes the deleted one's place (or to `emptyFocus`, when it was
 * the last).
 */
export const SessionList = ({
  emptyFocus,
}: {
  /** Where focus goes when the last session is deleted. */
  readonly emptyFocus: RefObject<TamaguiElement | null>;
}) => {
  const sessions = useAtomValue(sessionsAtom);
  const openSession = useSetAtom(openSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const headingId = useId();
  const list = useRef<HTMLUListElement>(null);
  // The session being asked about stays in `asked` while the dialog closes, so its words don't vanish first.
  const [asked, setAsked] = useState<SessionSummary | null>(null);
  const [asking, setAsking] = useState(false);
  /** After a delete: the session to focus (`''` for none left), once the list has re-rendered. */
  const focusNext = useRef<string | null>(null);
  // A session saved a moment ago can be newer than the last tick.
  const now = Math.max(useNow(sessions.length > 0), sessions[0]?.savedAt ?? 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the list changes, which is when the deleted card has gone
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    const target = next
      ? list.current?.querySelector<HTMLElement>(`[data-session="${CSS.escape(next)}"] .sess-open`)
      : (emptyFocus.current as unknown as HTMLElement | null);
    target?.focus();
  }, [sessions, emptyFocus]);

  const closeDialog = (confirmed: boolean) => {
    setAsking(false);
    if (!confirmed || !asked) return;
    const at = sessions.findIndex((s) => s.id === asked.id);
    const neighbour = sessions[at + 1] ?? sessions[at - 1];
    focusNext.current = neighbour?.id ?? '';
    deleteSession(asked.id);
    announce(`Deleted ${nameOf(asked)}`);
  };

  return (
    <>
      <style href="sess" precedence="default">
        {SESS_CSS}
      </style>
      {sessions.length > 0 && (
        <section className="home-section" aria-labelledby={headingId}>
          <h2 id={headingId} className="display home-h2">
            Your sessions
          </h2>
          <ul ref={list} className="sess-list" aria-labelledby={headingId}>
            {sessions.map((session, index) => (
              <SessionCard
                key={session.id}
                session={session}
                first={index === 0}
                now={now}
                asking={asking && asked?.id === session.id}
                onOpen={() => void openSession(session.id)}
                onDelete={() => {
                  setAsked(session);
                  setAsking(true);
                }}
              />
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={asking}
        title="Delete this session?"
        confirmLabel="Delete"
        onClose={closeDialog}
      >
        {asked && (
          <>
            <b>{nameOf(asked)}</b>, edited {editedWhen(asked.savedAt, now)}, will be removed from
            this browser. This can’t be undone.
            {asked.dirty && ' It has changes that haven’t been exported.'}
          </>
        )}
      </ConfirmDialog>
    </>
  );
};
