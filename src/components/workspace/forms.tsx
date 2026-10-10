'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, Plus, Paperclip } from 'lucide-react';
import { fileRefSchema, type FileRef } from '@/lib/domain';

export type Field = {
  name: string;
  label: string;
  type?:
    'text' | 'email' | 'url' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox' | 'color';
  value?: string | number | boolean | null;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
};
export type Values = Record<string, string>;
export type FormSpec = {
  title: string;
  submit: string;
  description?: string;
  fields?: Field[];
  attachments?: boolean;
  onSubmit: (values: Values, files: FileRef[]) => Promise<boolean>;
  content?: ReactNode;
};
export type FileContext = {
  demo?: boolean;
  projectId?: string;
  workspaceId?: string;
  token?: string;
};
export const uid = () => crypto.randomUUID();
export const dateValue = (value: string) => value || null;
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  ...props
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type="button"
      className={`ws-button ${secondary ? 'secondary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
export function Input({ field }: { field: Field }) {
  const id = useId();
  const common = {
    id,
    name: field.name,
    required: field.required,
    defaultValue: String(field.value ?? ''),
    min: field.min,
    max: field.max,
    step: field.step,
  };
  return (
    <label className={`ws-field ${field.type === 'checkbox' ? 'check' : ''}`} htmlFor={id}>
      <span>{field.label}</span>
      {field.type === 'textarea' ? (
        <textarea {...common} rows={4} />
      ) : field.type === 'select' ? (
        <select {...common}>
          {field.options?.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <input id={id} name={field.name} type="checkbox" defaultChecked={Boolean(field.value)} />
      ) : (
        <input {...common} type={field.type ?? 'text'} />
      )}
    </label>
  );
}
export function FileLinks({ files, token }: { files: FileRef[]; token?: string }) {
  return (
    <div className="ws-files">
      {files.map((f, i) => (
        <a
          key={i}
          href={
            f.kind === 'link'
              ? f.url
              : `/api/files?path=${encodeURIComponent(f.path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
          }
          target={f.kind === 'link' ? '_blank' : undefined}
          rel="noreferrer"
        >
          <Paperclip size={16} />
          {f.name}
          {f.kind === 'upload' && <small>{Math.ceil(f.size / 1024)} KB</small>}
        </a>
      ))}
    </div>
  );
}
export function FormDialog({
  spec,
  onClose,
  context = {},
}: {
  spec: FormSpec;
  onClose: () => void;
  context?: FileContext;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const errorFocus = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [files, setFiles] = useState<FileRef[]>([]),
    [link, setLink] = useState(''),
    [linkName, setLinkName] = useState('');
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focused?.focus();
    };
  }, []);
  async function upload(file: File | undefined) {
    if (!file) return;
    setError('');
    if (context.demo) {
      setError(
        'Demo attachments use HTTPS links. Real private uploads are available in your workspace.',
      );
      return;
    }
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file no larger than 20MB.');
      const form = new FormData();
      form.append('file', file);
      form.append('projectId', context.projectId ?? '');
      if (context.workspaceId) form.append('workspaceId', context.workspaceId);
      if (context.token) form.append('token', context.token);
      const response = await fetch('/api/files', { method: 'POST', body: form });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      setFiles((prev) => [...prev, fileRefSchema.parse(result.data)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="ws-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Values;
            if (await spec.onSubmit(values, files)) onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <div>
            <p className="ws-eyebrow">MAKE IT CLEAR</p>
            <h2 id={titleId}>{spec.title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="ws-icon"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        {spec.description && <p className="ws-muted">{spec.description}</p>}
        {spec.content}
        {spec.fields?.map((field) => (
          <Input key={field.name} field={field} />
        ))}
        {spec.attachments && (
          <fieldset className="ws-attachments">
            <legend>Files & links</legend>
            <p className="ws-muted">
              {context.demo
                ? 'Demo preview: add an HTTPS attachment link.'
                : 'Private files, up to 20MB each. ZIP source files and SVG artwork, or add an HTTPS link.'}
            </p>
            {!context.demo && (
              <label className="ws-field">
                <span>Upload file</span>
                <input
                  type="file"
                  disabled={busy}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
            )}
            <label className="ws-field">
              <span>Link name</span>
              <input value={linkName} onChange={(e) => setLinkName(e.target.value)} />
            </label>
            <label className="ws-field">
              <span>HTTPS attachment link</span>
              <input type="url" value={link} onChange={(e) => setLink(e.target.value)} />
            </label>
            <Button
              secondary
              onClick={() => {
                try {
                  setFiles([
                    ...files,
                    fileRefSchema.parse({
                      kind: 'link',
                      url: link,
                      name: linkName || 'Attachment',
                    }),
                  ]);
                  setLink('');
                  setLinkName('');
                  setError('');
                } catch {
                  setError('Add a valid HTTPS link and a name.');
                }
              }}
            >
              <Plus size={16} />
              Add link
            </Button>
            {files.map((file, i) => (
              <div className="ws-inline" key={i}>
                <span>{file.name}</span>
                <button
                  type="button"
                  className="ws-text-button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles(files.filter((_, n) => n !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </fieldset>
        )}
        {error && (
          <p ref={errorFocus} role="alert" tabIndex={-1} className="ws-error">
            {error}
          </p>
        )}
        <footer>
          <Button secondary onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : spec.submit}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
