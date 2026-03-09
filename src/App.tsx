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
  MoreVertical,
  Menu,
  Settings,
  Lock,
  Unlock,
  CornerDownLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tag: string;
  avatarSeed: string;
}

const STORAGE_KEY = 'premium_contacts_v1';
const CORRECT_PIN = '5151';

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
    return [
      {
        id: '1',
        name: 'Sofia Rodriguez',
        phone: '+34 654 321 098',
        email: 'sofia.rod@example.com',
        address: 'Madrid, España',
        tag: 'Trabajo',
        avatarSeed: 'Sofia'
      }
    ];
  });
  const [searchTerm, setSearchTerm] = useState('');
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
    }
  }, []);

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinEntry === CORRECT_PIN) {
      setIsAuthorized(true);
      sessionStorage.setItem('app_authorized', 'true');
      setPinEntry('');
      setPinError(false);
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
        c.id === editingContact.id ? { ...c, ...formData } : c
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
    // Sort A-Z by name
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [contacts, searchTerm]);

  const allSelected = filteredContacts.length > 0 && selectedIds.size === filteredContacts.length;

  if (!isAuthorized) {
    return (
      <div className="app-container" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, x: pinError ? [0, -10, 10, -10, 10, 0] : 0 }}
          className="glass"
          style={{ width: '90%', maxWidth: '400px', padding: '3rem 2rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', border: pinError ? '2px solid var(--danger)' : '1px solid var(--glass-border)' }}
        >
          <div style={{ background: 'var(--primary)', color: 'white', width: '80px', height: '80px', borderRadius: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', boxShadow: '0 8px 30px rgba(99, 102, 241, 0.4)' }}>
            <Lock size={40} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Score</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Introduce tu PIN para entrar</p>

          <form onSubmit={handlePinSubmit}>
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="PIN"
                autoFocus
                value={pinEntry}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPinEntry(val);
                  if (val.length === 4) {
                    if (val === CORRECT_PIN) {
                      setIsAuthorized(true);
                      sessionStorage.setItem('app_authorized', 'true');
                    } else {
                      setPinError(true);
                      setTimeout(() => {
                        setPinEntry('');
                        setPinError(false);
                      }, 400);
                    }
                  }
                }}
                style={{
                  width: '100%', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '2rem', textAlign: 'center', letterSpacing: '1rem', outline: 'none'
                }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.25rem', gap: '0.75rem', fontSize: '1.1rem' }}>
              <Unlock size={20} /> Entrar
            </button>
          </form>

          <div style={{ marginTop: '3rem', fontSize: '0.8rem', opacity: 0.5 }}>
            Score v1.5 Premium | Acceso Seguro
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
            initial={{ opacity: 0, y: 100, x: '-50%' }} animate={{ opacity: 1, y: -40, x: '-50%' }} exit={{ opacity: 0, y: 100, x: '-50%' }}
            style={{
              position: 'fixed', bottom: 0, left: '50%', zIndex: 4000, padding: '1rem 1.5rem', borderRadius: 'var(--radius-lg)',
              display: 'flex', alignItems: 'center', gap: '0.75rem', background: toast.type === 'success' ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)',
              backdropFilter: 'blur(10px)', color: 'white', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: 'max-content', maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.2)', pointerEvents: 'none'
            }}
          >
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{toast.message}</span>
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
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }}
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="glass"
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: '280px', zIndex: 2500,
                borderRadius: '0 var(--radius-lg) var(--radius-lg) 0', display: 'flex', flexDirection: 'column',
                borderRight: '1px solid var(--glass-border)'
              }}
            >
              <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Opciones</h2>
              </div>

              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input type="file" accept=".vcf" id="vcf-import-side" className="hidden-input" onChange={handleImportVCF} ref={fileInputRef} />
                <label htmlFor="vcf-import-side" className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem' }}>
                  <FileUp size={20} /><span style={{ fontSize: '1rem' }}>Importar archivo</span>
                </label>

                <button onClick={exportToVCF} className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem' }}>
                  <FileDown size={20} /><span style={{ fontSize: '1rem' }}>Exportar archivo</span>
                </button>

                <button onClick={toggleTheme} className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem' }}>
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                  <span style={{ fontSize: '1rem' }}>{isDarkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
                </button>

                <button onClick={handleLogout} className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem', color: 'var(--danger)' }}>
                  <Lock size={20} /><span style={{ fontSize: '1rem' }}>Bloquear App</span>
                </button>

                <button onClick={() => { setIsMenuOpen(false); setToast({ message: 'v1.5.0 Premium', type: 'success' }) }} className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem' }}>
                  <Settings size={20} /><span style={{ fontSize: '1rem' }}>Ajustes</span>
                </button>
              </div>

              <div style={{ marginTop: 'auto', padding: '1.5rem', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.6 }}>Score v1.5 Premium</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => setIsMenuOpen(true)} className="btn btn-ghost" style={{ padding: '0.5rem' }}>
            <Menu size={24} />
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Score ({contacts.length})</h1>
        </div>

        {hasUnsavedChanges && (
          <button onClick={() => saveToLocalStorage(contacts)} className="btn btn-primary" style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', gap: '0.4rem', borderRadius: 'var(--radius-md)' }}>
            <Save size={16} /><span>Guardar</span>
          </button>
        )}
      </header>

      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <Search size={18} style={{ color: 'var(--text-secondary)' }} />
        <input type="text" placeholder="Buscar..." style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none', color: 'var(--text-primary)', fontSize: '1rem' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      <div className="secondary-actions" style={{ marginBottom: isSelectionMode ? '1rem' : '1.5rem' }}>
        {!isSelectionMode ? (
          <button onClick={() => setIsSelectionMode(true)} className="btn glass" style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', fontSize: '0.9rem', padding: '0.8rem' }}>
            <CheckSquare size={18} /><span>Seleccionar Varios</span>
          </button>
        ) : (
          <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="btn glass" style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', fontSize: '0.9rem', padding: '0.8rem' }}>
            <X size={18} /><span>Cancelar Selección</span>
          </button>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {isSelectionMode && filteredContacts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
          <button onClick={toggleSelectAll} className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '0.5rem', gap: '0.5rem' }}>
            {allSelected ? <CheckSquare size={18} style={{ color: 'var(--primary)' }} /> : <Square size={18} />}
            <span>{allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}</span>
          </button>

          {selectedIds.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              onClick={deleteSelected}
              className="btn"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.5rem 1rem' }}
            >
              <Trash2 size={16} />
              <span>Eliminar ({selectedIds.size})</span>
            </motion.button>
          )}
        </motion.div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <AnimatePresence initial={false}>
          {filteredContacts.slice(0, 100).map(contact => {
            const isSelected = selectedIds.has(contact.id);
            return (
              <motion.div
                key={contact.id}
                layout
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`card glass ${isSelected ? 'selected-card' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem',
                  border: isSelected ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                  background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'var(--glass-bg)',
                  cursor: 'pointer'
                }}
                onClick={() => handleOpenDetail(contact)}
              >
                {isSelectionMode && (
                  <div style={{ color: isSelected ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>
                )}
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(contact.avatarSeed)}`} alt={contact.name} className="avatar" style={{ width: '44px', height: '44px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{contact.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <Phone size={14} />{contact.phone || 'Sin número'}
                  </div>
                </div>
                {!isSelectionMode && <MoreVertical size={18} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />}
              </motion.div>
            );
          })}
          {filteredContacts.length > 100 && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Mostrando 100 de {filteredContacts.length} contactos. Usa la búsqueda para encontrar otros.
            </div>
          )}
          {filteredContacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-secondary)' }}>
              <UserPlus size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <h3>No hay contactos</h3>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* FAB */}
      {!isSelectionMode && (
        <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ position: 'fixed', bottom: '2.5rem', right: '1.5rem', width: '64px', height: '64px', borderRadius: '32px', padding: 0, justifyContent: 'center', boxShadow: '0 12px 24px rgba(99, 102, 241, 0.4)', zIndex: 90 }}>
          <Plus size={32} />
        </button>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailOpen && viewingContact && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsDetailOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="glass" style={{ width: '100%', maxWidth: '550px', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '2rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(viewingContact.avatarSeed)}`} alt={viewingContact.name} style={{ width: '100px', height: '100px', borderRadius: '50%', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }} />
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{viewingContact.name}</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>{viewingContact.tag || 'Contacto'}</p>
                </div>
              </div>

              <div style={{ padding: '0 1.5rem 2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem', borderRadius: '50%' }}><Phone size={20} /></div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Teléfono</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{viewingContact.phone}</p>
                  </div>
                </div>

                {viewingContact.email && (
                  <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem', borderRadius: '50%' }}><CornerDownLeft size={20} /></div>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Email</p>
                      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{viewingContact.email}</p>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <button onClick={() => handleOpenModal(viewingContact)} className="btn glass" style={{ padding: '1.25rem', justifyContent: 'center', background: 'var(--bg-secondary)', fontWeight: 600 }}>
                    <Edit3 size={20} /><span>Editar</span>
                  </button>
                  <button onClick={() => deleteContact(viewingContact.id)} className="btn" style={{ padding: '1.25rem', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 600 }}>
                    <Trash2 size={20} /><span>Eliminar</span>
                  </button>
                </div>

                <button onClick={() => setIsDetailOpen(false)} className="btn btn-ghost" style={{ width: '100%', padding: '1rem', justifyContent: 'center' }}>
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3500 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="glass" style={{ width: '100%', maxWidth: '550px', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', position: 'relative', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.4rem' }}>{editingContact ? 'Editar Contacto' : 'Nuevo Contacto'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="btn btn-ghost" style={{ padding: '0.5rem' }}><X size={24} /></button>
              </div>
              <div style={{ overflowY: 'auto', padding: '1.5rem 1.5rem 3rem 1.5rem' }}>
                <form onSubmit={handleSubmit}>
                  <div className="input-group"><label className="input-label">Nombre</label><input className="input-field" type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                  <div className="input-group"><label className="input-label">Teléfono</label><input className="input-field" type="tel" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem' }}>{editingContact ? 'Guardar' : 'Crear'}</button>
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
