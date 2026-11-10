import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Stepper, Step, StepLabel,
  FormGroup, FormControlLabel, Checkbox, TextField, Alert, CircularProgress,
  Grid, Divider
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import {
  niveauService, classeService, matiereService, anneeService,
  tarifService, parametresService
} from 'services/api';

const NIVEAUX_BF = [
  { nom: '6ème', examen: false },
  { nom: '5ème', examen: false },
  { nom: '4ème', examen: false },
  { nom: '3ème', examen: true },
  { nom: '2nde', examen: false },
  { nom: '1ère', examen: false },
  { nom: 'Terminale', examen: true },
];

const MATIERES_BF = [
  { nom: 'Mathématiques', type: 'SCIENTIFIQUE' },
  { nom: 'Français', type: 'LITTERATURE' },
  { nom: 'Anglais', type: 'LITTERATURE' },
  { nom: 'Histoire-Géographie', type: 'LITTERATURE' },
  { nom: 'Physique-Chimie', type: 'SCIENTIFIQUE' },
  { nom: 'SVT', type: 'SCIENTIFIQUE' },
  { nom: 'EPS', type: 'AUTRES' },
  { nom: 'EMC', type: 'AUTRES' },
];

const STEPS = ['Niveaux', 'Classes', 'Matières', 'Frais'];

