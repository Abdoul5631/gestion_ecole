import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, InputAdornment, MenuItem, Pagination, Tab, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyIcon from '@mui/icons-material/VpnKey';
import api, { ecoleService } from 'services/api';

const ROLES = [['ADMIN', 'Directeur'], ['SECRETAIRE', 'Secrétaire'], ['COMPTABLE', 'Comptable'], ['SURVEILLANT', 'Surveillant'], ['COMMUNICATION', 'Responsable du site public'],
  ['ENSEIGNANT', 'Enseignant'], ['ELEVE', 'Élève'], ['PARENT', 'Parent']];
const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais');
const erreurApi = (e, defaut) => {
  const d = e?.response?.data;
  if (!d) return defaut;
  if (typeof d.detail === 'string') return d.detail;
  const v = Object.values(d)[0];
  return Array.isArray(v) ? v[0] : defaut;
};

/** Le détail d'un compte : corriger, changer le mot de passe, suspendre ou réactiver. */
function FicheCompte({ id, onClose, onChange }) {
  const [c, setC] = useState(null);
  const [onglet, setOnglet] = useState('infos');
  const [form, setForm] = useState({});
  const [mdp, setMdp] = useState('');
  const [resultat, setResultat] = useState(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  useEffect(() => {
    if (!id) return;
    setC(null); setOnglet('infos'); setResultat(null); setMdp(''); setMotif(''); setErreur(''); setSucces('');
    api.get(`/plateforme/comptes/${id}/`).then((r) => {
      setC(r.data);
      setForm({ prenom: r.data.prenom || '', nom_famille: r.data.nom_famille || '', email: r.data.email || '', username: r.data.username });
    }).catch(() => setErreur('Impossible de charger ce compte.'));
  }, [id]);

  const action = async (fn, msg) => {
    setEnvoi(true); setErreur(''); setSucces('');
    try {
      const r = await fn();
      if (msg) setSucces(msg);
      onChange();
      return r;
    } catch (e) {
      setErreur(erreurApi(e, 'Action impossible.'));
      return null;
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrer = async () => {
    const r = await action(() => api.patch(`/plateforme/comptes/${id}/`, form), 'Compte mis à jour.');
    if (r) setC(r.data);
  };
  const changerMdp = async (provisoire) => {
    const r = await action(() => api.post(`/plateforme/comptes/${id}/mot-de-passe/`, provisoire ? {} : { nouveau: mdp }));
    if (r) { setResultat(r.data); setMdp(''); }
  };
  const basculer = async () => {
    const r = await action(() => api.patch(`/plateforme/comptes/${id}/`, { actif: !c.actif, motif }),
      c.actif ? 'Compte suspendu : la personne ne peut plus se connecter.' : 'Compte réactivé.');
    if (r) { setC(r.data); setMotif(''); }
  };

  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {c ? (
          <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
            <span>{c.nom || c.username}</span>
            <Chip size="small" label={c.role_libelle} />
            <Chip size="small" variant="outlined" color={c.actif ? 'success' : 'default'} label={c.actif ? 'Actif' : 'Suspendu'} />
          </Box>
        ) : 'Compte'}
        {c && <Typography variant="body2" color="text.secondary">{c.ecole} · identifiant {c.username}</Typography>}
      </DialogTitle>
      <DialogContent>
        {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
        {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
        {!c ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <>
            <Tabs value={onglet} onChange={(_, v) => setOnglet(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tab value="infos" label="Informations" sx={{ textTransform: 'none' }} />
              <Tab value="mdp" label="Mot de passe" sx={{ textTransform: 'none' }} />
              <Tab value="statut" label="Statut" sx={{ textTransform: 'none' }} />
              <Tab value="activite" label="Activité" sx={{ textTransform: 'none' }} />
            </Tabs>

            {onglet === 'infos' && (
              <Box display="grid" gap={1.5}>
                <Box display="flex" gap={1.5}>
                  <TextField size="small" label="Prénom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} sx={{ flex: 1 }} />
                  <TextField size="small" label="Nom" value={form.nom_famille} onChange={(e) => setForm({ ...form, nom_famille: e.target.value })} sx={{ flex: 1 }} />
                </Box>
                <TextField size="small" label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <TextField size="small" label="Identifiant de connexion" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  helperText={c.role === 'ELEVE' ? 'Pour un élève : son matricule.' : c.role === 'PARENT' || c.role === 'ENSEIGNANT' ? 'Le numéro de téléphone avec lequel la personne se connecte.' : ''} />
                {form.username !== c.username && (
                  <Alert severity="warning">La personne devra se connecter avec le nouvel identifiant « {form.username} ». Prévenez-la.</Alert>
                )}
                {c.enfants.length > 0 && (
                  <Typography variant="body2" color="text.secondary">Enfants reliés : {c.enfants.map((e) => `${e.nom} (${e.matricule})`).join(', ')}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  Compte créé le {date(c.cree_le)} · dernière connexion : {date(c.derniere_connexion)}
                  {c.doit_changer_mdp ? ' · doit choisir un nouveau mot de passe à sa prochaine connexion' : ''}
                </Typography>
                <Box display="flex" justifyContent="flex-end">
                  <Button variant="contained" onClick={enregistrer} disabled={envoi}>Enregistrer</Button>
                </Box>
              </Box>
            )}

            {onglet === 'mdp' && (
              <Box>
                {resultat ? (
                  <>
                    <Alert severity="success" sx={{ mb: 1.5 }}>
                      Nouveau mot de passe de <strong>{resultat.username}</strong>. Transmettez-le uniquement à la personne, après avoir vérifié
                      son identité. Elle devra en choisir un autre à sa connexion ; ses autres appareils sont déconnectés.
                    </Alert>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 20, flex: 1 }}>{resultat.mot_de_passe_temporaire}</Typography>
                      <Tooltip title="Copier"><IconButton onClick={() => navigator.clipboard?.writeText(resultat.mot_de_passe_temporaire)}><ContentCopyIcon /></IconButton></Tooltip>
                    </Box>
                    <Button sx={{ mt: 1.5, textTransform: 'none' }} onClick={() => setResultat(null)}>Changer encore</Button>
                  </>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" mb={1.5}>
                      Vérifiez d&apos;abord l&apos;identité de la personne (appel au numéro connu, directeur de l&apos;école…). Dans les deux cas,
                      elle devra choisir son propre mot de passe à sa prochaine connexion.
                    </Typography>
                    <Button variant="contained" startIcon={<KeyIcon />} onClick={() => changerMdp(true)} disabled={envoi} sx={{ mb: 2 }}>
                      Générer un mot de passe provisoire
                    </Button>
                    <Divider sx={{ mb: 2 }}>ou</Divider>
                    <Box display="flex" gap={1}>
                      <TextField size="small" fullWidth label="Choisir le mot de passe provisoire" value={mdp} onChange={(e) => setMdp(e.target.value)}
                        helperText="8 caractères au moins, pas trop simple." />
                      <Button variant="outlined" onClick={() => changerMdp(false)} disabled={envoi || mdp.length < 8} sx={{ height: 40 }}>Appliquer</Button>
                    </Box>
                  </>
                )}
              </Box>
            )}

            {onglet === 'statut' && (
              <Box>
                {c.actif ? (
                  <>
                    <Alert severity="warning" sx={{ mb: 1.5 }}>
                      Suspendre empêche toute connexion et déconnecte ses appareils. Rien n&apos;est supprimé : vous pourrez réactiver le compte.
                      Pour un membre de l&apos;équipe d&apos;une école, c&apos;est normalement au directeur de le faire.
                    </Alert>
                    <TextField size="small" fullWidth label="Motif de la suspension" value={motif} onChange={(e) => setMotif(e.target.value)}
                      placeholder="Ex. : numéro réattribué, demande du directeur, abus…" sx={{ mb: 1.5 }} />
                    <Button variant="contained" color="warning" onClick={basculer} disabled={envoi || !motif.trim()}>Suspendre le compte</Button>
                  </>
                ) : (
                  <>
                    <Alert severity="info" sx={{ mb: 1.5 }}>Ce compte est suspendu : la personne ne peut pas se connecter.</Alert>
                    <Button variant="contained" color="success" onClick={basculer} disabled={envoi}>Réactiver le compte</Button>
                  </>
                )}
              </Box>
            )}

            {onglet === 'activite' && (
              <Box>
                {c.incidents_ouverts > 0 && <Alert severity="error" sx={{ mb: 1.5 }}>{c.incidents_ouverts} incident(s) non traité(s) concernant ce compte (page Incidents).</Alert>}
                {c.actions.length === 0 ? <Typography color="text.secondary">Aucune action enregistrée.</Typography> : c.actions.map((a, i) => (
                  <Box key={i} sx={{ py: 0.6, borderBottom: '1px dashed', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                    <Typography variant="body2">{a.action} {a.objet}</Typography>
                    <Typography variant="caption" color="text.secondary">{date(a.date)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose}>Fermer</Button></DialogActions>
    </Dialog>
  );
}

/** Tous les comptes de toutes les écoles : chercher, ouvrir, corriger. */
export default function Comptes() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [ecoles, setEcoles] = useState([]);
  const [q, setQ] = useState(params.get('q') || '');
  const [ouvert, setOuvert] = useState(null);
  const ecole = params.get('ecole') || '';
  const role = params.get('role') || '';
  const actif = params.get('actif') || '';
  const page = Number(params.get('page') || 1);

  const filtre = (cle, valeur) => {
    const p = new URLSearchParams(params);
    if (valeur) p.set(cle, valeur); else p.delete(cle);
    if (cle !== 'page') p.delete('page');
    setParams(p, { replace: true });
  };

  const charger = useCallback(() => {
    api.get('/plateforme/comptes/', { params: { q: params.get('q') || undefined, ecole: ecole || undefined, role: role || undefined, actif: actif || undefined, page } })
      .then((r) => setData(r.data)).catch(() => setData({ count: 0, results: [], par_page: 25 }));
  }, [params, ecole, role, actif, page]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { ecoleService.liste().then((r) => setEcoles(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== (params.get('q') || '')) filtre('q', q.trim()); }, 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Comptes</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Tous les comptes de toutes les écoles. Ouvrez un compte pour corriger ses informations, lui donner un mot de passe provisoire
        ou le suspendre. Chaque action est inscrite dans le journal d&apos;activité.
      </Typography>

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Nom, identifiant, téléphone, matricule, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 240 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <TextField select size="small" label="École" value={ecole} onChange={(e) => filtre('ecole', e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">Toutes</MenuItem>
            {ecoles.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.nom_ecole}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Rôle" value={role} onChange={(e) => filtre('role', e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Tous</MenuItem>
            {ROLES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Statut" value={actif} onChange={(e) => filtre('actif', e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="1">Actifs</MenuItem>
            <MenuItem value="0">Suspendus</MenuItem>
          </TextField>
        </Box>
        {!data ? <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box> : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block', mb: 0.5 }}>{data.count} compte(s)</Typography>
            {data.results.length === 0 && <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Aucun compte trouvé.</Typography>}
            {data.results.map((u) => (
              <Box key={u.id} onClick={() => setOuvert(u.id)} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider',
                cursor: 'pointer', flexWrap: 'wrap', opacity: u.actif ? 1 : 0.6, '&:hover': { bgcolor: 'action.hover' },
              }}>
                <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{u.nom || <em style={{ color: '#999' }}>Sans nom</em>}</Typography>
                  <Typography variant="caption" color="text.secondary">{u.username} · {u.ecole}</Typography>
                </Box>
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  <Chip size="small" label={u.role_libelle} />
                  {u.roles_supplementaires.map((r) => <Chip key={r} size="small" variant="outlined" label={`+ ${(ROLES.find(([v]) => v === r) || [r, r])[1]}`} />)}
                  {!u.actif && <Chip size="small" label="Suspendu" />}
                  {u.doit_changer_mdp && <Chip size="small" color="warning" variant="outlined" label="Mot de passe provisoire" />}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 150, textAlign: 'right' }}>Connexion : {date(u.derniere_connexion)}</Typography>
              </Box>
            ))}
            {data.count > data.par_page && (
              <Box display="flex" justifyContent="center" py={2} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                <Pagination count={Math.ceil(data.count / data.par_page)} page={page} onChange={(_, v) => filtre('page', String(v))} color="primary" />
              </Box>
            )}
          </>
        )}
      </Card>

      <FicheCompte id={ouvert} onClose={() => setOuvert(null)} onChange={charger} />
    </Box>
  );
}
