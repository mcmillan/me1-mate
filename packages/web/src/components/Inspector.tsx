import type { Key } from '@mcmillan/2me2u-core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Input, SizableText, type TamaguiElement, Theme, XStack, YStack } from 'tamagui';
import {
  type Editable,
  type EditableKeyType,
  isStereo,
  keyLabel,
  pairStart,
  setKeyLevel,
  setKeyName,
  setKeyType,
  setMemberLevel,
  toggleMember,
} from '../lib/edit.ts';
import { editAtom, selectedKeyAtom, systemAtom } from '../lib/store.ts';
import { DISPLAY_FONT, KEY_TYPE_THEME } from '../lib/theme.ts';
import { Fader } from './Fader.tsx';
import { FieldError, useTextFieldError, WarningIcon } from './FieldError.tsx';
import { Action, Panel, PanelTitle, TypeDot } from './ui.tsx';

/**
 * The panel is a size container: in the side column it is one column; where it
 * sits full width between the keys and the channels it puts what the key is on
 * the left and what it plays on the right. The areas are named, so the order
 * in the markup is the reading and Tab order in both layouts.
 */
const CSS = `
.insp { container: insp / inline-size; }
/* The steps are taller than the title; pulled in, the header is the title's height, like the other panels'. */
.insp-steps { margin-block: -6px; }
.insp-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.insp-body > * { min-inline-size: 0; }
.insp-well { background: var(--well); }
.insp-empty { background: var(--well); border: 1px dashed var(--panel-border); }
.insp-row + .insp-row { border-block-start: 1px solid var(--panel-border); }
.insp-seg { flex: 1 1 auto; }
.insp .insp-type .insp-seg[aria-pressed="true"] {
  background: var(--panel); border-color: var(--panel-border); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
/* The fader draws its own ring (Fader.tsx). */
.insp :is(button, input:not(.fader), [tabindex]):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* A field with a problem: the red theme's color-7, as the icon under it. */
.insp .insp-fields input[aria-invalid="true"] { border-color: var(--c-color-red-600); }
@media (prefers-color-scheme: dark) {
  .insp .insp-fields input[aria-invalid="true"] { border-color: var(--c-color-red-400); }
}
.insp-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/*
 * In the side column (from 1100px, styles.css) the inspector's wrapper scrolls
 * when a long group is taller than the window. A shadow at an edge says there
 * is more that way; it needs scroll-state queries, or else scroll-driven
 * animations, and without either the scrollbar is the cue. Below 1100px the
 * wrapper doesn't scroll, and a scroll() timeline there would follow the page.
 */
@media (min-width: 1100px) {
  .workspace-inspector:has(> .insp) { container-type: scroll-state; --insp-shade: rgb(0 0 0 / 0.16); }
  @media (prefers-color-scheme: dark) { .workspace-inspector:has(> .insp) { --insp-shade: rgb(0 0 0 / 0.55); } }
  .workspace-inspector:has(> .insp)::before,
  .workspace-inspector:has(> .insp)::after {
    content: ""; display: block; position: sticky; z-index: 1; block-size: 12px;
    pointer-events: none; opacity: 0;
  }
  .workspace-inspector:has(> .insp)::before {
    inset-block-start: 0; margin-block-end: -12px;
    background: radial-gradient(farthest-side at 50% 0, var(--insp-shade), transparent);
  }
  .workspace-inspector:has(> .insp)::after {
    inset-block-end: 0; margin-block-start: -12px;
    background: radial-gradient(farthest-side at 50% 100%, var(--insp-shade), transparent);
  }
  @container scroll-state(scrollable: block-start) { .workspace-inspector:has(> .insp)::before { opacity: 1; } }
  @container scroll-state(scrollable: block-end) { .workspace-inspector:has(> .insp)::after { opacity: 1; } }
  @supports not (container-type: scroll-state) {
    .workspace-inspector:has(> .insp)::before,
    .workspace-inspector:has(> .insp)::after { animation: insp-shade linear both; animation-timeline: scroll(); }
    .workspace-inspector:has(> .insp)::before { animation-range: 0 2rem; }
    .workspace-inspector:has(> .insp)::after { animation-direction: reverse; animation-range: calc(100% - 2rem) 100%; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .workspace-inspector:has(> .insp)::before,
    .workspace-inspector:has(> .insp)::after { transition: opacity 150ms ease-out; }
  }
}
@keyframes insp-shade { to { opacity: 1; } }
@container insp (inline-size >= 580px) {
  .insp-body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto auto 1fr;
    grid-template-areas: "display plays" "type plays" "fields plays";
    column-gap: 20px;
  }
  .insp-display { grid-area: display; }
  .insp-type { grid-area: type; }
  .insp-fields { grid-area: fields; }
  .insp-plays { grid-area: plays; padding-inline-start: 20px; border-inline-start: 1px solid var(--panel-border); }
}
@media (prefers-reduced-motion: no-preference) {
  .insp-seg { transition: background-color 130ms ease-out, border-color 130ms ease-out, box-shadow 130ms ease-out; }
}
/*
 * Forced colours drop author backgrounds and shadows, so "recessed" becomes an
 * outline and "pressed" the system's highlight pair. The pressed segment opts
 * out of forcing (the text's backplate would hide it on the highlight), with
 * its background, text, dot and ring all set from that pair.
 */
@media (forced-colors: active) {
  .insp-well:not(.insp-type) { outline: 1px solid CanvasText; outline-offset: -1px; }
  .insp-type .insp-seg [aria-hidden="true"]:not(.insp-ring) { background: ButtonText; }
  .insp .insp-type .insp-seg .insp-ring { border-color: ButtonText; }
  .insp .insp-type .insp-seg[aria-pressed="true"] {
    forced-color-adjust: none; background: Highlight; border-color: Highlight; color: HighlightText;
  }
  .insp .insp-type .insp-seg[aria-pressed="true"]:focus-visible { outline-color: CanvasText; }
  .insp .insp-type .insp-seg[aria-pressed="true"] * { color: HighlightText; }
  .insp-type .insp-seg[aria-pressed="true"] [aria-hidden="true"]:not(.insp-ring) { background: HighlightText; }
  .insp .insp-type .insp-seg[aria-pressed="true"] .insp-ring { border-color: HighlightText; }
}
`;

