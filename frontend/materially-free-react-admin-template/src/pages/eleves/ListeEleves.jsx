import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { eleveService, inscriptionService, classeService, getResults, parametresService } from 'services/api';
import {
  Box, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert, IconButton, Tooltip, Divider, Pagination,
  LinearProgress, List, ListItem, ListItemText, Avatar, Menu, ListItemIcon
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import GroupsIcon from '@mui/icons-material/Groups';
import useIsMobile from 'hooks/useIsMobile';
import { readThrough, cacheGet, cacheSet, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';
import { useIsOnline } from 'offline/RequireOnline';
import { genererMotDePasseTemporaire } from 'offline/tempPassword';

import { estEnLigne } from 'offline/reseau';
import { peutSaisir } from 'utils/droits';
import authService from 'services/auth';
import { couleursImpression } from 'utils/couleurs';
/** Photo de l'élève ; une image factice (1 pixel) ou absente donne les initiales. */
function PhotoEleve({ eleve, taille = 40 }) {
  const [ok, setOk] = useState(Boolean(eleve.photo_url));
  const initiales = `${eleve.prenom?.[0] || ''}${eleve.nom?.[0] || ''}`.toUpperCase();
  return (
    <Avatar
      src={ok ? eleve.photo_url : undefined}
      imgProps={{ onLoad: (ev) => { if (ev.target.naturalWidth < 40) setOk(false); }, onError: () => setOk(false) }}
      sx={{
        width: taille, height: taille, fontWeight: 700, fontSize: taille / 2.8, flexShrink: 0,
        bgcolor: eleve.sexe === 'F' ? '#fce7f0' : 'primary.lighter', color: eleve.sexe === 'F' ? '#be185d' : 'primary.dark',
      }}
    >
      {initiales || <PersonIcon fontSize="small" />}
    </Avatar>
  );
}

// un élève ajouté hors ligne reçoit son matricule du serveur à la synchronisation
const matriculeAffiche = (e) => e.matricule || (e._pending ? 'Matricule après synchronisation' : '');

const initForm = {
  matricule: '', nom: '', prenom: '',
  date_naissance: '', lieu_naissance: '', sexe: '',
  nom_parent: '', prenom_parent: '', telephone_parent: '',
  classeId: '',
};

export default function ListeEleves() {
  const saisie = peutSaisir('secretariat'); // le directeur consulte, le secrétaire saisit
  const peutImporter = saisie || authService.getRole() === 'ADMIN'; // import Excel et ajout d'un élève : directeur et secrétaire
  const estDirecteur = authService.getRole() === 'ADMIN'; // le directeur peut seulement corriger un nom
  const [nomOpen, setNomOpen] = useState(false);
  const [nomForm, setNomForm] = useState({ nom: '', prenom: '' });
  const [nomError, setNomError] = useState('');
  const [nomSaving, setNomSaving] = useState(false);

  const ouvrirCorrectionNom = (eleve) => {
    setSelected(eleve);
    setNomForm({ nom: eleve.nom || '', prenom: eleve.prenom || '' });
    setNomError('');
    setNomOpen(true);
  };

  const handleCorrigerNom = async () => {
    setNomSaving(true);
    setNomError('');
    try {
      const res = await eleveService.corrigerNom(selected.id, { nom: nomForm.nom, prenom: nomForm.prenom });
      setEleves((prev) => prev.map((e) => (e.id === selected.id ? { ...e, nom: res.data.nom, prenom: res.data.prenom } : e)));
      setNomOpen(false);
    } catch (err) {
      const d = err.response?.data;
      setNomError(d?.detail || d?.nom?.[0] || d?.prenom?.[0] || 'Impossible de corriger le nom. Vérifiez la connexion et réessayez.');
    } finally {
      setNomSaving(false);
    }
  };
  const navigate = useNavigate();
  const [eleves, setEleves] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterActif, setFilterActif] = useState('all');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [editInscriptionId, setEditInscriptionId] = useState(null);

  // Import Excel
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importClasseId, setImportClasseId] = useState('');
  const fileInputRef = useRef();

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [credDialog, setCredDialog] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [creatingComptes, setCreatingComptes] = useState(false);
  const [ecole, setEcole] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const isMobile = useIsMobile();
  const compact = useMediaQuery(useTheme().breakpoints.down('md')); // tablette / téléphone : cartes au lieu du tableau
  const online = useIsOnline();
  const [menuEleve, setMenuEleve] = useState(null); // { ancre, eleve }

  const fetchData = (p = page) => {
    setLoading(true);
    let url = filterClasse ? `/eleves/?classe_id=${filterClasse}` : '/eleves/';
    url += (url.includes('?') ? '&' : '?') + `page=${p}&page_size=${PAGE_SIZE}&inclure_suspendus=1`;
    const cacheKey = CacheKeys.elevesList(`${filterClasse || 'all'}:p${p}`);
    Promise.all([
      readThrough(cacheKey, async () => {
        const res = await eleveService.getAll(url);
        return getResults(res);
      }),
      readThrough(CacheKeys.classes(), async () => {
        const res = await classeService.getAll();
        return Array.isArray(res.data) ? res.data : res.data.results ?? [];
      }),
    ])
      .then(([resE, resC]) => {
        if (resE.neverCached) {
          setError(NEVER_CACHED_MSG);
          setEleves([]);
          setTotalCount(0);
        } else {
          setEleves(resE.data?.items || []);
          setTotalCount(resE.data?.count || 0);
          setClasses(resC.data || []);
        }
      })
      .catch(() => setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  };

  useEffect(() => { parametresService.get().then(r => setEcole(r.data)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); fetchData(1); }, [filterClasse]);
  useEffect(() => { fetchData(page); }, [page]);

  const filtered = eleves.filter(e => {
    const matchSearch = `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && e.is_active)
      || (filterActif === 'suspended' && !e.is_active);
    return matchSearch && matchActif;
  });

  const getErrorMessage = (err) => {
    const data = err.response?.data;
    if (!data) return 'Erreur inconnue';
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    return Object.entries(data)
      .map(([f, errs]) => `${f}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
      .join(' | ');
  };

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openCreate = () => {
    setForm(initForm);
    setError('');
    setOpen(true);
    // matricule proposé par le serveur (initiales de l'école + numéro) ; modifiable avant l'enregistrement
    if (online) {
      eleveService.prochainMatricule()
        .then((r) => setForm((prev) => (prev.matricule ? prev : { ...prev, matricule: r.data.matricule })))
        .catch(() => {});
    }
  };

  const openEdit = async (eleve) => {
    setSelected(eleve);
    setForm({
      matricule: eleve.matricule,
      nom: eleve.nom,
      prenom: eleve.prenom,
      date_naissance: eleve.date_naissance || '',
      lieu_naissance: eleve.lieu_naissance || '',
      sexe: eleve.sexe || '',
      nom_parent: eleve.nom_parent || '',
      prenom_parent: eleve.prenom_parent || '',
      telephone_parent: eleve.telephone_parent || '',
      classeId: '',
    });
    setEditInscriptionId(null);
    setError('');

    try {
      // Inscription de l'année active uniquement (le serveur filtre sur l'année en cours)
      const res = await inscriptionService.getAll(`?eleve_id=${eleve.id}`);
      const { items } = getResults(res);
      if (items.length > 0) {
        const ins = items[0];
        setEditInscriptionId(ins.id);
        setForm(prev => ({ ...prev, classeId: ins.classe || '' }));
      }
    } catch { /* pas d'inscription */ }

    setEditOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        matricule: form.matricule, nom: form.nom, prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        lieu_naissance: form.lieu_naissance,
        sexe: form.sexe,
        nom_parent: form.nom_parent,
        prenom_parent: form.prenom_parent,
        telephone_parent: form.telephone_parent,
      };

      // Hors ligne : file d'attente + mot de passe temporaire généré ici.
      // Le matricule est laissé vide : le serveur l'attribue à la synchronisation, sans risque de doublon entre appareils.
      if (!online) {
        payload.matricule = '';
        const password = (ecole.mot_de_passe_defaut_eleves || '').trim() || genererMotDePasseTemporaire();
        const result = await sendOrQueue({
          kind: 'eleve_create',
          label: `Créer élève ${form.prenom} ${form.nom}`,
          payload: {
            eleve: payload,
            classe_id: form.classeId || null,
            password,
          },
        });

        const classeInfo = classes.find((c) => String(c.id) === String(form.classeId));
        const localEleve = {
          id: `local-${result.client_id}`,
          ...payload,
          is_active: true,
          _pending: true,
          client_id: result.client_id,
          classe_actuelle: classeInfo?.nom_complet || classeInfo?.nom || '',
        };
        const shouldShow = !filterClasse || String(form.classeId) === String(filterClasse);
        if (shouldShow) {
          setEleves((prev) => [localEleve, ...prev]);
          setTotalCount((c) => c + 1);
        }
        try {
          const cacheKey = CacheKeys.elevesList(`${filterClasse || 'all'}:p${page}`);
          const cached = await cacheGet(cacheKey);
          if (cached && shouldShow) {
            await cacheSet(cacheKey, {
              ...cached,
              items: [localEleve, ...(cached.items || [])],
              count: (cached.count || 0) + 1,
            });
          }
        } catch { /* ignore */ }

        setCreatedCreds({
          nom: `${form.prenom} ${form.nom}`,
          username: '',
          password,
          offline: true,
        });
        setOpen(false);
        setCredDialog(true);
        return;
      }

      const eleveRes = await eleveService.create(payload);
      const eleveId = eleveRes.data.id;

      if (form.classeId) {
        await inscriptionService.create({ eleve: eleveId, classe: form.classeId });
      }

      // Le compte élève est créé par le serveur avec la fiche
      const compte = eleveRes.data.compte || {};

      // Compte du parent (identifiant = téléphone) : créé ou relié automatiquement
      let parent = null;
      try { parent = (await eleveService.compteParent(eleveId)).data; } catch { /* on n'empêche pas la création */ }

      setCreatedCreds({
        nom: `${form.prenom} ${form.nom}`,
        username: compte.username || form.matricule,
        password: compte.mot_de_passe_temporaire || '',
        parent,
      });
      setOpen(false);
      fetchData();
      setCredDialog(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        matricule: form.matricule, nom: form.nom, prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        lieu_naissance: form.lieu_naissance,
        sexe: form.sexe,
        nom_parent: form.nom_parent,
        prenom_parent: form.prenom_parent,
        telephone_parent: form.telephone_parent,
      };
      const result = await sendOrQueue({
        kind: 'http',
        label: `Modifier élève ${form.prenom} ${form.nom}`,
        payload: { method: 'PUT', url: `/eleves/${selected.id}/`, data: payload },
      });
      if (form.classeId && !result.queued) {
        if (editInscriptionId) {
          await inscriptionService.update(editInscriptionId, { eleve: selected.id, classe: form.classeId });
        } else {
          await inscriptionService.create({ eleve: selected.id, classe: form.classeId });
        }
      } else if (form.classeId && result.queued) {
        await sendOrQueue({
          kind: 'http',
          label: 'Inscription / changement classe',
          payload: editInscriptionId
            ? { method: 'PUT', url: `/inscriptions/${editInscriptionId}/`, data: { eleve: selected.id, classe: form.classeId } }
            : { method: 'POST', url: '/inscriptions/', data: { eleve: selected.id, classe: form.classeId } },
        });
      }

      setSuccess(result.queued ? QUEUED_MSG : 'Élève modifié !');
      setEditOpen(false);
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async () => {
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: selected.is_active ? 'Suspendre élève' : 'Réactiver élève',
        payload: {
          method: 'PATCH',
          url: `/eleves/${selected.id}/`,
          data: { is_active: !selected.is_active },
        },
      });
      setSuccess(result.queued ? QUEUED_MSG : (selected.is_active ? 'Élève suspendu.' : 'Élève réactivé !'));
      setSuspendOpen(false);
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  // ── Impression liste classe ────────────────
  const handlePrintListe = async () => {
    const classeInfo = classes.find(c => String(c.id) === String(filterClasse));
    const className = classeInfo?.nom_complet || classeInfo?.nom || 'Classe';
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Charger TOUS les élèves de la classe (sans pagination)
    let allEleves = filtered;
    if (filterClasse && totalCount > eleves.length) {
      try {
        const res = await eleveService.getAll(`/eleves/?classe_id=${filterClasse}&page_size=500`);
        const { items } = getResults(res);
        allEleves = items;
      } catch { /* utiliser filtered */ }
    }

    const lignes = allEleves
      .filter(e => {
        const matchActif = filterActif === 'all' || (filterActif === 'active' && e.is_active) || (filterActif === 'suspended' && !e.is_active);
        return matchActif;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .map((e, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${e.matricule}</td>
          <td style="text-align:left">${e.nom} ${e.prenom}</td>
          <td>${e.date_naissance ? new Date(e.date_naissance).toLocaleDateString('fr-FR') : '—'}</td>
          <td>${e.lieu_naissance || '—'}</td>
          <td>${e.sexe === 'M' ? 'M' : e.sexe === 'F' ? 'F' : '—'}</td>
          <td></td>
        </tr>
      `).join('');

    const teinte = couleursImpression(); // aux couleurs de l'école
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Liste ${className}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 15mm 12mm; color: #000; }
    .header { text-align: center; margin-bottom: 16px; }
    .header .ecole-nom { font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .header .ecole-sub { font-size: 11px; color: #444; margin-top: 2px; }
    .titre { text-align: center; margin: 14px 0 4px; }
    .titre h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 3px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10px; color: #444; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: ${teinte.fonce}; color: white; }
    thead th { padding: 6px 5px; text-align: center; font-size: 10px; border: 1px solid ${teinte.fonce}; }
    tbody tr:nth-child(even) { background: ${teinte.clair}; }
    tbody tr td { padding: 5px 5px; border: 1px solid #ddd; text-align: center; font-size: 10px; }
    tbody tr td:nth-child(3) { text-align: left; font-weight: bold; }
    .signature-col { width: 90px; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; }
    .footer-sign { text-align: center; }
    .footer-sign .label { font-weight: bold; margin-bottom: 40px; }
    @media print {
      body { padding: 10mm 8mm; }
      thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${ecole.logo ? `<img src="${ecole.logo}" style="height:60px;margin-bottom:6px"><br>` : ''}
    <div class="ecole-nom">${ecole.nom_ecole || 'ÉTABLISSEMENT SCOLAIRE'}</div>
    ${ecole.slogan ? `<div class="ecole-sub">${ecole.slogan}</div>` : ''}
    ${ecole.adresse || ecole.ville ? `<div class="ecole-sub">${[ecole.adresse, ecole.ville].filter(Boolean).join(' — ')}</div>` : ''}
  </div>
  <hr style="border:1px solid ${teinte.fonce};margin-bottom:12px">

  <div class="titre"><h2>Liste des élèves — ${className}</h2></div>

  <div class="meta">
    <span>Nombre d'élèves : <strong>${allEleves.length}</strong></span>
    <span>Date d'impression : <strong>${today}</strong></span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">N°</th>
        <th style="width:80px">Matricule</th>
        <th>Nom & Prénom</th>
        <th style="width:75px">Date naiss.</th>
        <th style="width:80px">Lieu naiss.</th>
        <th style="width:35px">Sexe</th>
        <th class="signature-col">Signature</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
  </table>

  <div class="footer">
    <div class="footer-sign">
      <div class="label">Le Directeur</div>
      <div>___________________</div>
    </div>
    <div class="footer-sign">
      <div class="label">Le Professeur Principal</div>
      <div>___________________</div>
    </div>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  // ── Créer comptes manquants ────────────────
  const handleCreerComptes = async () => {
    setCreatingComptes(true);
    try {
      const res = await eleveService.creerComptesManquants();
      const { created, comptes } = res.data;
      if (created > 0) {
        const first = (comptes && comptes[0]) || null;
        if (first) {
          setCreatedCreds({
            nom: first.nom || `${created} compte(s)`,
            username: first.username,
            password: first.mot_de_passe_temporaire,
            extra: comptes.slice(1),
          });
          setCredDialog(true);
        }
        setSuccess(`${created} compte(s) créé(s). Notez les mots de passe temporaires (affichés une seule fois).`);
        fetchData();
      } else {
        setSuccess('Tous les élèves ont déjà un compte.');
      }
      setTimeout(() => setSuccess(''), 6000);
    } catch {
      setError('Erreur lors de la création des comptes.');
    } finally {
      setCreatingComptes(false);
    }
  };

  // ── Import Excel ───────────────────────────
  const handleDownloadTemplate = async () => {
    if (!estEnLigne()) {
      setError('Connexion requise pour télécharger le modèle.');
      return;
    }
    try {
      const res = await eleveService.templateExcel();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'modele_import_eleves.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors du téléchargement du modèle.');
    }
  };

  const handleImport = async (file) => {
    if (!file) return;
    if (!estEnLigne()) {
      setImportResult({ error: 'Connexion requise pour importer un fichier.' });
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await eleveService.importExcel(file, importClasseId || null);
      setImportResult(res.data);
      fetchData();
    } catch (err) {
      setImportResult({ error: getErrorMessage(err) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Champs communs du formulaire
  const formFields = (
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      <Grid size={12}>
        {!editOpen && !online ? (
          <TextField fullWidth label="Matricule" value="" disabled
            helperText="Hors ligne : il sera attribué automatiquement au retour du réseau." />
        ) : (
          <TextField fullWidth label="Matricule *" name="matricule"
            value={form.matricule} onChange={handleChange}
            placeholder="ex: CSCG12"
            helperText={!editOpen ? 'Attribué automatiquement : vous pouvez le modifier.' : undefined} />
        )}
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Nom *" name="nom"
          value={form.nom} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Prénom *" name="prenom"
          value={form.prenom} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth label="Date de naissance" name="date_naissance"
          type="date" value={form.date_naissance} onChange={handleChange}
          InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth label="Lieu de naissance" name="lieu_naissance"
          value={form.lieu_naissance} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth select label="Sexe" name="sexe"
          value={form.sexe} onChange={handleChange}>
          <MenuItem value=""><em>Non précisé</em></MenuItem>
          <MenuItem value="M">Masculin</MenuItem>
          <MenuItem value="F">Féminin</MenuItem>
        </TextField>
      </Grid>

      <Grid size={12}>
        <Divider><Typography variant="caption" color="text.secondary">Informations Parent</Typography></Divider>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Nom du parent" name="nom_parent"
          value={form.nom_parent} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Prénom du parent" name="prenom_parent"
          value={form.prenom_parent} onChange={handleChange} />
      </Grid>
      <Grid size={12}>
        <TextField fullWidth label="Téléphone du parent" name="telephone_parent"
          value={form.telephone_parent} onChange={handleChange}
          placeholder="ex: +221 77 123 45 67" />
      </Grid>

      <Grid size={12}>
        <Divider><Typography variant="caption" color="text.secondary">Inscription</Typography></Divider>
      </Grid>
      <Grid size={12}>
        <TextField fullWidth select label={editOpen ? 'Classe' : 'Classe *'} name="classeId"
          value={form.classeId} onChange={handleChange}
          helperText={editOpen ? '' : "Obligatoire : sans classe, l'élève ne voit ni ses cours ni ses exercices."}>
          {editOpen && <MenuItem value=""><em>Aucune</em></MenuItem>}
          {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
        </TextField>
      </Grid>
    </Grid>
  );

  // chiffres clés : seulement quand toute la liste est chargée (sinon ils seraient faux)
  const tousCharges = eleves.length >= totalCount;
  const nbFilles = eleves.filter((e) => e.sexe === 'F' && e.is_active).length;
  const nbGarcons = eleves.filter((e) => e.sexe === 'M' && e.is_active).length;
  const nbSansClasse = eleves.filter((e) => e.is_active && !e.classe_actuelle).length;
  const nbSansCompte = eleves.filter((e) => !e.username).length;
  const enteteSx = { '& th': { fontWeight: 700, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, bgcolor: 'grey.50', borderColor: 'divider', py: 1.25 } };
  const pastilleCompte = (eleve) => (
    <Box display="inline-flex" alignItems="center" gap={0.75} sx={{ fontSize: 13, fontWeight: 600, color: eleve.username ? 'success.dark' : 'error.main', whiteSpace: 'nowrap' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: eleve.username ? 'success.main' : 'error.main' }} />
      {eleve.username ? 'Compte actif' : 'Pas de compte'}
    </Box>
  );
  const pastilleClasse = (eleve) => (eleve.classe_actuelle
    ? <Chip label={eleve.classe_actuelle} size="small" sx={{ bgcolor: 'primary.lighter', color: 'primary.dark', fontWeight: 700, borderRadius: 1.5 }} />
    : <Chip label="Sans classe" size="small" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 700, borderRadius: 1.5 }} />);

  return (
    <Box>
      {/* ── En-tête ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5} gap={1.5} flexWrap="wrap">
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.35rem', sm: '1.6rem' } }}>Élèves</Typography>
          <Typography variant="body2" color="text.secondary">
            {totalCount} élève{totalCount > 1 ? 's' : ''} inscrit{totalCount > 1 ? 's' : ''} dans l&apos;école
          </Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          {peutImporter && (
            <Button size="small" variant="outlined" color="inherit" startIcon={<UploadFileIcon />} sx={{ borderColor: 'divider', fontWeight: 600 }}
              onClick={() => { setImportResult(null); setImportOpen(true); }}>
              Importer Excel
            </Button>
          )}
          {peutImporter && (
            <Button size="small" variant="outlined" color="inherit" startIcon={<DownloadIcon />} sx={{ borderColor: 'divider', fontWeight: 600 }} onClick={handleDownloadTemplate}>
              Modèle Excel
            </Button>
          )}
          {filterClasse && (
            <Button size="small" variant="outlined" color="inherit" startIcon={<PrintIcon />} sx={{ borderColor: 'divider', fontWeight: 600 }} onClick={handlePrintListe}>
              Imprimer la liste
            </Button>
          )}
          {peutImporter && (
            <Button size="small" variant="contained" disableElevation startIcon={<AddIcon />} onClick={openCreate} sx={{ fontWeight: 700 }}>
              Nouvel élève
            </Button>
          )}
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* ── Chiffres clés ── */}
      {!loading && tousCharges && totalCount > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2.5 }}>
          {[
            ['Élèves actifs', nbFilles + nbGarcons + eleves.filter((e) => e.is_active && !e.sexe).length, 'primary.main', <GroupsIcon key="i" />],
            ['Filles', nbFilles, '#be185d', null],
            ['Garçons', nbGarcons, 'primary.dark', null],
            ['Sans classe', nbSansClasse, nbSansClasse ? '#b45309' : 'text.disabled', null],
          ].map(([l, v, couleur]) => (
            <Box key={l} sx={{ p: 2, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>{l}</Typography>
              <Typography sx={{ fontSize: 26, fontWeight: 800, color: couleur, lineHeight: 1.2 }}>{v}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {saisie && nbSansCompte > 0 && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}
          action={<Button color="inherit" size="small" startIcon={<VpnKeyIcon />} disabled={creatingComptes} onClick={handleCreerComptes} sx={{ fontWeight: 700 }}>Créer les comptes</Button>}>
          {nbSansCompte} élève{nbSansCompte > 1 ? 's n’ont' : ' n’a'} pas encore de compte pour se connecter.
        </Alert>
      )}

      {/* ── Liste ── */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ p: 1.75, display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField placeholder="Rechercher un élève (nom, prénom, matricule)…" value={search} onChange={e => setSearch(e.target.value)} size="small"
            sx={{ flex: '1 1 280px' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <TextField select label="Classe" size="small" value={filterClasse} onChange={e => setFilterClasse(e.target.value)} sx={{ flex: '0 1 200px', minWidth: 160 }}>
            <MenuItem value="">Toutes les classes</MenuItem>
            {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
          </TextField>
          <TextField select label="Statut" size="small" value={filterActif} onChange={e => setFilterActif(e.target.value)} sx={{ flex: '0 1 160px', minWidth: 130 }}>
            <MenuItem value="all">Tous</MenuItem>
            <MenuItem value="active">Actifs</MenuItem>
            <MenuItem value="suspended">Suspendus</MenuItem>
          </TextField>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <PersonIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
            <Typography color="text.secondary" mt={1}>Aucun élève ne correspond à cette recherche.</Typography>
          </Box>
        ) : compact ? (
          <Box>
            {filtered.map((eleve, i) => (
              <Box key={eleve.id} sx={{ p: 1.75, borderTop: i ? '1px solid' : 'none', borderColor: 'divider', opacity: eleve.is_active ? 1 : 0.65 }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <PhotoEleve eleve={eleve} taille={46} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={700} noWrap>{eleve.prenom} {eleve.nom}</Typography>
                    <Typography variant="caption" color="text.secondary">{matriculeAffiche(eleve)}</Typography>
                  </Box>
                  {(saisie || estDirecteur) && <IconButton onClick={(e) => setMenuEleve({ ancre: e.currentTarget, eleve })}><MoreVertIcon /></IconButton>}
                </Box>
                <Box display="flex" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 1.25 }}>
                  {pastilleClasse(eleve)}
                  {!eleve.is_active && <Chip label="Suspendu" size="small" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 700 }} />}
                  {pastilleCompte(eleve)}
                </Box>
                {eleve.telephone_parent && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    <PhoneIcon sx={{ fontSize: 14 }} /> {`${eleve.prenom_parent || ''} ${eleve.nom_parent || ''}`.trim() || 'Parent'} · {eleve.telephone_parent}
                  </Typography>
                )}
                <Button fullWidth size="small" variant="outlined" startIcon={<FolderSharedIcon />} sx={{ mt: 1.25, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                  onClick={() => navigate(`/eleves/${eleve.id}/dossier`)}>
                  Ouvrir le dossier
                </Button>
              </Box>
            ))}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead sx={enteteSx}>
                <TableRow>
                  <TableCell>Élève</TableCell>
                  <TableCell>Classe</TableCell>
                  <TableCell>Parent / tuteur</TableCell>
                  <TableCell>Compte</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((eleve) => (
                  <TableRow key={eleve.id} hover sx={{
                    opacity: eleve.is_active ? 1 : 0.6, bgcolor: eleve.is_active ? 'inherit' : '#fffbeb',
                    '& td': { borderColor: 'divider', py: 1.5 }, '&:last-child td': { border: 0 }, cursor: 'pointer',
                  }} onClick={() => navigate(`/eleves/${eleve.id}/dossier`)}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1.75}>
                        <PhotoEleve eleve={eleve} taille={42} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={700} fontSize={14.5}>{eleve.prenom} {eleve.nom}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[matriculeAffiche(eleve), eleve.sexe === 'M' ? 'Garçon' : eleve.sexe === 'F' ? 'Fille' : '',
                              eleve.date_naissance ? `né${eleve.sexe === 'F' ? 'e' : ''} le ${new Date(eleve.date_naissance).toLocaleDateString('fr-FR')}` : ''].filter(Boolean).join(' · ')}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.75} alignItems="center">
                        {pastilleClasse(eleve)}
                        {!eleve.is_active && <Chip label="Suspendu" size="small" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 700 }} />}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {eleve.nom_parent || eleve.telephone_parent ? (
                        <>
                          <Typography variant="body2" fontWeight={600}>{`${eleve.prenom_parent || ''} ${eleve.nom_parent || ''}`.trim() || '—'}</Typography>
                          {eleve.telephone_parent && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PhoneIcon sx={{ fontSize: 13 }} /> {eleve.telephone_parent}
                            </Typography>
                          )}
                        </>
                      ) : <Typography variant="body2" color="text.disabled">Non renseigné</Typography>}
                    </TableCell>
                    <TableCell>{pastilleCompte(eleve)}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box display="flex" gap={0.5} justifyContent="flex-end" alignItems="center">
                        <Button size="small" startIcon={<FolderSharedIcon />}
                          onClick={() => navigate(`/eleves/${eleve.id}/dossier`)} sx={{ textTransform: 'none', whiteSpace: 'nowrap', fontWeight: 700, borderRadius: 2 }}>
                          Dossier
                        </Button>
                        {(saisie || estDirecteur) && <IconButton size="small" onClick={(e) => setMenuEleve({ ancre: e.currentTarget, eleve })}><MoreVertIcon fontSize="small" /></IconButton>}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} flexWrap="wrap" gap={1}>
        <Typography variant="caption" color="text.secondary">
          {filtered.length} affiché(s) — page {page} / {Math.ceil(totalCount / PAGE_SIZE) || 1}
        </Typography>
        {totalCount > PAGE_SIZE && (
          <Pagination count={Math.ceil(totalCount / PAGE_SIZE)} page={page}
            onChange={(_, v) => setPage(v)} color="primary" size="small" />
        )}
      </Box>

      {/* Menu d'actions d'un élève */}
      <Menu anchorEl={menuEleve?.ancre} open={Boolean(menuEleve)} onClose={() => setMenuEleve(null)}>
        {estDirecteur && (
          <MenuItem onClick={() => { const e = menuEleve.eleve; setMenuEleve(null); ouvrirCorrectionNom(e); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Corriger le nom
          </MenuItem>
        )}
        {saisie && (
          <MenuItem onClick={() => { const e = menuEleve.eleve; setMenuEleve(null); openEdit(e); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Modifier
          </MenuItem>
        )}
        {saisie && (
          <MenuItem onClick={() => { const e = menuEleve.eleve; setMenuEleve(null); setSelected(e); setSuspendOpen(true); }}>
            <ListItemIcon>
              {menuEleve?.eleve.is_active ? <PauseCircleIcon fontSize="small" color="warning" /> : <PlayCircleIcon fontSize="small" color="success" />}
            </ListItemIcon>
            {menuEleve?.eleve.is_active ? 'Suspendre' : 'Réactiver'}
          </MenuItem>
        )}
      </Menu>

      {/* ── Dialog Correction du nom (directeur) ── */}
      <Dialog open={nomOpen} onClose={() => setNomOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Corriger le nom de l'élève</DialogTitle>
        <DialogContent>
          {nomError && <Alert severity="error" sx={{ mb: 2 }}>{nomError}</Alert>}
          <TextField fullWidth autoFocus label="Nom" value={nomForm.nom} sx={{ mt: 1, mb: 2 }}
            onChange={(e) => setNomForm({ ...nomForm, nom: e.target.value })} />
          <TextField fullWidth label="Prénom" value={nomForm.prenom}
            onChange={(e) => setNomForm({ ...nomForm, prenom: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNomOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCorrigerNom}
            disabled={nomSaving || !nomForm.nom.trim() || !nomForm.prenom.trim()}>
            {nomSaving ? 'Enregistrement…' : 'Corriger'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Ajout ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvel Élève</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          {formFields}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || (online && !form.matricule) || !form.nom || !form.prenom || !form.classeId}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Modification ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.prenom} {selected?.nom}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          {formFields}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}
            disabled={saving || !form.matricule || !form.nom || !form.prenom}>
            {saving ? 'Modification...' : 'Modifier'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); setImportClasseId(''); }}
        maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Importer des élèves depuis Excel</DialogTitle>
        <DialogContent>

          {/* Étape 1 : choisir la classe */}
          <Box sx={{ mb: 2, mt: 1, p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.200' }}>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
              Étape 1 — Choisir la classe (recommandé)
            </Typography>
            <TextField
              select fullWidth size="small"
              label="Classe de destination"
              value={importClasseId}
              onChange={e => setImportClasseId(e.target.value)}
            >
              <MenuItem value=""><em>Sans classe (créer seulement les élèves)</em></MenuItem>
              {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
            </TextField>
            {importClasseId && (
              <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
                ✓ Les élèves importés seront automatiquement inscrits dans cette classe
              </Typography>
            )}
          </Box>

          {/* Étape 2 : télécharger le modèle */}
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
              Étape 2 — Télécharger et remplir le modèle
            </Typography>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}>
              Télécharger le modèle Excel
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Colonnes : matricule, nom, prenom, date_naissance (JJ/MM/AAAA), lieu_naissance, sexe (M/F), nom_parent, prenom_parent, telephone_parent
            </Typography>
          </Box>

          {/* Étape 3 : uploader le fichier */}
          <Typography variant="subtitle2" fontWeight="bold" mb={1}>
            Étape 3 — Importer le fichier rempli
          </Typography>
          <Box
            sx={{
              border: '2px dashed', borderColor: importing ? 'warning.main' : 'primary.main',
              borderRadius: 2, p: 3, textAlign: 'center', cursor: importing ? 'not-allowed' : 'pointer',
              bgcolor: importing ? 'warning.50' : 'primary.50',
              '&:hover': { bgcolor: importing ? 'warning.50' : 'primary.100' }
            }}
            onClick={() => !importing && fileInputRef.current?.click()}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: importing ? 'warning.main' : 'primary.main', mb: 1 }} />
            <Typography variant="body1" fontWeight="medium">
              {importing ? 'Import en cours...' : 'Cliquer pour sélectionner le fichier Excel'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Formats : .xlsx, .xls
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleImport(e.target.files[0])}
            />
          </Box>

          {importing && <LinearProgress sx={{ mt: 1 }} />}

          {/* Résultats */}
          {importResult && !importResult.error && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={importResult.errors?.length > 0 ? 'warning' : 'success'}>
                <strong>{importResult.created}</strong> élève(s) créé(s)
                {importResult.inscrits > 0 && <> &nbsp;·&nbsp; <strong>{importResult.inscrits}</strong> inscrit(s) dans la classe</>}
                {importResult.errors?.length > 0 && <> &nbsp;·&nbsp; <strong style={{ color: 'red' }}>{importResult.errors.length}</strong> erreur(s)</>}
              </Alert>
              {importResult.comptes?.length > 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  <strong>Mots de passe temporaires (une seule fois) :</strong>
                  <Box sx={{ mt: 1, maxHeight: 160, overflowY: 'auto' }}>
                    {importResult.comptes.map((c, i) => (
                      <Typography key={i} variant="caption" display="block" fontFamily="monospace">
                        {c.username} — {c.mot_de_passe_temporaire}
                      </Typography>
                    ))}
                  </Box>
                </Alert>
              )}
              {importResult.errors?.length > 0 && (
                <Box sx={{ mt: 1, maxHeight: 180, overflowY: 'auto', border: '1px solid', borderColor: 'error.light', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {importResult.errors.map((e, i) => (
                      <ListItem key={i} divider>
                        <ListItemText
                          primary={`Ligne ${e.ligne}${e.matricule ? ` — ${e.matricule}` : ''}`}
                          secondary={e.erreur}
                          primaryTypographyProps={{ color: 'error.main', variant: 'caption', fontWeight: 'bold' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          )}

          {importResult?.error && (
            <Alert severity="error" sx={{ mt: 2 }}>{importResult.error}</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setImportOpen(false); setImportResult(null); setImportClasseId(''); }}
            variant="contained">
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Suspendre / Réactiver ── */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selected?.is_active ? "Suspendre l'élève" : "Réactiver l'élève"}</DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>Suspendre <strong>{selected?.prenom} {selected?.nom}</strong> ?</Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                L'élève ne pourra plus se connecter. Son inscription et ses notes restent conservées.
              </Alert>
            </>
          ) : (
            <Typography>Réactiver <strong>{selected?.prenom} {selected?.nom}</strong> ?</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleSuspend}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={credDialog} onClose={() => setCredDialog(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{createdCreds?.offline ? 'Élève enregistré' : 'Compte élève créé'}</DialogTitle>
        <DialogContent>
          {createdCreds?.offline ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Élève enregistré. Mot de passe temporaire :{' '}
              <strong style={{ fontFamily: 'monospace' }}>{createdCreds?.password}</strong>.
              {' '}Il sera créé sur le serveur dès la connexion. Notez-le.
              {' '}L&apos;identifiant est le matricule : il apparaîtra dans la liste des élèves après la synchronisation.
            </Alert>
          ) : (
            <Alert severity="success" sx={{ mb: 2 }}>
              <strong>{createdCreds?.nom}</strong> a été ajouté avec un compte d&apos;accès.
            </Alert>
          )}
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Identifiants à transmettre à l&apos;élève :
          </Typography>
          <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 2, mt: 1 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Identifiant</Typography>
                {createdCreds?.username
                  ? <Typography fontWeight="bold" fontFamily="monospace">{createdCreds.username}</Typography>
                  : <Typography color="text.secondary">Matricule attribué à la synchronisation</Typography>}
              </Box>
              {createdCreds?.username && (
                <Tooltip title="Copier">
                  <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds.username)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Mot de passe</Typography>
                <Typography fontWeight="bold" fontFamily="monospace">{createdCreds?.password}</Typography>
              </Box>
              <Tooltip title="Copier">
                <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds?.password)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            {createdCreds?.offline
              ? 'Notez ce mot de passe maintenant : il ne sera plus affiché. Le compte sera créé sur le serveur à la reconnexion.'
              : 'Notez ce mot de passe maintenant : il ne sera plus affiché. L\'élève devra le changer à la première connexion.'}
          </Typography>
          {createdCreds?.parent && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 1.5 }} />
              {createdCreds.parent.cree ? (
                <>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Compte du parent (pour suivre son enfant) :
                  </Typography>
                  <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="caption" color="text.secondary">Identifiant (téléphone)</Typography>
                        <Typography fontWeight="bold" fontFamily="monospace">{createdCreds.parent.username}</Typography>
                      </Box>
                      <Tooltip title="Copier">
                        <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds.parent.username)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="caption" color="text.secondary">Mot de passe</Typography>
                        <Typography fontWeight="bold" fontFamily="monospace">{createdCreds.parent.mot_de_passe_temporaire}</Typography>
                      </Box>
                      <Tooltip title="Copier">
                        <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds.parent.mot_de_passe_temporaire)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Le parent se connecte avec son numéro de téléphone et devra changer ce mot de passe à sa première connexion.
                  </Typography>
                </>
              ) : createdCreds.parent.lie ? (
                <Alert severity="info">
                  Le parent a déjà un compte (identifiant <strong>{createdCreds.parent.username}</strong>) :
                  cet enfant y a été ajouté, il le verra avec ses autres enfants.
                </Alert>
              ) : (
                <Alert severity="warning">
                  Aucun compte parent créé : numéro de téléphone du parent absent ou invalide. Renseignez-le dans la fiche de l&apos;élève.
                </Alert>
              )}
            </Box>
          )}
          {createdCreds?.extra?.length > 0 && (
            <Box sx={{ mt: 2, maxHeight: 180, overflowY: 'auto' }}>
              <Typography variant="caption" fontWeight="bold">Autres comptes créés :</Typography>
              {createdCreds.extra.map((c, i) => (
                <Typography key={i} variant="caption" display="block" fontFamily="monospace">
                  {c.username} → {c.mot_de_passe_temporaire}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button variant="contained" onClick={() => setCredDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
