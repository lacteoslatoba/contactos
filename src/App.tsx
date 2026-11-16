import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Phone,
  Trash2,
  Edit3,
  Sun,
  Moon,
  X,
  UserPlus,
  FileUp,
  FileDown,
  CheckCircle2,
  AlertCircle,
  Save,
  CheckSquare,
  Square,
  Menu,
  Lock,
  Unlock,
  RefreshCw,
  MessageCircle,
  MessageSquare,
  Mail,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type Contact,
  GoogleAuthError,
  getLastSync,
  getStoredToken,
  getToken,
  isGoogleConfigured,
  isGoogleConnected,
  prepareGoogle,
  queueGoogleDeletes,
  syncWithGoogle
} from './googleSync';

const STORAGE_KEY = 'premium_contacts_v1';
const CORRECT_PIN = '5151';

const AZ = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

// Soft pastel avatar tints (from the Stitch design system)
const TINTS = [
  { bg: '#ECFDF5', fg: '#047857' },
  { bg: '#FEF3C7', fg: '#B45309' },
  { bg: '#EEF2FF', fg: '#4338CA' },
  { bg: '#E0F2FE', fg: '#0369A1' },
  { bg: '#FFEDD5', fg: '#C2410C' },
  { bg: '#FCE7F3', fg: '#BE185D' },
  { bg: '#F3E8FF', fg: '#7E22CE' },
];

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const letterOf = (name: string) => {
  const first = stripAccents(name.replace(/^[^\p{L}\d]+/u, '')).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
};

const isUnnamed = (name: string) => !/\p{L}/u.test(name);

const initialsOf = (name: string) => {
  const words = name.replace(/[^\p{L}\d\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '#';
  if (isUnnamed(name)) return '#';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
};

const tintFor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
};

const timeAgo = (t: number, now: number) => {
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n));

