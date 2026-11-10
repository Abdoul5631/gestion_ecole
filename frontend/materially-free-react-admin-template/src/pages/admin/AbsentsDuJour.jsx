import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, TextField, Tooltip, Typography
} from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import authService from 'services/auth';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneIcon from '@mui/icons-material/Phone';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PrintIcon from '@mui/icons-material/Print';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link } from 'react-router-dom';
import HistoryIcon from '@mui/icons-material/History';
import api, { parametresService } from 'services/api';
import { couleursImpression } from 'utils/couleurs';

const RAFRAICHISSEMENT_MS = 30000;
const initiales = (e) => `${e.prenom?.[0] || ''}${e.nom?.[0] || ''}`.toUpperCase();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateFr = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const dateLongue = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Périodes proposées : la trace des absences est gardée, il suffit de choisir. */
function periodes() {
  const auj = new Date();
  auj.setHours(12, 0, 0, 0);
  const jours = (n) => { const d = new Date(auj); d.setDate(d.getDate() + n); return d; };
  const lundi = jours(-((auj.getDay() + 6) % 7));
  const lundiPasse = new Date(lundi); lundiPasse.setDate(lundi.getDate() - 7);
  const dimanchePasse = new Date(lundi); dimanchePasse.setDate(lundi.getDate() - 1);
  const debutMois = new Date(auj.getFullYear(), auj.getMonth(), 1, 12);
  const debutMoisPasse = new Date(auj.getFullYear(), auj.getMonth() - 1, 1, 12);
  const finMoisPasse = new Date(auj.getFullYear(), auj.getMonth(), 0, 12);
  return [
    { code: 'auj', libelle: "Aujourd'hui", debut: iso(auj), fin: iso(auj) },
    { code: 'hier', libelle: 'Hier', debut: iso(jours(-1)), fin: iso(jours(-1)) },
    { code: 'sem', libelle: 'Cette semaine', debut: iso(lundi), fin: iso(auj) },
    { code: 'sem-1', libelle: 'Semaine passée', debut: iso(lundiPasse), fin: iso(dimanchePasse) },
    { code: 'mois', libelle: 'Ce mois-ci', debut: iso(debutMois), fin: iso(auj) },
    { code: 'mois-1', libelle: 'Mois passé', debut: iso(debutMoisPasse), fin: iso(finMoisPasse) },
  ];
}

const MOTIFS = ['Maladie', 'Rendez-vous médical', 'Raison familiale', 'Décès dans la famille', 'Convocation officielle'];

const texteJour = (d) => [
  d.appel ? (d.appel === 'ABSENT' ? 'Absent à l’appel du jour' : 'Retard (appel du jour)') : '',
  ...d.cours.map((x) => `${x.statut === 'ABSENT' ? 'Absent' : 'Retard'} · ${x.matiere}`),
].filter(Boolean).join(' ; ') + (d.justifiee ? ` — justifiée${d.motif ? ` (${d.motif})` : ''}` : '');