export default function SetupEcole() {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [niveauxSel, setNiveauxSel] = useState(NIVEAUX_BF.map((n) => n.nom));
  const [classesTxt, setClassesTxt] = useState({});
  const [matieresSel, setMatieresSel] = useState(MATIERES_BF.map((m) => m.nom));
  const [frais, setFrais] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ecoleNom, setEcoleNom] = useState('');

  useEffect(() => {
    parametresService.get()
      .then((res) => setEcoleNom(res.data?.nom_ecole || ''))
      .catch(() => {});
    const init = {};
    NIVEAUX_BF.forEach((n) => { init[n.nom] = `${n.nom} A`; });
    setClassesTxt(init);
  }, []);

  const toggle = (list, setList, value) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const ensureAnnee = async () => {
    const res = await anneeService.getAll();
    const items = Array.isArray(res.data) ? res.data : (res.data.results || []);
    if (items.length) return items.find((a) => a.is_active) || items[0];
    const now = new Date();
    const debut = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    // première année de l'école : elle devient l'année en cours et ses trois trimestres sont créés par le serveur
    const created = await anneeService.create({ libelle: `${debut}-${debut + 1}` });
    return created.data;
  };

  const saveNiveaux = async () => {
    const existing = await niveauService.getAll();
    const have = new Set((Array.isArray(existing.data) ? existing.data : []).map((n) => n.nom));
    for (const spec of NIVEAUX_BF.filter((n) => niveauxSel.includes(n.nom))) {
      if (!have.has(spec.nom)) {
        await niveauService.create({ nom: spec.nom, is_classe_examen: spec.examen, is_active: true });
      }
    }
  };

  const saveClasses = async () => {
    const nivRes = await niveauService.getAll();
    const niveaux = Array.isArray(nivRes.data) ? nivRes.data : [];
    const clRes = await classeService.getAll();
    const exist = Array.isArray(clRes.data) ? clRes.data : (clRes.data.results || []);
    for (const spec of NIVEAUX_BF.filter((n) => niveauxSel.includes(n.nom))) {
      const niveau = niveaux.find((n) => n.nom === spec.nom);
      if (!niveau) continue;
      const noms = (classesTxt[spec.nom] || `${spec.nom} A`).split(',').map((s) => s.trim()).filter(Boolean);
      for (const nom of noms) {
        if (!exist.some((c) => c.nom === nom && c.niveau === niveau.id)) {
          await classeService.create({ nom, niveau: niveau.id, is_active: true });
        }
      }
    }
  };

  const saveMatieres = async () => {
    const res = await matiereService.getAll();
    const have = new Set((Array.isArray(res.data) ? res.data : []).map((m) => m.nom));
    for (const spec of MATIERES_BF.filter((m) => matieresSel.includes(m.nom))) {
      if (!have.has(spec.nom)) {
        await matiereService.create({ nom: spec.nom, type: spec.type });
      }
    }
  };

  const saveFrais = async () => {
    const annee = await ensureAnnee();
    const nivRes = await niveauService.getAll();
    const niveaux = Array.isArray(nivRes.data) ? nivRes.data : [];
    for (const spec of NIVEAUX_BF.filter((n) => niveauxSel.includes(n.nom))) {
      const niveau = niveaux.find((n) => n.nom === spec.nom);
      const montant = parseInt(frais[spec.nom], 10);
      if (!niveau || !montant) continue;
      const part = Math.round(montant / 3);
      await tarifService.create({
        niveau: niveau.id,
        annee_scolaire: annee.id,
        tranche1: part,
        tranche2: part,
        tranche3: montant - 2 * part,
      });
    }
  };

  const handleNext = async () => {
    setSaving(true);
    setError('');
    try {
      if (active === 0) await saveNiveaux();
      if (active === 1) await saveClasses();
      if (active === 2) await saveMatieres();
      if (active === 3) {
        await saveFrais();
        navigate('/dashboard/default');
        return;
      }
      setActive(active + 1);
    } catch {
      setError('Enregistrement impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Card sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <SchoolIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h4" fontWeight="bold">Configurer mon école</Typography>
              <Typography color="text.secondary">
                {ecoleNom || 'Votre établissement'} — étapes simples.
                Vous pourrez tout modifier ensuite dans Configuration → Paramètres de l&apos;école.
              </Typography>
            </Box>
          </Box>
          <Stepper activeStep={active} alternativeLabel>
            {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
          </Stepper>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          {active === 0 && (
            <>
              <Typography variant="h6" mb={1}>Quels niveaux avez-vous ?</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Cochez les classes de votre établissement (collège / lycée).
              </Typography>
              <FormGroup>
                {NIVEAUX_BF.map((n) => (
                  <FormControlLabel
                    key={n.nom}
                    control={<Checkbox checked={niveauxSel.includes(n.nom)} onChange={() => toggle(niveauxSel, setNiveauxSel, n.nom)} />}
                    label={n.examen ? `${n.nom} (classe d’examen)` : n.nom}
                  />
                ))}
              </FormGroup>
            </>
          )}

          {active === 1 && (
            <>
              <Typography variant="h6" mb={1}>Nommez vos classes</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Plusieurs classes : séparez par une virgule (ex. 6ème A, 6ème B).
              </Typography>
              {NIVEAUX_BF.filter((n) => niveauxSel.includes(n.nom)).map((n) => (
                <TextField
                  key={n.nom}
                  fullWidth
                  label={n.nom}
                  value={classesTxt[n.nom] || ''}
                  onChange={(e) => setClassesTxt({ ...classesTxt, [n.nom]: e.target.value })}
                  sx={{ mb: 2 }}
                />
              ))}
            </>
          )}

          {active === 2 && (
            <>
              <Typography variant="h6" mb={1}>Matières enseignées</Typography>
              <FormGroup>
                {MATIERES_BF.map((m) => (
                  <FormControlLabel
                    key={m.nom}
                    control={<Checkbox checked={matieresSel.includes(m.nom)} onChange={() => toggle(matieresSel, setMatieresSel, m.nom)} />}
                    label={m.nom}
                  />
                ))}
              </FormGroup>
            </>
          )}

          {active === 3 && (
            <>
              <Typography variant="h6" mb={1}>Frais de scolarité (optionnel)</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Montant total en FCFA pour l’année. Vous pourrez le détailler plus tard (3 tranches).
              </Typography>
              <Grid container spacing={2}>
                {NIVEAUX_BF.filter((n) => niveauxSel.includes(n.nom)).map((n) => (
                  <Grid item xs={12} sm={6} key={n.nom}>
                    <TextField
                      fullWidth
                      type="number"
                      label={`${n.nom} — total (F)`}
                      value={frais[n.nom] || ''}
                      onChange={(e) => setFrais({ ...frais, [n.nom]: e.target.value })}
                    />
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Alert severity="info" sx={{ mt: 1 }}>
                Après « Terminer », ouvrez le menu <strong>Configuration → Paramètres de l&apos;école</strong>
                pour modifier le nom, la ville, les téléphones, le logo, le tampon, l&apos;année,
                les niveaux, les classes, les matières et les grilles de frais.
              </Alert>
            </>
          )}

          <Box display="flex" justifyContent="space-between" mt={3}>
            <Button disabled={active === 0 || saving} onClick={() => setActive(active - 1)}>
              Retour
            </Button>
            <Box>
              <Button sx={{ mr: 1 }} onClick={() => navigate('/dashboard/default')}>
                Plus tard
              </Button>
              <Button variant="contained" onClick={handleNext} disabled={saving}>
                {saving ? <CircularProgress size={22} /> : (active === 3 ? 'Terminer' : 'Suivant')}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
