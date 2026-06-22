import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Typography, IconButton, Button, Chip, TextField,
  Tooltip, Avatar, Switch, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import { adminGetAllProducts, adminUpdateProduct, adminDeleteProduct } from '../../services/admin';
import type { Product } from '../../types';

const NAVY = '#132040';

const CATEGORY_COLORS: Record<string, string> = {
  wax: '#8D6E63', fragrance: '#9C27B0', wicks: '#607D8B',
  dye: '#E91E63', // Colours molds: '#2196F3', tools: '#FF9800', kits: '#4CAF50',
};

// product.unit is the admin-set display unit (g, kg, ml, L, piece).
// Stock is stored in the smallest base unit internally but displayed in product.unit.
function stockDisplayUnit(product: Product): string {
  return product.unit;
}
function stockMultiplier(unit: string): number {
  return (unit === 'kg' || unit === 'L') ? 1000 : 1;
}

function StockCell({ product, onUpdate }: { product: Product; onUpdate: (id: string, stock: number) => void }) {
  const unit = stockDisplayUnit(product);
  const mult = stockMultiplier(unit);
  const displayStock = parseFloat((product.stock / mult).toFixed(3));

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayStock.toString());

  function commit() {
    const n = parseFloat(value);
    if (!isNaN(n) && n >= 0) onUpdate(product.id, Math.round(n * mult));
    else setValue(displayStock.toString());
    setEditing(false);
  }

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(displayStock.toString()); setEditing(false); } }}
          autoFocus
          sx={{ width: 80 }}
          slotProps={{ htmlInput: { style: { textAlign: 'center' } } }}
        />
        <IconButton size="small" onClick={commit} color="success">
          <CheckIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Tooltip title={`Click to edit · stored as ${product.stock} ${unit === 'kg' ? 'g' : unit === 'L' ? 'ml' : unit}`}>
      <Box
        onClick={() => { setValue(displayStock.toString()); setEditing(true); }}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', '&:hover .edit-icon': { opacity: 1 } }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{displayStock}</Typography>
        <Typography variant="caption" color="text.secondary">{unit}</Typography>
        <EditIcon className="edit-icon" sx={{ fontSize: 13, opacity: 0, color: 'text.secondary', transition: 'opacity 0.15s' }} />
      </Box>
    </Tooltip>
  );
}

function stockStatus(product: Product) {
  const unit = stockDisplayUnit(product);
  const mult = stockMultiplier(unit);
  const displayStock = product.stock / mult;
  const defaultThreshold = mult > 1 ? 0.5 : 20;
  const threshold = product.lowStockThreshold ?? defaultThreshold;
  if (product.stock === 0) return <Chip label="Out of stock" size="small" color="error" />;
  if (displayStock < threshold) return <Chip label="Low stock" size="small" color="warning" />;
  return <Chip label="In stock" size="small" color="success" />;
}

export default function ProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAllProducts().then(ps => { setProducts(ps); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleStockUpdate(id: string, stock: number) {
    await adminUpdateProduct(id, { stock });
    setProducts(ps => ps.map(p => p.id === id ? { ...p, stock } : p));
  }

  async function handleFeaturedToggle(product: Product) {
    await adminUpdateProduct(product.id, { featured: !product.featured });
    setProducts(ps => ps.map(p => p.id === product.id ? { ...p, featured: !p.featured } : p));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await adminDeleteProduct(deleteTarget.id);
    setProducts(ps => ps.filter(p => p.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>
          Products ({products.length})
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/admin/products/new')}
        >
          Add Product
        </Button>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="small"
            sx={{ width: 280 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        <TableContainer>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#FAFAFA', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                  <TableCell>Product</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="center">Stock</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Featured</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      No products found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(product => (
                  <TableRow key={product.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={product.images[0]}
                          variant="rounded"
                          sx={{ width: 40, height: 40, bgcolor: 'grey.100' }}
                        />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                            {product.name}
                          </Typography>
                          {product.priceTiers?.length ? (
                            <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', mt: 0.3 }}>
                              {product.priceTiers.map(t => (
                                <Chip
                                  key={t.label}
                                  label={t.label}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.6 } }}
                                />
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">{product.unit}</Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {product.isPackaging ? (
                        <Chip label="Packaging" size="small" sx={{ bgcolor: '#7B1FA218', color: '#7B1FA2', fontWeight: 600, fontSize: 11 }} />
                      ) : (
                        <Chip
                          label={product.category}
                          size="small"
                          sx={{
                            bgcolor: `${CATEGORY_COLORS[product.category] ?? '#9E9E9E'}18`,
                            color: CATEGORY_COLORS[product.category] ?? '#9E9E9E',
                            fontWeight: 600,
                            fontSize: 11,
                            textTransform: 'capitalize',
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {product.priceTiers?.length ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.1 }}>
                          {product.priceTiers.map(t => (
                            <Typography key={t.label} variant="caption" sx={{ fontWeight: 500 }}>
                              {t.label}: LKR {t.price.toLocaleString()}{t.isBulk ? `/${t.inputUnit}` : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          LKR {product.price.toLocaleString()}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <StockCell product={product} onUpdate={handleStockUpdate} />
                    </TableCell>
                    <TableCell align="center">
                      {stockStatus(product)}
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={product.featured}
                        onChange={() => handleFeaturedToggle(product)}
                        size="small"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                        <Tooltip title="Edit product">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete product">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(product)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Product</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={18} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
