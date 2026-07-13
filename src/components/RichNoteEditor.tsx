import { useEditor, EditorContent, Extension, mergeAttributes, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorProps, type EditorView } from '@tiptap/pm/view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const InlineDateLinkNode = Node.create({
  name: 'inlineDateLink',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      date: { default: null },
      label: { default: null },
      source: { default: null },
      start: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-date-link"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            id: element.getAttribute('data-id'),
            date: element.getAttribute('data-date'),
            label: element.getAttribute('data-label'),
            source: element.getAttribute('data-source'),
            start: element.getAttribute('data-start') === null
              ? null
              : Number(element.getAttribute('data-start')),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'inline-date-link',
        'data-type': 'inline-date-link',
        'data-id': HTMLAttributes.id,
        'data-date': HTMLAttributes.date,
        'data-label': HTMLAttributes.label,
        'data-source': HTMLAttributes.source,
        'data-start': HTMLAttributes.start,
        role: 'button',
        tabindex: '0',
        'aria-label': `${HTMLAttributes.label || '日期連結'}，${HTMLAttributes.date || ''}`,
      }),
      ['span', { class: 'inline-date-link-label' }, HTMLAttributes.label],
      ['span', { class: 'inline-date-link-date' }, HTMLAttributes.date ? HTMLAttributes.date.slice(5).replace('-', '/') : ''],
    ];
  },
});

const dateSelectionPluginKey = new PluginKey<DecorationSet>('dateSelectionHighlight');

