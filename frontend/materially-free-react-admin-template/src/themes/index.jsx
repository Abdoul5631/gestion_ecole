import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

// material-ui
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// project imports
import palette from './palette';
import componentsOverride from './overrides';
import typography from './typography';

// ==============================|| DEFAULT THEME - MAIN ||============================== //

export default function ThemeCustomization({ children }) {
  // couleur de l'école : mise à jour sans recharger dès qu'elle change (paramètres, connexion)
  const lireCouleur = () => { try { return localStorage.getItem('ecole_couleur'); } catch { return null; } };
  const [couleur, setCouleur] = useState(lireCouleur);
  useEffect(() => {
    const maj = () => setCouleur(lireCouleur());
    window.addEventListener('ecole-couleur', maj);
    window.addEventListener('storage', maj);
    return () => { window.removeEventListener('ecole-couleur', maj); window.removeEventListener('storage', maj); };
  }, []);
  const themePalette = useMemo(() => palette('light', couleur), [couleur]);

  const themeDefault = createTheme({
    palette: themePalette
  });

  // create duplicate theme due to responsive typography and fontFamily
  const theme = createTheme({
    ...themeDefault,
    typography: typography()
  });

  theme.components = componentsOverride(theme);

  return (
    <ThemeProvider {...{ theme }}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

ThemeCustomization.propTypes = { children: PropTypes.any };