const App: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading contacts", e);
        return [];
      }
    }
    return [];
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unnamed'>('all');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | undefined>(() => getLastSync());
  const contactsRef = React.useRef(contacts);
  contactsRef.current = contacts;
  const syncingRef = React.useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * Sync with Google Contacts. `tokenPromise` must be created synchronously inside a
   * click/keypress handler (via getToken()) so the browser allows Google's popup.
   */
  const runSync = async (tokenPromise: Promise<string>, silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const token = await tokenPromise;
      const result = await syncWithGoogle(token, contactsRef.current);
      setContacts(result.contacts);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.contacts));
      setHasUnsavedChanges(false);
      setLastSync(getLastSync());
      if (!silent || result.summary !== 'Todo al día') {
        setToast({ message: result.summary, type: result.errors ? 'error' : 'success' });
      }
    } catch (e) {
      console.error('Sync error', e);
      const msg = e instanceof GoogleAuthError
        ? `${e.message}. Toca "Sincronizar" otra vez.`
        : (e instanceof Error && e.message.startsWith('Falta') ? e.message : 'No se pudo sincronizar. Revisa tu internet.');
      if (!silent || !(e instanceof GoogleAuthError)) setToast({ message: msg, type: 'error' });
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  };

  /** Sync automatically only when it can happen without asking anything. */
  const autoSync = () => {
    const token = getStoredToken();
    if (token && isGoogleConnected()) runSync(Promise.resolve(token), true);
  };

  const handleSyncClick = () => {
    if (!isGoogleConfigured()) {
      setToast({ message: 'Falta configurar Google (ver GOOGLE_SETUP.md)', type: 'error' });
      return;
    }
    setIsMenuOpen(false);
    runSync(getToken());
  };

  /** Right after unlocking with the PIN (a keypress), Google's popup is allowed: sync on open. */
  const onUnlocked = () => {
    if (!isGoogleConfigured() || !isGoogleConnected()) return;
    runSync(getToken(), true);
  };

  useEffect(() => {
    prepareGoogle();
    const onVisible = () => { if (document.visibilityState === 'visible') autoSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    tag: 'Personal'
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    const sessionAuth = sessionStorage.getItem('app_authorized');
    if (sessionAuth === 'true') {
      setIsAuthorized(true);
      autoSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinEntry === CORRECT_PIN) {
      setIsAuthorized(true);
      sessionStorage.setItem('app_authorized', 'true');
      setPinEntry('');
      setPinError(false);
      onUnlocked();
    } else {
      setPinError(true);
      setPinEntry('');
      setTimeout(() => setPinError(false), 500);
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    sessionStorage.removeItem('app_authorized');
    setIsMenuOpen(false);
  };

  const saveToLocalStorage = (data: Contact[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setHasUnsavedChanges(false);
      setToast({ message: '¡Guardado con éxito!', type: 'success' });
      autoSync();
    } catch (e) {
      console.error("Error saving", e);
      setToast({ message: 'Error de memoria: Demasiados contactos.', type: 'error' });
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'light');
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const handleOpenModal = (contact: Contact | null = null) => {
    if (contact) {
      setEditingContact(contact);
      setFormData({
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        address: contact.address,
        tag: contact.tag
      });
    } else {
      setEditingContact(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        tag: 'Personal'
      });
    }
    setIsModalOpen(true);
    setIsDetailOpen(false);
    setIsMenuOpen(false);
  };

  const handleOpenDetail = (contact: Contact) => {
    if (isSelectionMode) {
      toggleSelect(contact.id);
    } else {
      setViewingContact(contact);
      setIsDetailOpen(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newContactsList;
    if (editingContact) {
      newContactsList = contacts.map(c =>
        c.id === editingContact.id ? { ...c, ...formData, dirty: true } : c
      );
    } else {
      const newContact: Contact = {
        id: Date.now().toString(),
        ...formData,
        avatarSeed: formData.name || 'default'
      };
      newContactsList = [newContact, ...contacts];
    }
    setContacts(newContactsList);
    setHasUnsavedChanges(true);
    setIsModalOpen(false);
  };

  const deleteContact = (id: string) => {
    if (window.confirm('¿Eliminar contacto?')) {
      queueGoogleDeletes(contacts.filter(c => c.id === id));
      const updated = contacts.filter(c => c.id !== id);
      setContacts(updated);
      setHasUnsavedChanges(true);
      if (selectedIds.has(id)) {
        const next = new Set(selectedIds);
        next.delete(id);
        setSelectedIds(next);
      }
      setIsDetailOpen(false);
    }
  };

  const deleteSelected = () => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar ${selectedIds.size} contactos?`)) {
      queueGoogleDeletes(contacts.filter(c => selectedIds.has(c.id)));
      const updated = contacts.filter(c => !selectedIds.has(c.id));
      setContacts(updated);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      setHasUnsavedChanges(true);
      setToast({ message: 'Contactos eliminados', type: 'success' });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    if (next.size === 0) setIsSelectionMode(false);
  };

  const parseVCF = (text: string): Contact[] => {
    const newContacts: Contact[] = [];
    const cardBlocks = text.split(/BEGIN:VCARD/i).slice(1);

    cardBlocks.forEach(block => {
      const lines: string[] = [];
      let currentLine = '';
      block.split(/\r?\n/).forEach(line => {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          currentLine += line.substring(1);
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = line;
        }
      });
      if (currentLine) lines.push(currentLine);

      let name = '';
      let phone = '';
      let email = '';
      let address = '';

      lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return;

        const rawKey = line.substring(0, colonIndex).toUpperCase();
        const value = line.substring(colonIndex + 1).trim();
        const key = rawKey.split(';')[0];

        if (key === 'FN' && value) {
          name = value;
        } else if (key === 'N' && !name && value) {
          name = value.split(';').filter(Boolean).reverse().join(' ').trim();
        } else if (key === 'TEL' && value) {
          if (!phone || line.toUpperCase().includes('CELL')) {
            phone = value.replace(/[^\d+]/g, '');
          }
        } else if (key === 'EMAIL' && value) {
          email = value.toLowerCase();
        } else if (key === 'ADR' && value) {
          address = value.replace(/;/g, ' ').trim();
        }
      });

      if (name || phone || email) {
        newContacts.push({
          id: Math.random().toString(36).substr(2, 9),
          name: name || phone || email || 'Sin Nombre',
          phone: phone || '',
          email: email || '',
          address: address || '',
          tag: 'Importado',
          avatarSeed: name || phone || 'default'
        });
      }
    });
    return newContacts;
  };

  const handleImportVCF = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const imported = parseVCF(content);
      if (imported.length > 0) {
        setContacts(prev => [...imported, ...prev]);
        setHasUnsavedChanges(true);
        setIsMenuOpen(false);
        setToast({ message: `Cargados ${imported.length} contactos. Pulsa Guardar.`, type: 'success' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportToVCF = () => {
    if (contacts.length === 0) {
      setToast({ message: 'Lista vacía.', type: 'error' });
      return;
    }
    let vcfText = '';
    contacts.forEach(c => {
      vcfText += 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
      vcfText += `FN:${c.name}\r\n`;
      if (c.phone) vcfText += `TEL:${c.phone}\r\n`;
      if (c.email) vcfText += `EMAIL:${c.email}\r\n`;
      if (c.address) vcfText += `ADR:;;${c.address}\r\n`;
      vcfText += 'END:VCARD\r\n';
    });
    const blob = new Blob([vcfText], { type: 'text/vcard' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mis_contactos_score.vcf');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsMenuOpen(false);
    setToast({ message: 'Score: Contactos exportados correctamente', type: 'success' });
  };

  const filteredContacts = useMemo(() => {
    const s = searchTerm.toLowerCase();
    const filtered = contacts.filter(c =>
      !s ||
      c.name.toLowerCase().includes(s) ||
      c.phone.includes(s) ||
      c.email.toLowerCase().includes(s)
    );
    // Sort A-Z by letter group ('#' last), then by name ignoring leading punctuation
    const key = (n: string) => n.replace(/^[^\p{L}\d]+/u, '');
    return [...filtered].sort((a, b) => {
      const la = letterOf(a.name), lb = letterOf(b.name);
      if (la !== lb) return la === '#' ? 1 : lb === '#' ? -1 : la.localeCompare(lb);
      return key(a.name).localeCompare(key(b.name), 'es', { sensitivity: 'base', numeric: true });
    });
  }, [contacts, searchTerm]);

  const unnamedCount = useMemo(() => contacts.filter(c => isUnnamed(c.name)).length, [contacts]);
  const visibleContacts = useMemo(
    () => (filter === 'unnamed' ? filteredContacts.filter(c => isUnnamed(c.name)) : filteredContacts),
    [filteredContacts, filter]
  );

  const groups = useMemo(() => {
    const out: { letter: string; items: Contact[] }[] = [];
    for (const c of visibleContacts) {
      const l = letterOf(c.name);
      const last = out[out.length - 1];
      if (last && last.letter === l) last.items.push(c);
      else out.push({ letter: l, items: [c] });
    }
    return out;
  }, [visibleContacts]);

  const availableLetters = useMemo(() => new Set(groups.map(g => g.letter)), [groups]);
  const allSelected = visibleContacts.length > 0 && selectedIds.size === visibleContacts.length;

  const jumpTo = (letter: string) => {
    document.getElementById(`letter-${letter}`)?.scrollIntoView({ block: 'start' });
  };

  const syncLabel = isSyncing ? 'Sincronizando…' : (lastSync ? timeAgo(lastSync, now) : 'Sincronizar');

  if (!isAuthorized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '1rem' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, x: pinError ? [0, -10, 10, -10, 10, 0] : 0 }}
          className="glass"
          style={{ width: '100%', maxWidth: '380px', padding: '2.5rem 1.75rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', borderColor: pinError ? 'var(--danger)' : undefined }}
        >
          <div style={{ background: 'var(--primary)', color: 'white', width: '64px', height: '64px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
            <Lock size={30} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.35rem' }}>Score</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.95rem' }}>Introduce tu PIN para entrar</p>

          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="••••"
              autoFocus
              value={pinEntry}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPinEntry(val);
                if (val.length === 4) {
                  if (val === CORRECT_PIN) {
                    setIsAuthorized(true);
                    sessionStorage.setItem('app_authorized', 'true');
                    onUnlocked();
                  } else {
                    setPinError(true);
                    setTimeout(() => {
                      setPinEntry('');
                      setPinError(false);
                    }, 400);
                  }
                }
              }}
              className="input-field"
              style={{ height: '64px', fontSize: '1.8rem', textAlign: 'center', letterSpacing: '0.8rem', marginBottom: '1rem', background: 'var(--bg-tertiary)', border: 'none' }}
            />
            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', justifyContent: 'center' }}>
              <Unlock size={18} /> Entrar
            </button>
          </form>

          <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Score · Lácteos La Toba
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 40, x: '-50%' }}
            style={{
              position: 'fixed', bottom: '6.5rem', left: '50%', zIndex: 4000, padding: '0.8rem 1.1rem', borderRadius: '12px',
              display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#0f172a', color: 'white',
              boxShadow: 'var(--shadow-lg)', width: 'max-content', maxWidth: '90vw', pointerEvents: 'none'
            }}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} color="#34d399" /> : <AlertCircle size={18} color="#f87171" />}
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 2000 }}
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: '290px', zIndex: 2500, background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ padding: '1.5rem 1.25rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>S</div>
                <div>
                  <div style={{ fontWeight: 700 }}>Score</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{contacts.length.toLocaleString('es-MX')} contactos</div>
                </div>
              </div>

              <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <button onClick={handleSyncClick} disabled={isSyncing} className="menu-item primary">
                  <RefreshCw size={20} className={isSyncing ? 'spin' : ''} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>{isSyncing ? 'Sincronizando…' : (isGoogleConnected() ? 'Sincronizar con Google' : 'Conectar con Google')}</span>
                    {lastSync && <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>Última: {timeAgo(lastSync, now)}</span>}
                  </span>
                </button>

                <div style={{ height: 1, background: 'var(--line-soft)', margin: '0.5rem 0' }} />

                <input type="file" accept=".vcf" id="vcf-import-side" className="hidden-input" onChange={handleImportVCF} ref={fileInputRef} />
                <label htmlFor="vcf-import-side" className="menu-item">
                  <FileUp size={20} /><span>Importar archivo</span>
                </label>
                <button onClick={exportToVCF} className="menu-item">
                  <FileDown size={20} /><span>Exportar archivo</span>
                </button>
                <button onClick={toggleTheme} className="menu-item">
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                  <span>{isDarkMode ? 'Modo claro' : 'Modo oscuro'}</span>
                </button>
                <button onClick={() => { setIsMenuOpen(false); setIsSelectionMode(true); }} className="menu-item">
                  <CheckSquare size={20} /><span>Seleccionar varios</span>
                </button>

                <div style={{ height: 1, background: 'var(--line-soft)', margin: '0.5rem 0' }} />

                <button onClick={handleLogout} className="menu-item danger">
                  <Lock size={20} /><span>Bloquear app</span>
                </button>
              </div>

              <div style={{ marginTop: 'auto', padding: '1.25rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Score v2.0 · Lácteos La Toba
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="topbar">
        <div className="topbar-row">
          <button onClick={() => setIsMenuOpen(true)} className="icon-btn" aria-label="Menú">
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            <h1>Contactos</h1>
            <span className="count">{contacts.length.toLocaleString('es-MX')}</span>
          </div>
          {hasUnsavedChanges ? (
            <button onClick={() => saveToLocalStorage(contacts)} className="sync-pill save">
              <Save size={15} /><span>Guardar</span>
            </button>
          ) : (
            <button onClick={handleSyncClick} disabled={isSyncing} className="sync-pill" title="Sincronizar con Google">
              <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
              {lastSync && !isSyncing && <span className="dot" />}
              <span>{syncLabel}</span>
            </button>
          )}
        </div>

        <div className="search">
          <Search size={18} />
          <input type="search" placeholder="Buscar por nombre o teléfono" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          {searchTerm && (
            <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSearchTerm('')} aria-label="Borrar búsqueda"><X size={16} /></button>
          )}
        </div>

        <div className="chips">
          {isSelectionMode ? (
            <>
              <button className="chip" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>
                <X size={15} /> Cancelar
              </button>
              <button className="chip" onClick={toggleSelectAll}>
                {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                {allSelected ? 'Ninguno' : 'Todos'}
              </button>
              {selectedIds.size > 0 && (
                <button className="chip danger" onClick={deleteSelected}>
                  <Trash2 size={15} /> Eliminar ({selectedIds.size})
                </button>
              )}
            </>
          ) : (
            <>
              <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                Todos <span className="n">{formatCount(contacts.length)}</span>
              </button>
              {unnamedCount > 0 && (
                <button className={`chip ${filter === 'unnamed' ? 'active' : ''}`} onClick={() => setFilter('unnamed')}>
                  Sin nombre <span className="n">{unnamedCount}</span>
                </button>
              )}
              <button className="chip" onClick={() => setIsSelectionMode(true)}>
                <CheckSquare size={15} /> Seleccionar
              </button>
            </>
          )}
        </div>
      </header>

      <div className="list">
        {groups.map(group => (
          <section key={group.letter}>
            <div className="letter" id={`letter-${group.letter}`}><span>{group.letter}</span></div>
            {group.items.map(contact => {
              const isSelected = selectedIds.has(contact.id);
              const tint = tintFor(contact.name);
              return (
                <div key={contact.id} className={`row ${isSelected ? 'selected' : ''}`} onClick={() => handleOpenDetail(contact)}>
                  {isSelectionMode && (
                    <span className={`check ${isSelected ? 'on' : ''}`}>{isSelected ? <CheckSquare size={20} /> : <Square size={20} />}</span>
                  )}
                  <span className="initials" style={{ background: tint.bg, color: tint.fg }}>{initialsOf(contact.name)}</span>
                  <div className="row-body">
                    <div className="row-name">{contact.name}</div>
                    <div className="row-sub">{isUnnamed(contact.name) ? 'Sin nombre' : <><Phone size={13} />{contact.phone || 'Sin número'}</>}</div>
                  </div>
                  {!isSelectionMode && contact.phone && (
                    <a className="call-btn" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()} aria-label={`Llamar a ${contact.name}`}>
                      <Phone size={18} />
                    </a>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {visibleContacts.length === 0 && (
          <div className="empty">
            <UserPlus size={44} style={{ marginBottom: '0.75rem', opacity: 0.35 }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {searchTerm ? 'Sin resultados' : 'No hay contactos'}
            </h3>
            <p style={{ fontSize: '0.9rem', marginTop: '0.35rem' }}>
              {searchTerm ? 'Prueba con otro nombre o número.' : 'Toca el menú y conecta con Google para traer los de tu celular.'}
            </p>
          </div>
        )}
      </div>

      {!searchTerm && groups.length > 1 && (
        <nav className="az" aria-label="Índice alfabético">
          {AZ.map(l => (
            <button key={l} disabled={!availableLetters.has(l)} onClick={() => jumpTo(l)}>{l}</button>
          ))}
        </nav>
      )}

      {!isSelectionMode && (
        <button onClick={() => handleOpenModal()} className="fab" aria-label="Nuevo contacto">
          <Plus size={28} />
        </button>
      )}

      {/* Detail Sheet */}
      <AnimatePresence>
        {isDetailOpen && viewingContact && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsDetailOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="glass" style={{ width: '100%', maxWidth: '560px', borderRadius: '20px 20px 0 0', position: 'relative', maxHeight: '92vh', overflowY: 'auto' }}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--line)', margin: '10px auto 0' }} />
              <div style={{ padding: '1.5rem 1.25rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
                <span className="initials lg" style={{ background: tintFor(viewingContact.name).bg, color: tintFor(viewingContact.name).fg }}>{initialsOf(viewingContact.name)}</span>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{viewingContact.name}</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    {viewingContact.googleId ? 'Sincronizado con Google' : (viewingContact.tag || 'Contacto')}
                  </p>
                </div>
              </div>

              <div style={{ padding: '0 1.25rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {viewingContact.phone && (
                  <div className="quick-actions">
                    <a href={`tel:${viewingContact.phone.replace(/[^\d+]/g, '')}`}><Phone size={20} />Llamar</a>
                    <a href={`https://wa.me/${viewingContact.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={20} />WhatsApp</a>
                    <a href={`sms:${viewingContact.phone.replace(/[^\d+]/g, '')}`}><MessageSquare size={20} />Mensaje</a>
                  </div>
                )}

                <div className="info-row">
                  <span className="ico"><Phone size={18} /></span>
                  <div><div className="lbl">Teléfono</div><div className="val">{viewingContact.phone || 'Sin número'}</div></div>
                </div>

                {viewingContact.email && (
                  <div className="info-row">
                    <span className="ico"><Mail size={18} /></span>
                    <div><div className="lbl">Email</div><div className="val">{viewingContact.email}</div></div>
                  </div>
                )}

                {viewingContact.address && (
                  <div className="info-row">
                    <span className="ico"><MapPin size={18} /></span>
                    <div><div className="lbl">Dirección</div><div className="val">{viewingContact.address}</div></div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button onClick={() => handleOpenModal(viewingContact)} className="btn" style={{ height: 48, justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
                    <Edit3 size={18} /><span>Editar</span>
                  </button>
                  <button onClick={() => deleteContact(viewingContact.id)} className="btn" style={{ height: 48, justifyContent: 'center', background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    <Trash2 size={18} /><span>Eliminar</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Sheet */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3500 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="glass" style={{ width: '100%', maxWidth: '560px', borderRadius: '20px 20px 0 0', position: 'relative', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{editingContact ? 'Editar contacto' : 'Nuevo contacto'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="icon-btn" aria-label="Cerrar"><X size={20} /></button>
              </div>
              <div style={{ overflowY: 'auto', padding: '1.25rem 1.25rem 2rem' }}>
                <form onSubmit={handleSubmit}>
                  <div className="input-group"><label className="input-label">Nombre</label><input className="input-field" type="text" required autoFocus value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                  <div className="input-group"><label className="input-label">Teléfono</label><input className="input-field" type="tel" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                  <div className="input-group"><label className="input-label">Email (opcional)</label><input className="input-field" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
                  <div className="input-group"><label className="input-label">Dirección (opcional)</label><input className="input-field" type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 50, justifyContent: 'center', fontSize: '1rem', marginTop: '0.5rem' }}>{editingContact ? 'Guardar cambios' : 'Crear contacto'}</button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
