import { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../../types';
import { useCart } from '../../context/CartContext';

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const navigate = useNavigate();
  const { addItem, openCart, items: cartItems } = useCart();
  const [snackOpen, setSnackOpen] = useState(false);

  const inStock = product.stock > 0;

  const hasTiers = Boolean(product.priceTiers?.length);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inStock) return;
    if (hasTiers) {
      navigate(`/products/${product.id}`);
      return;
    }
    const qty = product.minOrder || 1;
    const cartedQty = cartItems
      .filter(i => i.productId === product.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (qty + cartedQty > product.stock) {
      navigate(`/products/${product.id}`);
      return;
    }
    addItem({
      productId: product.id,
      cartKey: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
      unit: product.unit,
      image: product.images?.[0],
      decimalQty: product.allowDecimal,
      minQty: product.minOrder || 1,
      maxCartQty: product.stock,
      weightGrams: (product.weightGrams ?? 0) * qty,
      category: product.category,
    });
    setSnackOpen(true);
  };

  return (
    <>
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          },
        }}
        onClick={() => navigate(`/products/${product.id}`)}
      >
        <Box sx={{ position: 'relative', height: 220, overflow: 'hidden', bgcolor: 'grey.100' }}>
          <Box
            component="img"
            src={product.images?.[0] || '/placeholder-product.jpg'}
            alt={product.name}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {!inStock && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Chip label="Out of Stock" color="error" size="small" />
            </Box>
          )}
          {product.featured && inStock && (
            <Chip
              label="Featured"
              color="primary"
              size="small"
              sx={{ position: 'absolute', top: 8, left: 8 }}
            />
          )}
        </Box>

        <CardContent sx={{ flexGrow: 1, pb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: 'primary.main', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}
          >
            {product.category}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.25, mb: 0.5, lineHeight: 1.3 }}>
            {product.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.description}
          </Typography>
        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            {hasTiers ? (
              <>
                <Typography variant="caption" color="text.secondary">From</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary.main">
                  LKR {Math.min(...product.priceTiers!.map(t => t.price)).toLocaleString()}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary.main">
                  LKR {product.price.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  per {product.unit}
                </Typography>
              </>
            )}
          </Box>
          <IconButton
            color="primary"
            disabled={!inStock}
            onClick={handleAddToCart}
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              '&:disabled': { bgcolor: 'grey.200', color: 'grey.400' },
            }}
            size="small"
          >
            <AddShoppingCartIcon fontSize="small" />
          </IconButton>
        </CardActions>
      </Card>

      <Snackbar open={snackOpen} autoHideDuration={2500} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ cursor: 'pointer' }} onClick={() => { setSnackOpen(false); openCart(); }}>
          Added to cart — tap to view
        </Alert>
      </Snackbar>
    </>
  );
}
