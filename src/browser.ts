import { frameSource, type Document, type Content } from './content.ts';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let current: Document | null = null, dirty = false, busy = false;
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function api<T = any>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error || 'Request failed');
  return result;
}
function status(message: string, error = false) { el('status').textContent = message; el('status').dataset.error = String(error); }
async function action(fn: () => Promise<void>) {
  if (busy) return;
  busy = true; (el('document-editor') as HTMLFieldSetElement).disabled = true;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
  try { await fn(); } catch (error) {
    status(error instanceof Error ? error.message : 'Something went wrong', true);
    if (error instanceof ApiError && error.status === 401) showLogin();
  } finally {
    busy = false; (el('document-editor') as HTMLFieldSetElement).disabled = false;
    for (const button of document.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false;
  }
}
function showLogin() { el('login-view').hidden = false; el('workspace').hidden = true; el('owner-actions').hidden = true; }
function discard(): boolean { return !dirty || confirm('Discard unsaved changes? Export your draft first if you need to keep it.'); }
function markDirty() { dirty = true; updateRevision(); }
function updateRevision() { el('revision').textContent = current ? `Revision ${current.revision}${dirty ? ' · unsaved changes' : ' · saved'}` : ''; }
function button(label: string, callback: () => void, aria?: string) {
  const result = document.createElement('button'); result.type = 'button'; result.textContent = label;
  if (aria) result.setAttribute('aria-label', aria);
  result.addEventListener('click', callback); return result;
}
function paragraph(text: string) { const p = document.createElement('p'); p.textContent = text; return p; }
function openModal(title: string) { el('modal-title').textContent = title; el('modal-content').replaceChildren(); (el('modal') as HTMLDialogElement).showModal(); return el('modal-content'); }
function renderFrames(container: HTMLElement, sections: Content['sections']) {
  const frames = sections.map((section, index) => {
    const wrapper = document.createElement('div'); wrapper.className = 'preview-frame';
    const iframe = document.createElement('iframe'); iframe.setAttribute('sandbox', ''); iframe.referrerPolicy = 'no-referrer'; iframe.title = `Component ${index + 1}: ${section.id}`;
    iframe.srcdoc = frameSource(section); wrapper.append(iframe); return wrapper;
  });
  container.replaceChildren(...frames);
}
let previewTimer: ReturnType<typeof setTimeout>;
function preview() {
  if (!current) return;
  try { renderFrames(el('preview'), current.sections); }
  catch (error) { status(`Preview: ${error instanceof Error ? error.message : 'Invalid component'}`, true); }
}
function renderEditor() {
  el('empty').hidden = Boolean(current); el('document-editor').hidden = !current;
  if (!current) return;
  el<HTMLInputElement>('document-title').value = current.title; updateRevision();
  el('sections').replaceChildren(...current.sections.map((section, index) => {
    const card = document.createElement('div'); card.className = 'section-source';
    const meta = document.createElement('div'); meta.className = 'section-meta';
    const name = document.createElement('span'); name.textContent = `${index + 1} · ${section.id}`;
    const controls = document.createElement('div');
    const move = (delta: number) => { if (!current) return; const target = index + delta; if (target < 0 || target >= current.sections.length) return; [current.sections[index], current.sections[target]] = [current.sections[target], current.sections[index]]; markDirty(); renderEditor(); };
    controls.append(button('↑', () => move(-1), `Move component ${index + 1} up`), button('↓', () => move(1), `Move component ${index + 1} down`), button('Remove', () => { if (current && current.sections.length > 1 && confirm('Remove this component?')) { current.sections.splice(index, 1); markDirty(); renderEditor(); } else if (current?.sections.length === 1) status('Keep at least one component.', true); }));
    meta.append(name, controls); card.append(meta);
    for (const field of ['html', 'css'] as const) {
      const label = document.createElement('label'); label.textContent = field.toUpperCase(); label.htmlFor = `${section.id}-${field}`;
      const textarea = document.createElement('textarea'); textarea.id = label.htmlFor; textarea.dataset.field = field; textarea.value = section[field]; textarea.spellcheck = false;
      textarea.addEventListener('input', () => { section[field] = textarea.value; markDirty(); clearTimeout(previewTimer); previewTimer = setTimeout(preview, 250); });
      card.append(label, textarea);
    }
    return card;
  }));
  preview();
}
async function list() {
  const docs = await api<{ id: string; title: string; revision: number }[]>('/documents');
  el('documents').replaceChildren(...docs.map(doc => {
    const entry = button(doc.title, () => { if (!discard()) return; void action(async () => { current = await api(`/documents/${doc.id}`); dirty = false; renderEditor(); await list(); status('Document loaded.'); }); });
    entry.className = 'document-link'; entry.setAttribute('aria-current', String(current?.id === doc.id));
    const small = document.createElement('small'); small.textContent = `Revision ${doc.revision}`; entry.append(small); return entry;
  }));
}
async function workspace() { el('login-view').hidden = true; el('workspace').hidden = false; el('owner-actions').hidden = false; await list(); renderEditor(); }
async function newDocument() {
  if (!discard()) return;
  await action(async () => {
    current = await api('/documents', 'POST', { title: 'Untitled document', sections: [{ id: crypto.randomUUID(), html: '<h1>A fresh start.</h1><p>Ask your agent to turn your ideas into a document, or start editing here.</p>', css: 'h1{color:#276c54;font-family:Georgia,serif}p{color:#64736f}' }] });
    dirty = false; renderEditor(); await list(); status('Private document created.');
  });
}
el('login-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => { await api('/login', 'POST', { key: el<HTMLInputElement>('owner-key').value }); el<HTMLInputElement>('owner-key').value = ''; await workspace(); status('Workspace opened.'); }); });
el('new-document').addEventListener('click', () => void newDocument()); el('empty-new').addEventListener('click', () => void newDocument());
el('document-title').addEventListener('input', () => { if (current) { current.title = el<HTMLInputElement>('document-title').value; markDirty(); } });
el('add-section').addEventListener('click', () => { if (current) { current.sections.push({ id: crypto.randomUUID(), html: '<h2>New section</h2><p>Add your content here.</p>', css: '' }); markDirty(); renderEditor(); } });
el('save').addEventListener('click', () => void action(async () => {
  if (!current) return;
  const saved = await api<Document>(`/documents/${current.id}`, 'PUT', { title: current.title, sections: current.sections, expectedRevision: current.revision });
  current = saved; dirty = false; renderEditor(); await list(); status('Saved a new revision.');
}));
el('refresh').addEventListener('click', () => void action(async () => {
  if (!current) return;
  const remote = await api<Document>(`/documents/${current.id}`);
  if (remote.revision === current.revision) { status('No newer revision. Your local edits are preserved.'); return; }
  if (!discard()) { status(`Revision ${remote.revision} is available. Export your draft, then check updates to load it.`); return; }
  current = remote; dirty = false; renderEditor(); await list(); status('Loaded the latest revision.');
}));
el('export-draft').addEventListener('click', () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `docsync-${current.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Draft exported.');
});
el('history').addEventListener('click', () => void action(async () => {
  if (!current) return;
  const id = current.id, rows = await api<{ revision: number; created_at: string }[]>(`/documents/${id}/history`);
  const content = openModal('Revision history');
  content.append(paragraph('Restoring creates a new revision. Your published snapshot stays unchanged until you republish.'));
  for (const row of rows) {
    const line = document.createElement('div'); line.className = 'history-row'; const label = document.createElement('span'); label.textContent = `Revision ${row.revision} · ${new Date(row.created_at).toLocaleString()}`;
    line.append(label, button('Restore', () => { if (!current || !discard() || !confirm(`Restore revision ${row.revision} as a new revision?`)) return; void action(async () => { current = await api(`/documents/${id}/restore`, 'POST', { revision: row.revision, expectedRevision: current!.revision }); dirty = false; renderEditor(); await list(); (el('modal') as HTMLDialogElement).close(); status('Revision restored.'); }); })); content.append(line);
  }
}));
el('publish').addEventListener('click', () => void action(async () => {
  if (!current) return;
  if (dirty) { status('Save and review your changes before publishing.', true); return; }
  const id = current.id, published = await api<{ revision: number } | null>(`/documents/${id}/publish`);
  const content = openModal('Share a reviewed snapshot');
  content.append(paragraph(published ? `Revision ${published.revision} is published. Republishing creates a new link and revokes the previous one.` : 'Anyone with the link can read the published snapshot. Draft edits stay private.'));
  content.append(button(published ? 'Republish reviewed revision' : 'Publish reviewed revision', () => void action(async () => {
    const result = await api<{ url: string; revision: number }>(`/documents/${id}/publish`, 'POST', { expectedRevision: current!.revision });
    content.replaceChildren(paragraph(`Revision ${result.revision} published. Keep this link; it is only shown now.`));
    const input = document.createElement('input'); input.value = result.url; input.readOnly = true; input.setAttribute('aria-label', 'Read-only share URL');
    content.append(input, button('Copy link', () => { void navigator.clipboard.writeText(result.url).then(() => status('Share link copied.'), () => { input.select(); status('Select and copy the link manually.'); }); })); status('Reviewed snapshot published.');
  })));
  if (published) content.append(button('Revoke link', () => { if (!confirm('Revoke the published link?')) return; void action(async () => { await api(`/documents/${id}/publish`, 'DELETE'); (el('modal') as HTMLDialogElement).close(); status('Share link revoked.'); }); }));
}));
el('connect').addEventListener('click', () => void action(async () => {
  const active = await api<{ active: boolean; allowPublishing: boolean }>('/agent-token'); const content = openModal('Connect agent');
  content.append(paragraph('Connect once, then ask DocSync to make a report and return its link. Your agent can read and edit private documents. Generating a token revokes the previous token.'));
  const permission = document.createElement('label'); permission.className = 'permission-choice';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
  permission.append(checkbox, document.createTextNode('Allow publishing read-only links (anyone with a hosted link can read the report)'));
  content.append(permission);
  content.append(button(active.active ? 'Rotate agent token' : 'Generate agent token', () => { if (active.active && !confirm('Revoke the current agent token and generate a new one?')) return; void action(async () => {
    const result = await api<{ token: string; allowPublishing: boolean }>('/agent-token', 'POST', { allowPublishing: checkbox.checked }); content.replaceChildren(paragraph(`Save this token securely; it is only shown once. ${result.allowPublishing ? 'The agent can now create a report and publish its link.' : 'This token can edit drafts but cannot publish.'} Follow the one-time plugin connection instructions in README.md.`));
    const pre = document.createElement('pre'); pre.textContent = `DOCSYNC_URL=${location.origin}\nDOCSYNC_AGENT_TOKEN=${result.token}`; content.append(pre);
  }); }));
  if (active.active) content.append(button('Revoke agent access', () => { if (!confirm('Revoke agent access?')) return; void action(async () => { await api('/agent-token', 'DELETE'); (el('modal') as HTMLDialogElement).close(); status('Agent access revoked.'); }); }));
}));
el('logout').addEventListener('click', () => { if (!discard()) return; void action(async () => { await api('/logout', 'POST'); current = null; dirty = false; showLogin(); status('Signed out.'); }); });
el('modal-close').addEventListener('click', () => (el('modal') as HTMLDialogElement).close());
el('modal').addEventListener('close', () => el('modal-content').replaceChildren());
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
void action(async () => {
  if (location.pathname.startsWith('/share/')) {
    el('shared-view').hidden = false; const token = location.pathname.slice('/share/'.length);
    const doc = await api<Content & { revision: number }>(`/shared/${encodeURIComponent(token)}`);
    el('shared-title').textContent = doc.title; el('shared-revision').textContent = `Published revision ${doc.revision} · read only`; renderFrames(el('shared-content'), doc.sections);
    document.title = `${doc.title} — DocSync`; return;
  }
  try { await api('/session'); await workspace(); } catch (error) { if (error instanceof ApiError && error.status === 401) showLogin(); else throw error; }
});