const NATIVE_FOCUSGROUP = 'focusGroup' in HTMLElement.prototype;

const TYPES: readonly (readonly [type: EditableKeyType, label: string])[] = [
  ['unassigned', 'Empty'],
  ['channel', 'Channel'],
  ['group', 'Group'],
  ['auto', 'Auto'],
];

/**
 * Sizes for the small buttons, set inline because Action's own minimum is
 * taller: 28px, or the touch target where the pointer is a finger.
 */
const ICON_SIZE = {
  inlineSize: 'max(28px, var(--target))',
  blockSize: 'max(28px, var(--target))',
  minInlineSize: 0,
  minBlockSize: 0,
} as const;
const SEGMENT = {
  blockSize: 'max(28px, var(--target))',
  minInlineSize: 'var(--target)',
  minBlockSize: 0,
} as const;

const Chevron = ({ back = false }: { readonly back?: boolean }) => (
  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Cross = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="m4 4 8 8m0-8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

/** A step to the previous or next key. At the ends it stays focusable, so focus isn't dropped there. */
const Step = ({
  label,
  back = false,
  off,
  onPress,
}: {
  label: string;
  back?: boolean;
  off: boolean;
  onPress: () => void;
}) => (
  <Action
    kind="ghost"
    p="0"
    style={ICON_SIZE}
    aria-label={label}
    aria-disabled={off}
    opacity={off ? 0.35 : 1}
    cursor={off ? 'not-allowed' : 'pointer'}
    color="color-10"
    {...(off ? { bg: 'transparent' } : {})}
    onPress={() => {
      if (!off) onPress();
    }}
  >
    <Chevron back={back} />
  </Action>
);

/** The heading of a part of the inspector, and the look of a field's label. */
const Sub = ({ children, id }: { children: ReactNode; id?: string }) => (
  <SizableText
    size="xs"
    fontWeight="600"
    color="color-10"
    render="h3"
    m="0"
    {...(id ? { id } : {})}
  >
    {children}
  </SizableText>
);

const Hint = ({ children, id }: { children: ReactNode; id?: string }) => (
  <SizableText size="xs" color="color-8" {...(id ? { id } : {})}>
    {children}
  </SizableText>
);

/**
 * The key's label, large, the way the ME-1 writes it. Only a label the key or
 * its channel really has is said to be what the ME-1 shows; a stand-in (an
 * unnamed group, Auto, a channel number) is muted and marked as no label.
 */
const Display = ({ system, keyValue: key }: { system: Editable; keyValue: Key }) => {
  const named =
    key.type === 'channel'
      ? Boolean(key.name || system.channels[key.channel - 1]?.name)
      : (key.type === 'group' || key.type === 'unknown') && Boolean(key.name);
  return (
    <XStack
      className="insp-display insp-well"
      items="center"
      gap="2.5"
      pl="2"
      pr="3"
      minH={40}
      rounded="lg"
    >
      <Theme name={KEY_TYPE_THEME[key.type] ?? null}>
        <YStack
          w={4}
          h={24}
          rounded="full"
          bg={key.type === 'unassigned' ? 'color-5' : 'color-9'}
          shrink={0}
          aria-hidden
        />
      </Theme>
      {named && <span className="insp-sr">The ME-1 shows </span>}
      <SizableText
        size="xl"
        fontFamily={DISPLAY_FONT}
        fontWeight="600"
        letterSpacing={0.5}
        color={named ? 'color' : 'color-8'}
        numberOfLines={1}
        flex={1}
        minW={0}
        aria-hidden={key.type === 'unassigned'}
      >
        {keyLabel(system, key)}
      </SizableText>
      <SizableText size="xs" color="color-8" shrink={0} aria-hidden={named}>
        {named ? 'on the ME-1' : 'no label'}
      </SizableText>
    </XStack>
  );
};

/**
 * The key's type: four toggle buttons that are one stop in the Tab order. Tab
 * lands on the pressed one (the first, for a type that isn't offered); Left
 * and Right, Home and End move between them, and Space or Enter chooses.
 *
 * `focusgroup` does this where the browser has it (`nomemory`, so the way in
 * is always the pressed button, marked `focusgroupstart`). Elsewhere a roving
 * tabindex does the same: the stop follows focus while it is inside, so Tab
 * always leaves the group, and goes back to the pressed button after.
 */
const TypeSwitch = ({ index, type }: { index: number; type: Key['type'] }) => {
  const edit = useSetAtom(editAtom);
  const [focused, setFocused] = useState<EditableKeyType | null>(null);
  const pressed = TYPES.find(([t]) => t === type)?.[0] ?? 'unassigned';
  const stop = focused ?? pressed;
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
    const at = buttons.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : step === undefined
            ? undefined
            : (at + step + buttons.length) % buttons.length;
    if (next === undefined) return;
    e.preventDefault();
    buttons[next]?.focus();
  };
  return (
    <XStack
      className="insp-type insp-well"
      role="group"
      aria-label={`Key ${index + 1} type`}
      p={3}
      gap={2}
      rounded="lg"
      {...({ focusgroup: 'toolbar wrap nomemory' } as Record<string, string>)}
      {...(NATIVE_FOCUSGROUP
        ? {}
        : {
            onKeyDown,
            onBlur: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
            },
          })}
    >
      {TYPES.map(([t, label]) => {
        const on = type === t;
        return (
          <Action
            key={t}
            className="insp-seg"
            kind="ghost"
            aria-pressed={on}
            {...(NATIVE_FOCUSGROUP
              ? ((t === pressed ? { focusgroupstart: '' } : {}) as Record<string, string>)
              : { tabIndex: t === stop ? 0 : -1, onFocus: () => setFocused(t) })}
            px="1.5"
            gap="1.5"
            rounded="md"
            style={SEGMENT}
            onPress={() => edit((s) => setKeyType(s, index, t))}
          >
            {t === 'unassigned' ? (
              <YStack
                className="insp-ring"
                w={8}
                h={8}
                rounded="full"
                borderWidth={1.5}
                borderColor="color-8"
                shrink={0}
                aria-hidden
              />
            ) : (
              <TypeDot type={t} />
            )}
            <SizableText size="sm" fontWeight="500" color={on ? 'color' : 'color-10'}>
              {label}
            </SizableText>
          </Action>
        );
      })}
    </XStack>
  );
};

