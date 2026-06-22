import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  IconButton,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { login, register } from '../../services/auth';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: Props) {
  const [tab, setTab] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setName(''); setEmail(''); setPassword(''); setError(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 0) {
        await login(email, password);
      } else {
        if (!name.trim()) { setError('Please enter your name'); setLoading(false); return; }
        await register(name, email, password);
      }
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Something went wrong';
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password');
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists');
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ position: 'relative', px: 4, pt: 4, pb: 3 }}>
          <IconButton onClick={handleClose} sx={{ position: 'absolute', top: 12, right: 12 }} size="small">
            <CloseIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box component="img" src="/logo.jpg" alt="Candle Heaven"
              sx={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid', borderColor: 'divider' }}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'secondary.main', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.1 }}>
                Candle Heaven
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.55rem' }}>
                Premium Candle Ingredients
              </Typography>
            </Box>
          </Box>

          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); }} sx={{ mb: 3 }}>
            <Tab label="Sign In" sx={{ textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Create Account" sx={{ textTransform: 'none', fontWeight: 600 }} />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            {tab === 1 && (
              <TextField
                label="Full Name"
                fullWidth
                value={name}
                onChange={e => setName(e.target.value)}
                sx={{ mb: 2 }}
                required
              />
            )}
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={email}
              onChange={e => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              value={password}
              onChange={e => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              required
              slotProps={{ htmlInput: { minLength: 6 } }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.5 }}
            >
              {loading ? 'Please wait…' : tab === 0 ? 'Sign In' : 'Create Account'}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {tab === 0 ? "Don't have an account? " : 'Already have an account? '}
            <Box
              component="span"
              sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => { setTab(tab === 0 ? 1 : 0); setError(''); }}
            >
              {tab === 0 ? 'Create one' : 'Sign in'}
            </Box>
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