/** Le directeur justifie les absences d'un élève pour une journée (ou retire la justification). */
function DialogueJustification({ cible, onClose, onFait }) {
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => { setMotif(cible?.motif || ''); setErreur(''); }, [cible]);
  if (!cible) return null;
  const envoyer = async (annuler) => {
    setEnvoi(true); setErreur('');
    try {
      await api.post('/presences/justifier/', { eleve_id: cible.eleve_id, date: cible.date, motif, annuler });
      onFait();
    } catch (e) {
      setErreur(e.response?.data?.motif?.[0] || e.response?.data?.detail || 'Justification impossible.');
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cible.justifiee ? 'Absence justifiée' : 'Justifier l’absence'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          {cible.nom} — {dateLongue(cible.date)}. Toutes ses absences de cette journée seront concernées.
        </Typography>
        {erreur && <Alert severity="error" sx={{ mb: 1.5 }}>{erreur}</Alert>}
        <Box display="flex" flexWrap="wrap" gap={0.75} mb={1.5}>
          {MOTIFS.map((m) => (
            <Chip key={m} label={m} clickable size="small" color={motif === m ? 'primary' : 'default'}
              variant={motif === m ? 'filled' : 'outlined'} onClick={() => setMotif(m)} />
          ))}
        </Box>
        <TextField fullWidth size="small" label="Motif" value={motif} onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. : certificat médical remis par le parent" inputProps={{ maxLength: 200 }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {cible.justifiee && (
          <Button color="error" disabled={envoi} onClick={() => envoyer(true)} sx={{ mr: 'auto' }}>Retirer la justification</Button>
        )}
        <Button onClick={onClose} disabled={envoi}>Annuler</Button>
        <Button variant="contained" disabled={envoi || !motif.trim()} onClick={() => envoyer(false)}>
          {envoi ? <CircularProgress size={20} color="inherit" /> : 'Justifier'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Absences et retards par classe : en direct pour aujourd'hui, avec l'historique (semaine, mois passés…). */
export default function AbsentsDuJour({ integre = false }) {
  const liste = useMemo(periodes, []);
  const [code, setCode] = useState('auj');
  const [perso, setPerso] = useState({ debut: liste[0].debut, fin: liste[0].fin });
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [maj, setMaj] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [ouverts, setOuverts] = useState(() => new Set());
  const [ecoleNom, setEcoleNom] = useState('');
  const [aJustifier, setAJustifier] = useState(null);
  const peutJustifier = authService.aLeRole('ADMIN');

  const periode = code === 'perso' ? perso : liste.find((p) => p.code === code);
  const unSeulJour = periode.debut === periode.fin;
  const incluAujourdhui = periode.fin >= liste[0].fin;

  const charger = useCallback(() => {
    if (!periode.debut || !periode.fin) return;
    setChargement(true);
    api.get('/presences/absents-du-jour/', { params: { debut: periode.debut, fin: periode.fin } })
      .then((res) => { setData(res.data); setErreur(''); setMaj(new Date()); })
      .catch((err) => setErreur(err?.response?.data?.detail || 'Impossible de charger la liste. Nouvel essai automatique dans quelques secondes.'))
      .finally(() => setChargement(false));
  }, [periode.debut, periode.fin]);

  useEffect(() => { parametresService.get().then((r) => setEcoleNom(r.data?.nom_ecole || '')).catch(() => {}); }, []);

  useEffect(() => {
    setData(null);
    charger();
    if (!incluAujourdhui) return undefined; // période passée : rien ne change, pas besoin de rafraîchir
    const t = setInterval(charger, RAFRAICHISSEMENT_MS);
    const surRetour = () => { if (!document.hidden) charger(); };
    document.addEventListener('visibilitychange', surRetour);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', surRetour); };
  }, [charger, incluAujourdhui]);

  const basculer = (id) => setOuverts((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const titrePeriode = unSeulJour ? dateLongue(periode.debut) : `du ${dateLongue(periode.debut)} au ${dateLongue(periode.fin)}`;

  const imprimer = () => {
    if (!data) return;
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const blocs = data.classes.map((c) => `
      <h3>${esc(c.classe)} — ${c.absents} absent(s)${c.effectif ? ` sur ${c.effectif}` : ''}</h3>
      <table><thead><tr><th style="width:30px">N°</th><th style="width:90px">Matricule</th><th>Nom et prénom</th><th style="width:70px">Jours d'absence</th><th style="width:60px">Retards</th><th>Détail</th></tr></thead><tbody>
      ${c.eleves.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.matricule)}</td><td style="text-align:left">${esc(e.nom)} ${esc(e.prenom)}</td>
        <td>${e.jours_absent}</td><td>${e.jours_retard}</td>
        <td style="text-align:left;font-size:10px">${e.details.map((d) => `${dateFr(d.date)} : ${esc(texteJour(d))}`).join('<br>')}</td></tr>`).join('')}
      </tbody></table>`).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Absences</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;padding:12mm}h2,p{text-align:center;margin:3px 0}h3{margin:16px 0 4px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px;text-align:center;vertical-align:top}th{background:${couleursImpression().clair}}
@media print{th{-webkit-print-color-adjust:exact;print-color-adjust:exact}h3{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}</style></head><body>
<h2>${esc(ecoleNom)}</h2><h2>Absences et retards</h2><p>${esc(titrePeriode)}</p>
<p>${data.total_absents} élève(s) absent(s) — ${data.total_retards} en retard seulement — imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
${blocs || '<p>Aucune absence sur cette période.</p>'}</body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1.5}>
        <Box>
          <Typography variant={integre ? 'h5' : 'h4'} fontWeight="bold" sx={{ fontSize: integre ? undefined : { xs: '1.25rem', sm: '1.5rem' } }}>
            {integre ? 'Absents aujourd’hui' : 'Historique des absences'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{titrePeriode}</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          {data && <Chip color={data.total_absents ? 'error' : 'success'} label={`${data.total_absents} absent${data.total_absents > 1 ? 's' : ''}`} />}
          {data && data.total_retards > 0 && <Chip color="warning" label={`${data.total_retards} en retard`} />}
          {data && (() => {
            const n = data.classes.reduce((t, c) => t + c.eleves.filter((e) => e.jours_justifies > 0).length, 0);
            return n > 0 ? <Chip color="info" label={`${n} justifiée${n > 1 ? 's' : ''}`} /> : null;
          })()}
          {integre
            ? <Button size="small" variant="outlined" component={Link} to="/absents-du-jour" startIcon={<HistoryIcon />}>Historique des absences</Button>
            : <Button size="small" variant="outlined" startIcon={<PrintIcon />} disabled={!data} onClick={imprimer}>Imprimer</Button>}
          <Tooltip title={maj ? `Mis à jour à ${maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${incluAujourdhui ? ' — automatique toutes les 30 s' : ''}` : ''}>
            <span>
              <IconButton onClick={charger} disabled={chargement}>{chargement ? <CircularProgress size={20} /> : <RefreshIcon />}</IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {!integre && (
      <Box display="flex" gap={0.75} flexWrap="wrap" sx={{ mb: 2 }}>
        {liste.map((p) => (
          <Chip key={p.code} label={p.libelle} clickable color={code === p.code ? 'primary' : 'default'}
            variant={code === p.code ? 'filled' : 'outlined'} onClick={() => setCode(p.code)} />
        ))}
        <Chip label="Choisir les dates" clickable color={code === 'perso' ? 'primary' : 'default'} variant={code === 'perso' ? 'filled' : 'outlined'}
          onClick={() => setCode('perso')} />
      </Box>
      )}
      {!integre && code === 'perso' && (
        <Box display="flex" gap={1.5} flexWrap="wrap" sx={{ mb: 2 }}>
          <TextField type="date" size="small" label="Du" InputLabelProps={{ shrink: true }} value={perso.debut}
            onChange={(e) => setPerso({ ...perso, debut: e.target.value })} />
          <TextField type="date" size="small" label="Au" InputLabelProps={{ shrink: true }} value={perso.fin}
            onChange={(e) => setPerso({ ...perso, fin: e.target.value })} />
        </Box>
      )}

      {erreur && <Alert severity="warning" sx={{ mb: 2 }}>{erreur}</Alert>}

      {!data && !erreur ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : data && data.classes.length === 0 ? (
        <Alert severity="success" icon={<EventBusyIcon />}>
          {unSeulJour && incluAujourdhui
            ? "Aucun absent ni retard signalé pour le moment. Les élèves apparaîtront ici dès qu'un enseignant les marque absents."
            : 'Aucune absence ni retard enregistré sur cette période.'}
        </Alert>
      ) : data && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, alignItems: 'start' }}>
          {data.classes.map((c) => (
            <Card key={c.classe_id} sx={{ borderRadius: 3, borderTop: '5px solid', borderTopColor: c.absents ? 'error.main' : 'warning.main', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                  <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>{c.classe}</Typography>
                  <Chip size="small" color="error" label={`${c.absents} absent${c.absents > 1 ? 's' : ''}`} />
                  {c.effectif > 0 && <Chip size="small" variant="outlined" label={`sur ${c.effectif}`} />}
                </Box>
                {c.eleves.map((e) => (
                  <Box key={e.eleve_id} sx={{ borderTop: '1px solid', borderColor: 'divider', py: 1 }}>
                    <Box display="flex" alignItems="center" gap={1.25}>
                      <Avatar src={e.photo_url || undefined} sx={{ bgcolor: e.sexe === 'F' ? 'secondary.light' : 'primary.light', fontWeight: 700 }}>{initiales(e)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={700} noWrap>{e.nom} {e.prenom}</Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mt: 0.25 }}>
                          {unSeulJour ? (
                            <>
                              {e.justifiee && (
                                <Chip size="small" color="info" icon={<TaskAltIcon />} label={`Justifiée${e.motif ? ` · ${e.motif}` : ''}`} />
                              )}
                              {e.appel && <Chip size="small" color={e.appel === 'ABSENT' ? 'error' : 'warning'} label={e.appel === 'ABSENT' ? 'Absent à l’appel du jour' : 'En retard (appel du jour)'} />}
                              {e.cours.map((x, i) => (
                                <Chip key={`${x.matiere}-${i}`} size="small" variant="outlined" color={x.statut === 'ABSENT' ? 'error' : 'warning'}
                                  label={`${x.statut === 'ABSENT' ? 'Absent' : 'Retard'} · ${x.matiere}`} />
                              ))}
                            </>
                          ) : (
                            <>
                              {e.jours_absent > 0 && <Chip size="small" color="error" label={`${e.jours_absent} jour${e.jours_absent > 1 ? 's' : ''} d'absence`} />}
                              {e.jours_retard > 0 && <Chip size="small" color="warning" label={`${e.jours_retard} retard${e.jours_retard > 1 ? 's' : ''}`} />}
                              {e.jours_justifies > 0 && <Chip size="small" color="info" label={`dont ${e.jours_justifies} justifiée${e.jours_justifies > 1 ? 's' : ''}`} />}
                            </>
                          )}
                        </Box>
                      </Box>
                      {peutJustifier && unSeulJour && e.absent && (
                        <Button size="small" variant={e.justifiee ? 'text' : 'outlined'} color={e.justifiee ? 'inherit' : 'primary'}
                          sx={{ textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
                          onClick={() => setAJustifier({ eleve_id: e.eleve_id, nom: `${e.nom} ${e.prenom}`, date: periode.debut, justifiee: e.justifiee, motif: e.motif })}>
                          {e.justifiee ? 'Modifier' : 'Justifier'}
                        </Button>
                      )}
                      {!unSeulJour && (
                        <Tooltip title="Voir les dates">
                          <IconButton size="small" onClick={() => basculer(e.eleve_id)}
                            sx={{ transform: ouverts.has(e.eleve_id) ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><ExpandMoreIcon /></IconButton>
                        </Tooltip>
                      )}
                      {e.telephone_parent && (
                        <Tooltip title={`Appeler le parent : ${e.telephone_parent}`}>
                          <IconButton component="a" href={`tel:${e.telephone_parent}`} color="primary"><PhoneIcon /></IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {!unSeulJour && (
                      <Collapse in={ouverts.has(e.eleve_id)}>
                        <Box sx={{ pl: 7, pt: 0.5 }}>
                          {e.details.map((d) => (
                            <Box key={d.date} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                              <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ textTransform: 'capitalize' }}>{dateFr(d.date)}</strong> — {texteJour(d)}
                              </Typography>
                              {peutJustifier && d.absent && (
                                <Button size="small" sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
                                  onClick={() => setAJustifier({ eleve_id: e.eleve_id, nom: `${e.nom} ${e.prenom}`, date: d.date, justifiee: d.justifiee, motif: d.motif })}>
                                  {d.justifiee ? 'Modifier' : 'Justifier'}
                                </Button>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </Collapse>
                    )}
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
      <DialogueJustification cible={aJustifier} onClose={() => setAJustifier(null)} onFait={() => { setAJustifier(null); charger(); }} />
    </Box>
  );
}
