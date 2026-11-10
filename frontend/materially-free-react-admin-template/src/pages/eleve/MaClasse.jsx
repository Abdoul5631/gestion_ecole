import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { readThrough, scopedKey, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { Alert, Avatar, Box, Button, Card, Chip, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

import { estEnLigne } from 'offline/reseau';
function Section({ icon, titre, compteur, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box display="flex" alignItems="center" gap={1} mb={1.5}>
        {icon}
        <Typography variant="h5" fontWeight={700}>{titre}</Typography>
        {compteur !== undefined && <Chip size="small" variant="outlined" label={compteur} />}
      </Box>
      {children}
    </Box>
  );
}

export default function MaClasse() {
  const role = authService.getRole();
  const { enfants, selectedId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rechercheCamarade, setRechercheCamarade] = useState('');
  const [voirTous, setVoirTous] = useState(false);

  useEffect(() => {
    if (role === 'PARENT' && (loadingEnfants || !selectedId)) {
      if (!loadingEnfants) setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const q = role === 'PARENT' ? `?eleve_id=${selectedId}` : '';
    readThrough(scopedKey(`ma-classe:${role === 'PARENT' ? selectedId : 'me'}`), async () => (
      (await api.get(`/eleves/ma-classe/${q}`)).data
    ))
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        setData(r.data);
      })
      .catch(() => setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [role, selectedId, loadingEnfants]);

  const titre = <Typography variant="h4" fontWeight="bold" mb={2} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Ma classe</Typography>;

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  if (error) {
    return <Box>{titre}<Alert severity="warning">{error}</Alert></Box>;
  }

  if (role === 'PARENT' && !loadingEnfants && enfants.length === 0) {
    return (
      <Box>
        {titre}
        <Alert severity="warning">Aucun enfant lié à votre compte. Contactez l&apos;administration pour lier vos enfants.</Alert>
      </Box>
    );
  }

  if (!data?.eleve) {
    return (
      <Box>
        {titre}
        <Alert severity="warning">Votre compte n&apos;est pas encore lié à un profil élève. Contactez l&apos;administrateur.</Alert>
      </Box>
    );
  }

  const classe = data.classe;
  const matieres = data.matieres || [];
  const camarades = [...(data.camarades || [])].sort((a, b) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));
  const LIMITE = 12;
  const q = rechercheCamarade.trim().toLowerCase();
  const trouves = q ? camarades.filter((c) => `${c.prenom} ${c.nom}`.toLowerCase().includes(q)) : camarades;
  const affiches = (voirTous || q) ? trouves : trouves.slice(0, LIMITE);
  const initiales = (nom) => String(nom || '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';
  const clair = { bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, border: '1px solid rgba(255,255,255,0.25)' };
  const totalCoef = matieres.reduce((t, m) => t + Number(m.coef || 0), 0);

  return (
    <Box>
      {titre}
      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}

      {!classe ? (
        <Alert severity="warning">
          {role === 'PARENT' ? 'Votre enfant n’est' : 'Tu n’es'} pas encore affecté(e) à une classe pour l&apos;année en cours.
          Demandez à l&apos;administration de l&apos;inscrire dans sa classe : on verra alors ici la classe, les matières,
          les enseignants et les camarades.
        </Alert>
      ) : (
        <>
          {/* ── Bandeau de la classe, aux couleurs de l'école ── */}
          <Box sx={{
            mb: 3, borderRadius: 3, color: '#fff', p: { xs: 2.5, sm: 3 }, position: 'relative', overflow: 'hidden',
            background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
            boxShadow: (t) => `0 10px 28px ${t.palette.primary.main}40`,
          }}>
            <Box aria-hidden sx={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3 }, flexWrap: 'wrap' }}>
              <Box sx={{
                width: 76, height: 76, borderRadius: 3, bgcolor: '#fff', color: 'primary.main', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SchoolIcon sx={{ fontSize: 42 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 36 }, lineHeight: 1.1 }} color="inherit">{classe.nom}</Typography>
                <Box display="flex" gap={1} flexWrap="wrap" mt={1.25}>
                  {classe.niveau_nom && <Chip size="small" label={classe.niveau_nom} sx={clair} />}
                  <Chip size="small" icon={<GroupsIcon sx={{ color: '#fff !important' }} />}
                    label={`${classe.effectif} élève${classe.effectif > 1 ? 's' : ''}`} sx={clair} />
                  <Chip size="small" icon={<ClassIcon sx={{ color: '#fff !important' }} />}
                    label={`${matieres.length} matière${matieres.length > 1 ? 's' : ''}`} sx={clair} />
                </Box>
              </Box>
              {classe.professeur_principal && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 2.5, px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ width: 40, height: 40, bgcolor: '#fff', color: 'primary.main', fontWeight: 800, fontSize: 15 }}>{initiales(classe.professeur_principal)}</Avatar>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.85, display: 'flex', alignItems: 'center', gap: 0.5 }} color="inherit">
                      <WorkspacePremiumIcon sx={{ fontSize: 14 }} /> Professeur principal
                    </Typography>
                    <Typography fontWeight={800} color="inherit">{classe.professeur_principal}</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          {/* ── Matières : une liste claire, de la plus importante (coef.) à la moins importante ── */}
          <Section icon={<ClassIcon color="primary" />} titre="Mes matières" compteur={matieres.length}>
            {matieres.length === 0 ? (
              <Typography color="text.secondary">Aucune matière affectée pour le moment.</Typography>
            ) : (
              <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  {matieres.map((m, i) => (
                    <Box key={m.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.75, px: 2, py: 1.5,
                      borderTop: { xs: i ? '1px solid' : 'none', md: i > 1 ? '1px solid' : 'none' }, borderColor: 'divider',
                      borderLeft: { md: i % 2 ? '1px solid' : 'none' },
                    }}>
                      <Box sx={{
                        width: 40, height: 40, borderRadius: 2, flexShrink: 0, fontWeight: 800, fontSize: 16,
                        bgcolor: 'primary.lighter', color: 'primary.dark', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {m.matiere_nom?.[0]?.toUpperCase()}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ wordBreak: 'break-word', lineHeight: 1.25 }}>{m.matiere_nom}</Typography>
                        <Typography variant="body2" sx={{ color: m.enseignant_nom ? 'text.secondary' : 'text.disabled', fontStyle: m.enseignant_nom ? 'normal' : 'italic' }} noWrap>
                          {m.enseignant_nom || 'Enseignant non assigné'}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{m.coef}</Typography>
                        <Typography variant="caption" color="text.secondary">coef.</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">
                    Le coefficient indique le poids de la matière dans la moyenne : plus il est grand, plus elle compte. Total : {totalCoef}.
                  </Typography>
                </Box>
              </Card>
            )}
          </Section>

          {/* ── Camarades : recherche et « voir tous » dès qu'ils sont nombreux ── */}
          <Section icon={<PersonIcon color="primary" />} titre="Mes camarades" compteur={camarades.length}>
            {camarades.length === 0 ? (
              <Typography color="text.secondary">Pas d&apos;autre élève inscrit dans cette classe pour le moment.</Typography>
            ) : (
              <>
                {camarades.length > LIMITE && (
                  <TextField size="small" placeholder="Chercher un camarade…" value={rechercheCamarade}
                    onChange={(e) => setRechercheCamarade(e.target.value)} sx={{ mb: 1.5, width: { xs: '100%', sm: 320 } }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                )}
                {trouves.length === 0 ? (
                  <Typography color="text.secondary">Aucun camarade ne correspond à « {rechercheCamarade} ».</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)', xl: 'repeat(6, 1fr)' } }}>
                    {affiches.map((c) => (
                      <Box key={c.id} sx={{
                        display: 'flex', alignItems: 'center', gap: 1.25, p: 1, borderRadius: 2.5,
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                      }}>
                        <Avatar src={c.photo_url || undefined} sx={{ width: 34, height: 34, bgcolor: 'primary.lighter', color: 'primary.dark', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                          {initiales(`${c.prenom} ${c.nom}`)}
                        </Avatar>
                        <Typography variant="body2" fontWeight={600} sx={{ minWidth: 0, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {c.prenom} {c.nom}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                {!q && trouves.length > LIMITE && (
                  <Button onClick={() => setVoirTous((v) => !v)} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700 }}>
                    {voirTous ? 'Réduire la liste' : `Voir les ${trouves.length - LIMITE} autres camarades`}
                  </Button>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </Box>
  );
}