/** A label, an optional hint beside it, the control, then its problem. */
const Field = ({
  label,
  htmlFor,
  hint,
  hintId,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error: ReactNode;
  children: ReactNode;
}) => (
  <YStack gap="1">
    <XStack items="baseline" justify="space-between" columnGap="2" flexWrap="wrap">
      <SizableText
        size="xs"
        fontWeight="600"
        color="color-10"
        {...(htmlFor ? { render: 'label', htmlFor } : {})}
      >
        {label}
      </SizableText>
      {hint && <Hint {...(hintId ? { id: hintId } : {})}>{hint}</Hint>}
    </XStack>
    {children}
    {error}
  </YStack>
);

const LabelField = ({
  index,
  value,
  placeholder,
  hint,
}: {
  index: number;
  value: string;
  placeholder: string;
  hint: string;
}) => {
  const edit = useSetAtom(editAtom);
  const id = useId();
  const path = `keys[${index}].name`;
  const { inputProps, error } = useTextFieldError(path, `${id}-hint`);
  return (
    <Field label="Label" htmlFor={id} hint={hint} hintId={`${id}-hint`} error={error}>
      <Input
        id={id}
        className="target"
        size="sm"
        maxLength={6}
        pattern="[0-9A-Za-z ]{1,6}"
        value={value}
        placeholder={placeholder}
        fontFamily={DISPLAY_FONT}
        onChangeText={(name) => edit((s) => setKeyName(s, index, name), path)}
        data-issue-path={path}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        {...inputProps}
      />
    </Field>
  );
};

