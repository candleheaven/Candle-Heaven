import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Switch,
  Tooltip, CircularProgress, Alert, LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { getPromotions, savePromotion, deletePromotion } from '../../services/promotions';
import type { Promotion } from '../../types';

const CATEGORY_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success'> = {
  seasonal: 'warning',
  newcomer: 'success',
  general: 'info',
};

const DISCOUNT_LABEL: Record<string, string> = {
  percentage: '% off',
  fixed: 'LKR off',
  free_delivery: 'Free delivery',
};

function promoStatus(p: Promotion): { label: string; color: 'default' | 'success' | 'error' | 'warning' } {
  if (!p.active) return { label: 'Inactive', color: 'default' };
  const today = new Date().toISOString().slice(0, 10);
  if (p.startDate && today < p.startDate) return { label: 'Scheduled', color: 'warning' };
  if (p.endDate && today > p.endDate) return { label: 'Expired', color: 'error' };
  if (p.usageLimit > 0 && p.usageCount >= p.usageLimit) return { label: 'Exhausted', color: 'error' };
  return { label: 'Live', color: 'success' };
}

export default function PromotionList() {
  const navigate = useNavigate();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPromotions()
      .then(setPromos)
      .catch(() => setError('Could not load promotions.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleActive(promo: Promotion) {
    const updated = { ...promo, active: !promo.active };
    setPromos(ps => ps.map(p => p.id === promo.id ? updated : p));
    await savePromotion(updated);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this promotion?')) return;
    await deletePromotion(id);
    setPromos(ps => ps.filter(p => p.id !== id));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Promotions</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/admin/promotions/new')}>
          New Promotion
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {promos.length === 0 ? (
        <Paper elevation={0} sx={{ p: 6, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>No promotions yet.</Typography>
          <Button variant="outlined" onClick={() => navigate('/admin/promotions/new')}>Create your first promotion</Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>Promotion</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Discount</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Applies To</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Usage</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Active</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {promos.map(p => {
                const status = promoStatus(p);
                const usagePct = p.usageLimit > 0 ? Math.min(100, (p.usageCount / p.usageLimit) * 100) : 0;
                return (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.title}</Typography>
                      {p.minOrderAmount > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Min. LKR {p.minOrderAmount.toLocaleString()}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                          {p.code}
                        </Typography>
                        <Tooltip title="Copy code">
                          <IconButton size="small" onClick={() => copyCode(p.code)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={p.category} color={CATEGORY_COLOR[p.category] ?? 'default'} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {p.discountType === 'free_delivery'
                          ? 'Free delivery'
                          : `${p.discountType === 'percentage' ? `${p.discountValue}%` : `LKR ${p.discountValue.toLocaleString()}`} ${DISCOUNT_LABEL[p.discountType]}`}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      {(!p.targetType || p.targetType === 'all') && (
                        <Typography variant="body2" color="text.secondary">All products</Typography>
                      )}
                      {p.targetType === 'category' && (
                        <Typography variant="body2">{p.targetCategories.join(', ') || '—'}</Typography>
                      )}
                      {p.targetType === 'product' && (
                        <Typography variant="body2" noWrap title={p.targetProductNames.join(', ')}>
                          {p.targetProductNames.length === 1
                            ? p.targetProductNames[0]
                            : `${p.targetProductNames[0]} +${p.targetProductNames.length - 1} more`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Typography variant="body2">{p.usageCount}{p.usageLimit > 0 ? ` / ${p.usageLimit}` : ''}</Typography>
                      {p.usageLimit > 0 && (
                        <LinearProgress
                          variant="determinate"
                          value={usagePct}
                          sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: 'grey.200',
                            '& .MuiLinearProgress-bar': { bgcolor: usagePct >= 90 ? 'error.main' : 'primary.main' } }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={status.label} color={status.color} size="small" />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.active}
                        size="small"
                        onChange={() => handleToggleActive(p)}
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => navigate(`/admin/promotions/${p.id}/edit`)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(p.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
