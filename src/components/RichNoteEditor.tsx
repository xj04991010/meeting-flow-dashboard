import { useEditor, EditorContent, mergeAttributes, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import type { EditorProps } from '@tiptap/pm/view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const InlineDateLinkNode = Node.create({
  name: 'inlineDateLink',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      date: { default: null },
      label: { default: null },
      source: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.inline-date-link',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            id: element.getAttribute('data-id'),
            date: element.getAttribute('data-date'),
            label: element.getAttribute('data-label'),
            source: element.getAttribute('data-source'),
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
        'data-id': HTMLAttributes.id,
        'data-date': HTMLAttributes.date,
        'data-label': HTMLAttributes.label,
        'data-source': HTMLAttributes.source,
      }),
      ['span', { class: 'inline-date-link-label' }, HTMLAttributes.label],
      ['span', { class: 'inline-date-link-date' }, HTMLAttributes.date ? HTMLAttributes.date.slice(5).replace('-', '/') : ''],
    ];
  },
});


export type RichNoteEditorProps = {
  content: string;
  placeholder?: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelectionChange?: (target: HTMLElement) => void;
  onInlineDateClick?: (link: { id: string; label: string; date: string; source?: string }) => void;
  onAtSignTrigger?: (currentHtml: string, target: HTMLElement, selectedText?: string) => void;
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
  onChange,
  onFocus,
  onBlur,
  onSelectionChange,
  onInlineDateClick,
  onAtSignTrigger,
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
    onAtSignTrigger,
  });
  useLayoutEffect(() => {
    callbacksRef.current = {
      onChange,
      onFocus,
      onBlur,
      onSelectionChange,
      onInlineDateClick,
      onAtSignTrigger,
    };
  }, [onAtSignTrigger, onBlur, onChange, onFocus, onInlineDateClick, onSelectionChange]);

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
    Placeholder.configure({
      placeholder: placeholder || '在這裡輸入...',
      emptyEditorClass: 'is-editor-empty',
    }),
  ]), [placeholder]);

  const editorProps = useMemo<EditorProps>(() => ({
    handleTextInput: (view, from, to, text) => {
      if (text !== '@' && text !== '＠') return false;
      const trigger = callbacksRef.current.onAtSignTrigger;
      if (!trigger) return false;

      const selectedText = view.state.doc.textBetween(from, to, ' ').trim();
      const currentText = getEditorPlainText(view.dom as HTMLElement);
      trigger(currentText + '@', view.dom as HTMLElement, selectedText);
      return true;
    },
    handleDOMEvents: {
      mouseup: (view, event) => {
        if (event.target instanceof Element && event.target.closest('.inline-date-link')) {
          return false;
        }
        callbacksRef.current.onSelectionChange?.(view.dom as HTMLElement);
        return false;
      },
      keyup: (view) => {
        callbacksRef.current.onSelectionChange?.(view.dom as HTMLElement);
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
    },
  }), []);

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
      isUpdatingRef.current = true;
      callbacksRef.current.onChange(plainText);
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
