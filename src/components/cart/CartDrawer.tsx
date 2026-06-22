import {
  Drawer, Box, Typography, IconButton, Divider, Button, Stack, Avatar, Badge, TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DeleteOutlined as DeleteOutlineIcon } from '@mui/icons-material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import type { CartItem } from '../../types';

function cartItemKey(item: CartItem) {
  return item.cartKey ?? item.productId;
}

function QtyControl({ item, onUpdate, onRemove }: {
  item: CartItem;
  onUpdate: (k: string, qty: number) => void;
  onRemove: (k: string) => void;
}) {
  const k = cartItemKey(item);

  const maxQ = item.maxCartQty ?? Infinity;

  if (item.decimalQty) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
        <TextField
          type="number"
          size="small"
          value={item.quantity}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= (item.minQty ?? 0.1) && v <= maxQ) onUpdate(k, v);
          }}
          slotProps={{ htmlInput: { step: 0.5, min: item.minQty ?? 0.5, max: maxQ < Infinity ? maxQ : undefined, style: { width: 70, textAlign: 'center' } } }}
          sx={{ width: 90 }}
        />
        <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
      </Box>
    );
  }

  const atMax = maxQ < Infinity && item.quantity >= maxQ;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
      <IconButton
        size="small"
        onClick={() => item.quantity > (item.minQty ?? 1) ? onUpdate(k, item.quantity - 1) : onRemove(k)}
        sx={{ border: '1px solid', borderColor: 'divider', p: 0.25 }}
      >
        <RemoveIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Typography variant="body2" sx={{ minWidth: 28, textAlign: 'center', fontWeight: 600 }}>
        {item.quantity}
      </Typography>
      <IconButton
        size="small"
        disabled={atMax}
        onClick={() => { if (!atMax) onUpdate(k, item.quantity + 1); }}
        sx={{ border: '1px solid', borderColor: 'divider', p: 0.25 }}
      >
        <AddIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
        × {item.unit}
      </Typography>
    </Box>
  );
}

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQty, clearCart, subtotal, totalItems } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    closeCart();
    navigate('/checkout');
  };

  return (
    <Drawer anchor="right" open={isOpen} onClose={closeCart} slotProps={{ paper: { sx: { width: { xs: '100vw', sm: 420 } } } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Badge badgeContent={totalItems} color="primary">
              <ShoppingBagOutlinedIcon />
            </Badge>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Your Cart</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {items.length > 0 && (
              <Button size="small" color="error" onClick={clearCart} sx={{ fontSize: 12, textTransform: 'none' }}>
                Clear all
              </Button>
            )}
            <IconButton onClick={closeCart} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {items.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, px: 3 }}>
            <ShoppingBagOutlinedIcon sx={{ fontSize: 64, color: 'grey.300' }} />
            <Typography variant="h6" color="text.secondary">Your cart is empty</Typography>
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center' }}>
              Browse our candle ingredients and add items to get started
            </Typography>
            <Button variant="contained" onClick={() => { closeCart(); navigate('/products'); }} sx={{ mt: 1 }}>
              Shop Now
            </Button>
          </Box>
        ) : (
          <>
            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
              <Stack spacing={2}>
                {items.map(item => {
                  const k = cartItemKey(item);
                  const total = item.price * item.quantity;
                  // For bulk items show "LKR 800 / kg"; for pack items show "LKR 440 per pack"
                  const unitDisplay = item.decimalQty
                    ? `LKR ${item.price.toLocaleString()} / ${item.unit}`
                    : `LKR ${item.price.toLocaleString()} per ${item.unit}`;

                  return (
                    <Box key={k}>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                        <Avatar src={item.image} variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'grey.100' }}>
                          {item.name[0]}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {unitDisplay}
                          </Typography>
                          <QtyControl item={item} onUpdate={updateQty} onRemove={removeItem} />
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} color="primary.main">
                            LKR {total % 1 === 0 ? total.toLocaleString() : total.toFixed(2)}
                          </Typography>
                          <IconButton size="small" onClick={() => removeItem(k)} color="error">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                      <Divider sx={{ mt: 2 }} />
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            <Box sx={{ px: 3, py: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography color="text.secondary">Subtotal</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  LKR {subtotal % 1 === 0 ? subtotal.toLocaleString() : subtotal.toFixed(2)}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
                Shipping calculated at checkout
              </Typography>
              <Button fullWidth variant="contained" size="large" onClick={handleCheckout} sx={{ py: 1.5 }}>
                Proceed to Checkout
              </Button>
              <Button fullWidth variant="text" onClick={closeCart} sx={{ mt: 1, color: 'text.secondary' }}>
                Continue Shopping
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
