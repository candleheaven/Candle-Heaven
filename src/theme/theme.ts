import { createTheme } from '@mui/material/styles';

const NAVY = '#132040';
const GOLD = '#C9A96E';
const GOLD_DARK = '#A8864E';
const GOLD_LIGHT = '#E0C48A';

const theme = createTheme({
  palette: {
    primary: {
      main: GOLD,
      light: GOLD_LIGHT,
      dark: GOLD_DARK,
      contrastText: '#132040',
    },
    secondary: {
      main: NAVY,
      light: '#1E3060',
      dark: '#0A1428',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FAFAF8',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1F36',
      secondary: '#4A5068',
    },
    success: {
      main: '#4CAF50',
    },
    error: {
      main: '#E53935',
    },
    divider: '#E8E4DC',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
  },
});

export default theme;
