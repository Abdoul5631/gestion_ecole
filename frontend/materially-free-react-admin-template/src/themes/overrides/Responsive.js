// Global responsive overrides
export default function Responsive(theme) {
  return {
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
