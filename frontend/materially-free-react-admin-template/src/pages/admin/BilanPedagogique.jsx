import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import InsightsIcon from '@mui/icons-material/Insights';
import PrintIcon from '@mui/icons-material/Print';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import api from 'services/api';
import { messageErreur } from 'utils/erreurs';

const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} %`);
const note = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}`);
const couleurTaux = (v, seuil = 50) => (v === null || v === undefined ? 'text.secondary' : v >= seuil ? 'success.main' : 'error.main');

function Chiffre({ titre, valeur, detail, couleur = 'primary.main' }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{titre}</Typography>
        <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, color: couleur }}>{valeur}</Typography>
        {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
      </CardContent>
    </Card>
  );
}

/** Barre de pourcentage : taux de réussite d'une classe, d'une matière ou d'un examen. */
function BarreTaux({ valeur }) {
  const v = valeur ?? 0;
  const couleur = v >= 50 ? 'success.main' : 'error.main';
  return (
    <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 150 }}>
      <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(100, v)}%`, height: '100%', bgcolor: couleur, borderRadius: 4 }} />
      </Box>
      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 56, textAlign: 'right', color: couleurTaux(valeur) }}>{pct(valeur)}</Typography>
    </Box>
  );
}

function Tableau({ colonnes, lignes, vide = 'Aucune donnée pour cette période.' }) {
  if (!lignes.length) return <Typography color="text.secondary" variant="body2">{vide}</Typography>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>{colonnes.map((c) => <TableCell key={c.titre} align={c.droite ? 'right' : 'left'} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.titre}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {lignes.map((l, i) => (
            <TableRow key={i} hover>{colonnes.map((c) => <TableCell key={c.titre} align={c.droite ? 'right' : 'left'}>{c.rendu(l)}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const Section = ({ titre, sousTitre, children }) => (
  <Card sx={{ mb: 3, borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
    <CardContent>
      <Typography variant="h6" fontWeight={800}>{titre}</Typography>
      {sousTitre && <Typography variant="body2" color="text.secondary" mb={1.5}>{sousTitre}</Typography>}
      {children}
    </CardContent>
  </Card>
);

/** Bilan pédagogique du directeur : par trimestre ou pour l'année, avec le taux de réussite au BEPC et au BAC. */
export default function BilanPedagogique() {
  const [anneeId, setAnneeId] = useState('');
  const [periode, setPeriode] = useState('annee'); // 'annee' ou l'id d'un trimestre
  const [classeId, setClasseId] = useState(''); // '' = tout l'établissement
  const [bilan, setBilan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (anneeId) params.set('annee_id', anneeId);
    if (periode !== 'annee') params.set('trimestre_id', periode);
    if (classeId) params.set('classe_id', classeId);
    api.get(`/bilan-pedagogique/?${params.toString()}`)
      .then((r) => setBilan(r.data))
      .catch((e) => { setBilan(null); setError(messageErreur(e, 'Le bilan ne peut pas être affiché pour le moment.')); })
      .finally(() => setLoading(false));
  }, [anneeId, periode, classeId]);

  const nomPerimetre = bilan?.classe_choisie ? bilan.classe_choisie.nom : "l'école";

  // PDF officiel : en-tête de l'école, mêmes chiffres que l'écran, signature du directeur
  const imprimer = async () => {
    try {
      const params = new URLSearchParams({ pdf: 1 });
      if (anneeId) params.set('annee_id', anneeId);
      if (periode !== 'annee') params.set('trimestre_id', periode);
      if (classeId) params.set('classe_id', classeId);
      const res = await api.get(`/bilan-pedagogique/?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(messageErreur(e, 'Le PDF du bilan ne peut pas être créé pour le moment.'));
    }
  };

  const e = bilan?.ecole;
  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5} flexWrap="wrap">
        <InsightsIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Bilan pédagogique</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Les résultats de l&apos;école, trimestre par trimestre et sur l&apos;année, calculés comme les bulletins. Un élève réussit quand sa moyenne
        atteint le seuil de passage de l&apos;école{bilan ? ` (${note(bilan.seuil)}/20)` : ''}.
      </Typography>

      <Box display="flex" gap={1.5} flexWrap="wrap" mb={3} alignItems="center">
        <TextField select size="small" label="Année scolaire" value={anneeId || bilan?.annee?.id || ''} onChange={(ev) => { setAnneeId(ev.target.value); setPeriode('annee'); setClasseId(''); }} sx={{ minWidth: 170 }}>
          {(bilan?.annees || []).map((a) => <MenuItem key={a.id} value={a.id}>{a.libelle}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Période" value={periode} onChange={(ev) => setPeriode(ev.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="annee">Année entière</MenuItem>
          {(bilan?.trimestres || []).map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.nom}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Périmètre" value={classeId} onChange={(ev) => setClasseId(ev.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Tout l&apos;établissement</MenuItem>
          {(bilan?.classes_choix || []).map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.nom}</MenuItem>)}
        </TextField>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={imprimer} disabled={!bilan}>PDF officiel</Button>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>}

      {!loading && bilan && (
        <Box id="bilan-impression">
          {e.effectif === 0 && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Aucune note n&apos;est encore saisie pour cette période : les chiffres apparaîtront dès que les enseignants auront enregistré des notes.
            </Alert>
          )}

          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 6, md: 3 }}><Chiffre titre="Taux de réussite" valeur={pct(e.taux_reussite)} detail={`${e.reussis ?? 0} élève(s) au-dessus de ${note(bilan.seuil)}/20`} couleur={couleurTaux(e.taux_reussite)} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Chiffre titre={bilan.classe_choisie ? `Moyenne de ${nomPerimetre}` : "Moyenne de l'école"} valeur={e.moyenne === null ? '—' : `${note(e.moyenne)} / 20`} detail={`de ${note(e.plus_faible)} à ${note(e.meilleure)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Chiffre titre="Élèves évalués" valeur={e.effectif} detail={`sur ${e.inscrits} inscrits (${e.sans_note} sans note)`} /></Grid>
            {bilan.passage
              ? <Grid size={{ xs: 6, md: 3 }}><Chiffre titre="Passage en classe supérieure" valeur={pct(bilan.passage.taux)} detail={`${bilan.passage.admis} admis · ${bilan.passage.redoublent} redoublent (hors 3ème et Terminale)`} couleur={couleurTaux(bilan.passage.taux)} /></Grid>
              : <Grid size={{ xs: 6, md: 3 }}><Chiffre titre="Sous le seuil" valeur={e.effectif - (e.reussis ?? 0)} detail="élèves à accompagner" couleur="warning.main" /></Grid>}
          </Grid>

          {(bilan.examens || []).length > 0 && (
            <Section titre="Réussite aux examens nationaux" sousTitre="Admis divisé par le nombre de candidats (élèves de 3ème pour le BEPC, de Terminale pour le BAC), d'après la liste des admis saisie par la direction.">
              <Grid container spacing={2}>
                {bilan.examens.map((x) => (
                  <Grid key={x.examen} size={{ xs: 12, md: 6 }}>
                    <Box sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <WorkspacePremiumIcon color="primary" />
                        <Typography fontWeight={800}>{x.libelle} — {x.annee}</Typography>
                      </Box>
                      {!x.liste_saisie ? (
                        <Alert severity="info" sx={{ mb: 1 }}>
                          {x.candidats} candidat(s). La liste des admis n&apos;est pas encore saisie : le taux de réussite s&apos;affichera après sa saisie (page « Résultats BEPC / BAC »).
                        </Alert>
                      ) : (
                        <>
                          <Typography sx={{ fontSize: 36, fontWeight: 800, color: couleurTaux(x.taux_reussite), lineHeight: 1.1 }}>{pct(x.taux_reussite)}</Typography>
                          <Typography variant="body2" color="text.secondary" mb={1}>{x.admis} admis sur {x.candidats} candidat(s) · {x.non_admis} non admis</Typography>
                          <Tableau colonnes={[
                            { titre: 'Classe', rendu: (l) => l.classe },
                            { titre: 'Candidats', droite: true, rendu: (l) => l.candidats },
                            { titre: 'Admis', droite: true, rendu: (l) => l.admis },
                            { titre: 'Réussite', rendu: (l) => <BarreTaux valeur={l.taux_reussite} /> },
                          ]} lignes={x.par_classe} />
                        </>
                      )}
                      {x.historique.length > 0 && (
                        <Box mt={1.5}>
                          <Typography variant="body2" fontWeight={700} mb={0.5}>Années précédentes</Typography>
                          <Box display="flex" gap={1} flexWrap="wrap">
                            {x.historique.map((h) => (
                              <Chip key={h.annee} variant="outlined" label={`${h.annee} : ${pct(h.taux_reussite)} (${h.admis}/${h.candidats})`} />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Section>
          )}

          <Section titre="Résultats par classe">
            <Tableau colonnes={[
              { titre: 'Classe', rendu: (l) => <b>{l.classe}</b> },
              { titre: 'Évalués', droite: true, rendu: (l) => `${l.effectif} / ${l.inscrits}` },
              { titre: 'Moyenne', droite: true, rendu: (l) => note(l.moyenne) },
              { titre: 'Réussite', rendu: (l) => <BarreTaux valeur={l.taux_reussite} /> },
              { titre: 'Meilleure', droite: true, rendu: (l) => note(l.meilleure) },
              { titre: 'Meilleur élève', rendu: (l) => l.meilleur_eleve },
            ]} lignes={bilan.classes} />
          </Section>

          <Section titre="Résultats par matière" sousTitre={`Moyenne de chaque matière dans ${bilan.classe_choisie ? `la classe ${nomPerimetre}` : "toute l'école"}, des plus fortes aux plus faibles.`}>
            <Tableau colonnes={[
              { titre: 'Matière', rendu: (l) => <b>{l.matiere}</b> },
              { titre: 'Moyenne', droite: true, rendu: (l) => note(l.moyenne) },
              { titre: 'Réussite', rendu: (l) => <BarreTaux valeur={l.taux_reussite} /> },
              { titre: 'Notes', droite: true, rendu: (l) => l.effectif },
            ]} lignes={bilan.matieres} />
          </Section>

          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section titre="Répartition des moyennes">
                {bilan.repartition.map((t) => {
                  const max = Math.max(1, ...bilan.repartition.map((x) => x.nombre));
                  return (
                    <Box key={t.tranche} display="flex" alignItems="center" gap={1} mb={0.75}>
                      <Typography variant="body2" sx={{ width: 64 }}>{t.tranche}</Typography>
                      <Box sx={{ flex: 1, height: 14, borderRadius: 1, bgcolor: 'action.hover' }}>
                        <Box sx={{ width: `${(100 * t.nombre) / max}%`, height: '100%', borderRadius: 1, bgcolor: (th) => alpha(th.palette.primary.main, 0.85) }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ width: 36, textAlign: 'right' }}>{t.nombre}</Typography>
                    </Box>
                  );
                })}
              </Section>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section titre="Garçons et filles">
                <Tableau colonnes={[
                  { titre: '', rendu: (l) => <b>{l[0]}</b> },
                  { titre: 'Évalués', droite: true, rendu: (l) => l[1].effectif },
                  { titre: 'Moyenne', droite: true, rendu: (l) => note(l[1].moyenne) },
                  { titre: 'Réussite', rendu: (l) => <BarreTaux valeur={l[1].taux_reussite} /> },
                ]} lignes={Object.entries(bilan.genre)} />
              </Section>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section titre="Les 10 meilleurs élèves">
                <Tableau colonnes={[
                  { titre: '#', rendu: (l) => bilan.meilleurs.indexOf(l) + 1 },
                  { titre: 'Élève', rendu: (l) => l.nom },
                  { titre: 'Classe', rendu: (l) => l.classe },
                  { titre: 'Moyenne', droite: true, rendu: (l) => <b>{note(l.moyenne)}</b> },
                ]} lignes={bilan.meilleurs} />
              </Section>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section titre="Élèves à accompagner" sousTitre="Les moyennes les plus basses, sous le seuil de passage.">
                <Tableau colonnes={[
                  { titre: 'Élève', rendu: (l) => l.nom },
                  { titre: 'Classe', rendu: (l) => l.classe },
                  { titre: 'Moyenne', droite: true, rendu: (l) => <Box component="b" sx={{ color: 'error.main' }}>{note(l.moyenne)}</Box> },
                ]} lignes={bilan.a_encourager} vide="Aucun élève sous le seuil." />
              </Section>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
