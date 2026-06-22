import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Box, Typography, Button, Paper, Divider, Stack, Chip } from '@mui/material';
import { CheckCircleOutlined as CheckCircleOutlineIcon } from '@mui/icons-material';
import StarIcon from '@mui/icons-material/Star';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import type { CustomerInfo } from '../types';

interface LocationState {
  orderNumber: string;
  customer: CustomerInfo;
  pointsEarned?: number;
  newBalance?: number;
}

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  if (!state?.orderNumber) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>No order found</Typography>
        <Button variant="contained" onClick={() => navigate('/')}>Go Home</Button>
      </Container>
    );
  }

  const { orderNumber, customer, pointsEarned, newBalance } = state;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, border: '1px solid', borderColor: 'divider', borderRadius: 4, textAlign: 'center' }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />

        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Order Placed!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Thank you {customer.name}! Your order has been received.
        </Typography>

        <Chip
          label={`Order #${orderNumber}`}
          color="primary"
          sx={{ fontSize: 15, fontWeight: 700, px: 2, py: 0.5, mb: 3 }}
        />

        {pointsEarned != null && pointsEarned > 0 && (
          <Box sx={{ bgcolor: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 2, p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <StarIcon sx={{ color: '#C9A96E', fontSize: 28, flexShrink: 0 }} />
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#C9A96E' }}>
                You earned {pointsEarned} reward points!
              </Typography>
              {newBalance != null && (
                <Typography variant="caption" color="text.secondary">
                  Total balance: {newBalance} points (LKR {newBalance} to use on your next order)
                </Typography>
              )}
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        <Box sx={{ bgcolor: '#FFF3E0', borderRadius: 2, p: 3, mb: 3, textAlign: 'left' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            What happens next?
          </Typography>
          <Stack spacing={1}>
            {[
              'We will review your order shortly',
              'You\'ll receive a WhatsApp message to confirm your order and arrange payment',
              'Once confirmed, your order will be packed and dispatched',
              'Delivery typically takes 1–3 business days',
            ].map((step, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Box sx={{ minWidth: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, mt: 0.1 }}>
                  {i + 1}
                </Box>
                <Typography variant="body2" color="text.secondary">{step}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        {customer.email && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Confirmation will be sent to <strong>{customer.email}</strong>
          </Typography>
        )}

        <Stack spacing={2}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<WhatsAppIcon />}
            href="https://wa.me/94705320205"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1DA851' }, py: 1.5 }}
          >
            Chat with us on WhatsApp
          </Button>
          <Button
            fullWidth
            variant="outlined"
            size="large"
            startIcon={<ShoppingBagOutlinedIcon />}
            onClick={() => navigate('/products')}
          >
            Continue Shopping
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