const LevelField = ({ index, keyValue: key }: { index: number; keyValue: Key }) => {
  const edit = useSetAtom(editAtom);
  if (key.type === 'unassigned' || key.type === 'unknown') return null;
  const path = `keys[${index}].level`;
  const master = key.type === 'group';
  return (
    <Field label={master ? 'Master level' : 'Level'} error={<FieldError path={path} />}>
      <YStack data-issue-path={path} pt="0.5">
        <Fader
          value={key.level}
          onChange={(level, { merge }) =>
            edit((s) => setKeyLevel(s, index, level), merge ? path : undefined)
          }
          label={`Key ${index + 1} ${master ? 'master level' : 'level'}`}
        />
      </YStack>
    </Field>
  );
};

/**
 * "7", or "7+8" for a stereo pair, which a key refers to by its first channel.
 * (A reference to the second is a problem the field reports, and reads as "8".)
 */
const numbersOf = (system: Editable, channel: number): string =>
  isStereo(system, channel) && pairStart(channel) === channel
    ? `${channel}+${channel + 1}`
    : String(channel);

/** How a channel is read out: "KitPad 7+8 stereo", "Channel 3". */
const spokenName = (system: Editable, channel: number): string =>
  `${system.channels[channel - 1]?.name || 'Channel'} ${numbersOf(system, channel)}${
    isStereo(system, channel) ? ' stereo' : ''
  }`;

const StereoMark = () => (
  <SizableText
    size="xs"
    fontWeight="600"
    color="color-10"
    px="1"
    rounded="sm"
    borderWidth={1}
    borderColor="border-color"
    shrink={0}
    aria-hidden
  >
    ST
  </SizableText>
);

/** The one channel a channel key plays. It changes by picking another in the Channels panel. */
const PlaysChannel = ({
  index,
  channel,
  onGroup,
}: {
  index: number;
  channel: number;
  onGroup: () => void;
}) => {
  const system = useAtomValue(systemAtom);
  const id = useId();
  const path = `keys[${index}].channel`;
  const name = system.channels[channel - 1]?.name;
  return (
    <YStack className="insp-plays" gap="2">
      <Sub id={`${id}-h`}>Plays</Sub>
      <YStack gap="1">
        <XStack
          className="insp-well"
          role="group"
          aria-labelledby={`${id}-h`}
          aria-describedby={`${id}-more`}
          tabIndex={-1}
          data-issue-path={path}
          items="center"
          gap="2"
          px="3"
          minH={40}
          rounded="lg"
        >
          <span className="insp-sr">{spokenName(system, channel)}</span>
          <SizableText
            size="xs"
            fontFamily={DISPLAY_FONT}
            fontWeight="600"
            color="color-10"
            shrink={0}
            aria-hidden
          >
            Ch {numbersOf(system, channel)}
          </SizableText>
          <SizableText
            size="sm"
            fontFamily={name ? DISPLAY_FONT : undefined}
            fontWeight={name ? '600' : '400'}
            color={name ? 'color' : 'color-8'}
            numberOfLines={1}
            flex={1}
            minW={0}
            aria-hidden
          >
            {name || 'No name'}
          </SizableText>
          {isStereo(system, channel) && <StereoMark />}
        </XStack>
        <YStack id={`${id}-more`}>
          <Hint>Pick another channel in Channels to change it.</Hint>
          <FieldError path={path} />
        </YStack>
      </YStack>
      <Action kind="subtle" self="flex-start" className="target" gap="1.5" onPress={onGroup}>
        <TypeDot type="group" />
        Make it a group
      </Action>
    </YStack>
  );
};

