// Global responsive overrides
export default function Responsive(theme) {
  const xs = theme.breakpoints.down('sm');

  return {
    // Tableaux empilés en cartes sur téléphone (voir hooks/useStackedTables.js)
    MuiCssBaseline: {
      styleOverrides: {
        [`@media ${xs.replace('@media ', '')}`]: {
          'table[data-stack]': { display: 'block', minWidth: '0 !important', width: '100%' },
          'table[data-stack] thead': {
            position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap'
          },
          'table[data-stack] tbody': { display: 'block' },
          'table[data-stack] tr': {
            display: 'block',
            margin: '0 0 12px',
            padding: '6px 12px',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 10,
            backgroundColor: theme.palette.background.paper,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          },
          'table[data-stack] td, table[data-stack] th[scope=row]': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            width: 'auto',
            minWidth: '0 !important',
            maxWidth: 'none',
            padding: '7px 0',
            border: 0,
            borderBottom: `1px dashed ${theme.palette.divider}`,
            textAlign: 'right',
            position: 'static !important',
            boxShadow: 'none !important',
            whiteSpace: 'normal',
            wordBreak: 'break-word'
          },
          'table[data-stack] td:last-child': { borderBottom: 0 },
          'table[data-stack] td[data-label]::before': {
            content: 'attr(data-label)',
            flex: '0 0 38%',
            maxWidth: '38%',
            textAlign: 'left',
            fontWeight: 600,
            fontSize: '0.75rem',
            color: theme.palette.text.secondary
          },
          'table[data-stack] td[data-label=""]::before': { display: 'none' },
          'table[data-stack] td[data-label=""]': { justifyContent: 'flex-end', flexWrap: 'wrap' },
          'table[data-stack] tr[data-empty], table[data-stack] td[data-empty]:not([data-span]):not([data-actions])': { display: 'none' },
          'table[data-stack] td > *': { minWidth: 0, maxWidth: '100%' },
          // cellule d'actions : pleine largeur, boutons qui passent à la ligne
          'table[data-stack] td[data-actions]': { justifyContent: 'center', paddingTop: 10 },
          'table[data-stack] td[data-actions]::before': { display: 'none' },
          'table[data-stack] td[data-actions] > *': { flexWrap: 'wrap !important', justifyContent: 'center !important' },
          'table[data-stack] td[data-span]': { display: 'block', textAlign: 'center', borderBottom: 0 },
          // le conteneur n'a plus besoin de défiler
          '.MuiTableContainer-root:has(> table[data-stack])': { overflowX: 'visible' },
          // champs 16px : évite le zoom automatique d'iOS au focus
          '.MuiInputBase-input, .MuiSelect-select': { fontSize: '16px' }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: { [xs]: { minWidth: 40, minHeight: 40 } }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { [xs]: { minHeight: 40 } }
      }
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          [theme.breakpoints.down('sm')]: {
            margin: 8,
            width: 'calc(100% - 16px)',
            maxWidth: 'calc(100% - 16px)',
          }
        }
      }
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          [theme.breakpoints.down('sm')]: {
            padding: '12px 16px',
          }
        }
      }
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          [theme.breakpoints.down('sm')]: {
            padding: '8px 16px 16px',
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          overflow: 'hidden',
        }
      }
    },
  };
}
