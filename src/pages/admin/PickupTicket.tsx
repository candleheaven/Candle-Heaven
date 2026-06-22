import { useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Alert, Stack, CircularProgress,
} from '@mui/material';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import { createPickupTicket } from '../../services/courier';

const NAVY = '#132040';

const DEFAULT_SUBJECT = 'Candle Heaven - Pickup Request';
const DEFAULT_MESSAGE = '27/2, Galpoththa Road, Pore, Athurugiriya\n0705320205';

export default function PickupTicket() {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setResult('');
    try {
      const res = await createPickupTicket(subject, message);
      setResult(res.ticketId
        ? `Pickup ticket created successfully. Ticket ID: ${res.ticketId}`
        : res.message || 'Pickup ticket created.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create ticket.';
      setError(
        msg.includes('CORS') || msg.includes('Failed to fetch')
          ? 'Could not reach the Royal Express portal from the browser. Please create the pickup ticket directly at the Royal Express web portal.'
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSubject(DEFAULT_SUBJECT);
    setMessage(DEFAULT_MESSAGE);
    setResult('');
    setError('');
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ConfirmationNumberIcon sx={{ color: NAVY, fontSize: 28 }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY, lineHeight: 1.2 }}>
            Create Pickup Ticket
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Request Royal Express to collect parcels from your location
          </Typography>
        </Box>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <CardContent sx={{ p: 3 }}>
          {result ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>{result}</Alert>
              <Button variant="outlined" onClick={handleReset}>Create Another Ticket</Button>
            </Box>
          ) : (
            <Stack spacing={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Subject"
                fullWidth
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
              <TextField
                label="Message"
                fullWidth
                multiline
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                helperText="Include your pickup address and contact number"
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={submitting || !subject.trim() || !message.trim()}
                  startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <ConfirmationNumberIcon />}
                  sx={{ px: 3 }}
                >
                  {submitting ? 'Submitting…' : 'Submit Pickup Ticket'}
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