/** Line heights for the two-line channel name in a member row, so eight rows fit the side column. */
const TIGHT = { lineHeight: '16px' } as const;
const TIGHTER = { lineHeight: '14px' } as const;

/** A group's channels, each with its level in the group and a way out of it. */
const PlaysGroup = ({ index, keyValue: key }: { index: number; keyValue: Key }) => {
  const system = useAtomValue(systemAtom);
  const edit = useSetAtom(editAtom);
  const root = useRef<TamaguiElement>(null);
  /** The row a channel was just removed from with its button, to keep focus in the list. */
  const removedAt = useRef<number | null>(null);
  const members = key.type === 'group' ? key.members : [];
  const n = index + 1;

  // Runs after every render: a removal's row is gone by then.
  useEffect(() => {
    const at = removedAt.current;
    if (at === null) return;
    removedAt.current = null;
    const list = root.current as HTMLElement | null;
    const buttons = list?.querySelectorAll<HTMLElement>('[data-insp-remove]') ?? [];
    (buttons[Math.min(at, buttons.length - 1)] ?? list)?.focus();
  });

  return (
    <YStack
      className="insp-plays"
      ref={root}
      tabIndex={-1}
      role="group"
      aria-label={`Key ${n} channels`}
      gap="2"
    >
      <XStack items="baseline" justify="space-between" gap="2">
        <Sub>
          Channels
          {members.length > 0 && (
            <SizableText size="xs" color="color-8" fontWeight="400">
              {` · ${members.length}`}
            </SizableText>
          )}
        </Sub>
        {members.length > 0 && <Hint>Level in the group, dB</Hint>}
      </XStack>
      {members.length === 0 ? (
        <YStack className="insp-empty" gap="1" p="3" rounded="lg">
          <SizableText size="sm" fontWeight="600">
            No channels yet
          </SizableText>
          <SizableText size="sm" color="color-10">
            Pick channels in Channels to add them to this group. Each gets its own level here.
          </SizableText>
        </YStack>
      ) : (
        <YStack render="ul" role="list" m="0" p="0">
          {members.map((m, j) => {
            const name = system.channels[m.channel - 1]?.name;
            const stereo = isStereo(system, m.channel);
            const spoken = spokenName(system, m.channel);
            const path = `keys[${index}].members[${j}]`;
            return (
              <YStack
                key={m.channel}
                className="insp-row"
                render="li"
                data-issue-path={path}
                py={2.5}
              >
                <XStack items="center" gap="2" minH={30}>
                  <span className="insp-sr">{spoken}</span>
                  <YStack w={56} shrink={0} aria-hidden>
                    <SizableText
                      size="sm"
                      fontFamily={DISPLAY_FONT}
                      fontWeight="600"
                      numberOfLines={1}
                      style={TIGHT}
                    >
                      {name || `Ch ${m.channel}`}
                    </SizableText>
                    {(name || stereo) && (
                      <XStack items="center" gap="1">
                        <SizableText
                          size="xs"
                          fontFamily={DISPLAY_FONT}
                          color="color-8"
                          style={TIGHTER}
                        >
                          {name
                            ? numbersOf(system, m.channel)
                            : numbersOf(system, m.channel).slice(String(m.channel).length)}
                        </SizableText>
                        {stereo && (
                          <SizableText size="xs" color="color-8" fontWeight="600" style={TIGHTER}>
                            ST
                          </SizableText>
                        )}
                      </XStack>
                    )}
                  </YStack>
                  <YStack flex={1} minW={0} data-issue-path={`${path}.level`}>
                    <Fader
                      compact
                      value={m.level}
                      onChange={(level, { merge }) =>
                        edit(
                          (s) => setMemberLevel(s, index, m.channel, level),
                          merge ? `${path}.level` : undefined,
                        )
                      }
                      label={`${spoken} level in key ${n}`}
                    />
                  </YStack>
                  <Action
                    kind="ghost"
                    p="0"
                    style={ICON_SIZE}
                    color="color-10"
                    data-insp-remove
                    // Where the Problems list lands for a problem with the channel itself.
                    data-issue-focus
                    aria-label={`Remove ${spoken} from key ${n}`}
                    onPress={() => {
                      removedAt.current = j;
                      edit((s) => toggleMember(s, index, m.channel));
                    }}
                  >
                    <Cross />
                  </Action>
                </XStack>
                <FieldError path={path} />
              </YStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
};

/**
 * The selected key's editor: its label as the ME-1 shows it, its type, and by
 * type its label, level and then what it plays, in that order for every type. Channels are picked in the Channels
 * panel; this shows the result and holds the rest.
 */
export const Inspector = () => {
  const system = useAtomValue(systemAtom);
  const edit = useSetAtom(editAtom);
  const [index, setIndex] = useAtom(selectedKeyAtom);
  const body = useRef<HTMLDivElement>(null);
  /** Set when an action replaces itself with the type switch's state, to send focus there. */
  const focusType = useRef(false);
  const key = system.keys[index];
  const type = key?.type;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the type changes
  useEffect(() => {
    if (!focusType.current) return;
    focusType.current = false;
    body.current?.querySelector<HTMLElement>('.insp-type [aria-pressed="true"]')?.focus();
  }, [type]);

  if (!key) return null;
  const n = index + 1;
  const last = system.keys.length - 1;

  return (
    <Panel
      className="insp"
      render="section"
      aria-label={`Key ${n}`}
      data-issue-path={`keys[${index}]`}
      p={{ default: '3', sm: '4' }}
    >
      <style href="insp" precedence="default">
        {CSS}
      </style>
      <XStack items="center" justify="space-between" gap="2">
        <PanelTitle>Key {n}</PanelTitle>
        <XStack className="insp-steps" gap="1">
          <Step label="Previous key" back off={index <= 0} onPress={() => setIndex(index - 1)} />
          <Step label="Next key" off={index >= last} onPress={() => setIndex(index + 1)} />
        </XStack>
      </XStack>

      <div className="insp-body" ref={body}>
        <Display system={system} keyValue={key} />
        <TypeSwitch index={index} type={key.type} />

        {key.type === 'unassigned' && (
          <YStack className="insp-plays">
            <YStack className="insp-empty" p="3" rounded="lg">
              <SizableText size="sm" color="color-10">
                This key is empty. Pick a channel in Channels to give it one, or choose a type.
              </SizableText>
            </YStack>
          </YStack>
        )}

        {key.type === 'unknown' && (
          <YStack className="insp-plays" gap="1">
            <Theme name="red">
              <XStack gap="2" p="3" rounded="lg" bg="color-1" borderWidth={1} borderColor="color-6">
                <SizableText size="sm" color="color-9" pt="0.5" shrink={0}>
                  <WarningIcon />
                </SizableText>
                <SizableText size="sm" color="color-11">
                  A source this editor doesn’t cover, such as Aux Input; it’s kept as-is. Choose a
                  type to reset it.
                </SizableText>
              </XStack>
            </Theme>
            <FieldError path={`keys[${index}]`} />
          </YStack>
        )}

        {(key.type === 'auto' || key.type === 'channel' || key.type === 'group') && (
          <YStack key={`fields-${index}`} className="insp-fields" gap="3">
            {key.type !== 'auto' && (
              <LabelField
                index={index}
                value={key.name ?? ''}
                placeholder={
                  key.type === 'group'
                    ? 'Group'
                    : system.channels[key.channel - 1]?.name || String(key.channel)
                }
                hint={
                  key.type === 'group'
                    ? 'Up to 6 letters, numbers or spaces'
                    : 'Leave empty to show the channel name'
                }
              />
            )}
            <LevelField index={index} keyValue={key} />
          </YStack>
        )}

        {key.type === 'auto' && (
          <YStack className="insp-plays" gap="1">
            <Sub>Plays</Sub>
            <SizableText size="sm" color="color-10">
              Auto takes the first channel that no other key or group uses.
            </SizableText>
          </YStack>
        )}

        {key.type === 'channel' && (
          <PlaysChannel
            index={index}
            channel={key.channel}
            onGroup={() => {
              focusType.current = true;
              edit((s) => setKeyType(s, index, 'group'));
            }}
          />
        )}

        {key.type === 'group' && <PlaysGroup key={`plays-${index}`} index={index} keyValue={key} />}
      </div>
    </Panel>
  );
};