const DateSelectionHighlight = Extension.create({
  name: 'dateSelectionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: dateSelectionPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorations) {
            if (transaction.selectionSet) {
              if (transaction.selection.empty) return DecorationSet.empty;
              return DecorationSet.create(transaction.doc, [
                Decoration.inline(transaction.selection.from, transaction.selection.to, {
                  class: 'inline-date-selection-draft',
                }),
              ]);
            }
            return decorations.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations(state) {
            return dateSelectionPluginKey.getState(state) || DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export type RichNoteSelection = {
  text: string;
  start: number;
  anchorLeft: number;
  anchorTop: number;
};


export type RichNoteEditorProps = {
  content: string;
  placeholder?: string;
  ariaLabel?: string;
  onChange: (text: string, retainedLinkIds: string[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelectionChange?: (selection: RichNoteSelection | null) => void;
  onInlineDateClick?: (link: { id: string; label: string; date: string; source?: string }) => void;
  className?: string;
};

function getEditorPlainText(target: HTMLElement) {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>('.inline-date-link').forEach((link) => {
    link.replaceWith(document.createTextNode(link.dataset.label || ''));
  });
  return clone.innerText;
}

function getContentSignature(target: HTMLElement) {
  const clone = target.cloneNode(true) as HTMLElement;
  const links = Array.from(clone.querySelectorAll<HTMLElement>('.inline-date-link')).map((link) => ({
    id: link.dataset.id || '',
    date: link.dataset.date || '',
    label: link.dataset.label || '',
    source: link.dataset.source || '',
  }));
  clone.querySelectorAll<HTMLElement>('.inline-date-link').forEach((link) => {
    link.replaceWith(document.createTextNode(link.dataset.label || ''));
  });
  return JSON.stringify({ text: clone.textContent || '', links });
}

function getHtmlSignature(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return getContentSignature(container);
}

export function RichNoteEditor({
  content,
  placeholder,
  ariaLabel,
  onChange,
  onFocus,
  onBlur,
  onSelectionChange,
  onInlineDateClick,
  className = '',
}: RichNoteEditorProps) {
  const isUpdatingRef = useRef(false);
  const lastEmittedTextRef = useRef('');
  const lastAppliedSignatureRef = useRef('');
  const [initialContent] = useState(content);
  const callbacksRef = useRef({
    onChange,
    onFocus,
    onBlur,
    onSelectionChange,
    onInlineDateClick,
  });
  useLayoutEffect(() => {
    callbacksRef.current = {
      onChange,
      onFocus,
      onBlur,
      onSelectionChange,
      onInlineDateClick,
    };
  }, [onBlur, onChange, onFocus, onInlineDateClick, onSelectionChange]);

  const extensions = useMemo(() => ([
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    InlineDateLinkNode,
    DateSelectionHighlight,
    Placeholder.configure({
      placeholder: placeholder || '在這裡輸入...',
      emptyEditorClass: 'is-editor-empty',
    }),
  ]), [placeholder]);

  const editorProps = useMemo<EditorProps>(() => {
    const notifySelection = (view: EditorView) => {
      const { from, to } = view.state.selection;
      if (from === to) {
        callbacksRef.current.onSelectionChange?.(null);
        return;
      }

      const leafText = (node: { type: { name: string }; attrs: Record<string, unknown> }) => (
        node.type.name === 'inlineDateLink' ? String(node.attrs.label || '') : ''
      );
      const rawText = view.state.doc.textBetween(from, to, '\n', leafText).replace(/\u00a0/g, ' ');
      const leadingWhitespace = rawText.length - rawText.trimStart().length;
      const text = rawText.trim();
      if (text.length < 2) {
        callbacksRef.current.onSelectionChange?.(null);
        return;
      }

      const effectiveFrom = from + leadingWhitespace;
      const start = view.state.doc.textBetween(0, effectiveFrom, '\n', leafText).length;
      const editorRect = view.dom.getBoundingClientRect();
      const browserSelection = window.getSelection();
      const rangeRect = browserSelection?.rangeCount
        ? browserSelection.getRangeAt(0).getBoundingClientRect()
        : view.coordsAtPos(to);
      const anchorLeft = Math.max(12, Math.min(rangeRect.left - editorRect.left, editorRect.width - 300));
      const anchorTop = Math.max(42, rangeRect.bottom - editorRect.top + 8);

      callbacksRef.current.onSelectionChange?.({ text, start, anchorLeft, anchorTop });
    };

    return ({
    attributes: {
      'aria-label': ariaLabel || placeholder || '進度筆記',
    },
    handleDOMEvents: {
      mouseup: (view, event) => {
        if (event.target instanceof Element && event.target.closest('.inline-date-link')) {
          return false;
        }
        notifySelection(view);
        return false;
      },
      keyup: (view) => {
        notifySelection(view);
        return false;
      },
      click: (_view, event) => {
        const target = event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('.inline-date-link')
          : null;
        const handleClick = callbacksRef.current.onInlineDateClick;
        if (!target || !handleClick) return false;
        handleClick({
          id: target.dataset.id || '',
          label: target.dataset.label || '',
          date: target.dataset.date || '',
          source: target.dataset.source || undefined,
        });
        return true;
      },
      keydown: (_view, event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return false;
        const target = event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('.inline-date-link')
          : null;
        const handleClick = callbacksRef.current.onInlineDateClick;
        if (!target || !handleClick) return false;
        event.preventDefault();
        handleClick({
          id: target.dataset.id || '',
          label: target.dataset.label || '',
          date: target.dataset.date || '',
          source: target.dataset.source || undefined,
        });
        return true;
      },
    },
  });
  }, [ariaLabel, placeholder]);

  const editor = useEditor({
    extensions,
    editorProps,
    content: initialContent,
  });

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const plainText = getEditorPlainText(editor.view.dom as HTMLElement);
      if (plainText === lastEmittedTextRef.current) return;
      lastEmittedTextRef.current = plainText;
      const retainedLinkIds = Array.from(
        (editor.view.dom as HTMLElement).querySelectorAll<HTMLElement>('.inline-date-link'),
      ).map((link) => link.dataset.id || '').filter(Boolean);
      isUpdatingRef.current = true;
      callbacksRef.current.onChange(plainText, retainedLinkIds);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    };
    const handleFocus = () => callbacksRef.current.onFocus?.();
    const handleBlur = () => callbacksRef.current.onBlur?.();
    editor.on('update', handleUpdate);
    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor]);

  // Tiptap normalizes generated HTML, so compare semantic content instead of raw markup.
  useEffect(() => {
    if (!editor || isUpdatingRef.current) return;

    let parsedContent = content;
    if (content && !content.includes('<')) {
      const container = document.createElement('div');
      container.textContent = content;
      parsedContent = `<p>${container.innerHTML.replace(/\n/g, '<br>')}</p>`;
    }

    const currentSignature = getContentSignature(editor.view.dom as HTMLElement);
    const nextSignature = getHtmlSignature(parsedContent);
    if (currentSignature === nextSignature) {
      lastAppliedSignatureRef.current = nextSignature;
      lastEmittedTextRef.current = getEditorPlainText(editor.view.dom as HTMLElement);
      return;
    }
    if (lastAppliedSignatureRef.current === nextSignature) return;

    lastAppliedSignatureRef.current = nextSignature;
    editor.commands.setContent(parsedContent, { emitUpdate: false });
    lastEmittedTextRef.current = getEditorPlainText(editor.view.dom as HTMLElement);
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`tiptap-wrapper ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
