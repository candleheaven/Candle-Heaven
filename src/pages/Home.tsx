import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Container,
  Grid,
  Chip,
  Stack,
  Paper,
  Skeleton,
  Snackbar,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNavigate } from 'react-router-dom';
import ProductCard from '../components/products/ProductCard';
import { getFeaturedProducts } from '../services/products';
import { getActivePromotions } from '../services/promotions';
import type { Product, ProductCategory, Promotion } from '../types';

const CATEGORIES: { label: string; value: ProductCategory; emoji: string }[] = [
  { label: 'Waxes', value: 'wax', emoji: '🕯️' },
  { label: 'Fragrances', value: 'fragrance', emoji: '🌸' },
  { label: 'Wicks', value: 'wicks', emoji: '🧵' },
  { label: 'Colours', value: 'dye', emoji: '🎨' },
  { label: 'Molds', value: 'molds', emoji: '🫙' },
  { label: 'Tools & Kits', value: 'tools', emoji: '🔧' },
];

const CATEGORY_GRADIENT: Record<string, string> = {
  seasonal: 'linear-gradient(135deg, #1B2B4B 0%, #2A3F5F 100%)',
  newcomer: 'linear-gradient(135deg, #132040 0%, #1e3a2f 100%)',
  general: 'linear-gradient(135deg, #0A1428 0%, #1B2B4B 100%)',
};

const CATEGORY_ACCENT: Record<string, string> = {
  seasonal: '#E8A838',
  newcomer: '#4CAF50',
  general: '#C9A96E',
};

function discountLabel(p: Promotion): string {
  if (p.discountType === 'free_delivery') return 'Free Delivery';
  if (p.discountType === 'percentage') return `${p.discountValue}% Off`;
  return `LKR ${p.discountValue.toLocaleString()} Off`;
}

function PromoCard({ promo, onCopy }: { promo: Promotion; onCopy: (code: string) => void }) {
  const navigate = useNavigate();
  const accent = CATEGORY_ACCENT[promo.category] ?? '#C9A96E';

  return (
    <Box
      sx={{
        background: CATEGORY_GRADIENT[promo.category] ?? CATEGORY_GRADIENT.general,
        border: `1px solid ${accent}30`,
        borderRadius: 3,
        p: 3,
        minWidth: { xs: 280, sm: 320 },
        maxWidth: { xs: 280, sm: 320 },
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative circle */}
      <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', border: `1px solid ${accent}20`, pointerEvents: 'none' }} />

      <Chip
        label={promo.badgeLabel || promo.category.toUpperCase()}
        size="small"
        sx={{ alignSelf: 'flex-start', bgcolor: `${accent}20`, color: accent, fontWeight: 700, fontSize: '0.65rem', letterSpacing: 1, border: `1px solid ${accent}40` }}
      />

      <Box sx={{ bgcolor: `${accent}15`, border: `1px solid ${accent}30`, borderRadius: 2, px: 2, py: 1, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: accent, lineHeight: 1 }}>
          {discountLabel(promo)}
        </Typography>
      </Box>

      <Box>
        <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '1rem', mb: 0.5 }}>{promo.title}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', lineHeight: 1.5 }}>{promo.description}</Typography>
      </Box>

      {promo.minOrderAmount > 0 && (
        <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>
          Min. order LKR {promo.minOrderAmount.toLocaleString()}
        </Typography>
      )}

      {promo.endDate && (
        <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>
          Expires {new Date(promo.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
        <Box
          sx={{
            flex: 1,
            border: `1px dashed ${accent}60`,
            borderRadius: 1.5,
            px: 1.5,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            '&:hover': { bgcolor: `${accent}10` },
          }}
          onClick={() => onCopy(promo.code)}
        >
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: accent, fontSize: '0.9rem', letterSpacing: 1 }}>
            {promo.code}
          </Typography>
          <ContentCopyIcon sx={{ fontSize: 14, color: accent }} />
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={() => navigate('/products')}
          sx={{ borderColor: `${accent}50`, color: accent, fontSize: '0.75rem', '&:hover': { borderColor: accent, bgcolor: `${accent}10` } }}
        >
          Shop Now
        </Button>
      </Box>
    </Box>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [copySnack, setCopySnack] = useState(false);

  useEffect(() => {
    getFeaturedProducts(8)
      .then(setFeatured)
      .finally(() => setLoading(false));
    getActivePromotions().then(setPromos).catch(() => {});
  }, []);

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopySnack(true);
  }

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(150deg, #0A1428 0%, #132040 55%, #1B2B4B 100%)',
          color: 'white',
          py: { xs: 8, md: 12 },
          px: { xs: 3, md: 8 },
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative gold circle */}
        <Box sx={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', border: '1px solid rgba(201,169,110,0.12)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -60, width: 380, height: 380, borderRadius: '50%', border: '1px solid rgba(201,169,110,0.08)', pointerEvents: 'none' }} />

        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4, alignItems: 'center' }}>
            <Box>
              <Chip
                label="Premium Candle Ingredients"
                sx={{ bgcolor: 'rgba(201,169,110,0.15)', color: '#C9A96E', mb: 3, fontWeight: 600, border: '1px solid rgba(201,169,110,0.3)', letterSpacing: '0.05em' }}
              />
              <Typography
                variant="h2"
                sx={{ fontWeight: 800, fontSize: { xs: '2rem', md: '2.8rem' }, lineHeight: 1.15, mb: 2 }}
              >
                Welcome to{' '}
                <Box component="span" sx={{ color: '#C9A96E' }}>
                  Candle Heaven
                </Box>
              </Typography>
              <Typography
                variant="h6"
                sx={{ opacity: 0.75, fontWeight: 400, mb: 4, lineHeight: 1.7, fontSize: { xs: '1rem', md: '1.1rem' } }}
              >
                Your one-stop source for premium candle-making ingredients. Quality waxes, fragrances, wicks and more — delivered island-wide.
              </Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/products')}
                  sx={{ px: 3, py: 1.5 }}
                >
                  Shop Now
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<WhatsAppIcon />}
                  href="https://wa.me/94705320205"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ borderColor: 'rgba(201,169,110,0.5)', color: '#C9A96E', '&:hover': { borderColor: '#C9A96E', bgcolor: 'rgba(201,169,110,0.08)' }, px: 3, py: 1.5 }}
                >
                  Chat With Us
                </Button>
              </Stack>
            </Box>

            {/* Logo showcase on desktop */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center', alignItems: 'center' }}>
              <Box
                component="img"
                src="/logo.jpg"
                alt="Candle Heaven"
                sx={{
                  width: 300,
                  height: 300,
                  objectFit: 'cover',
                  borderRadius: '50%',
                  border: '2px solid rgba(201,169,110,0.3)',
                  boxShadow: '0 0 60px rgba(201,169,110,0.15)',
                }}
              />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Trust badges */}
      <Box sx={{ bgcolor: 'secondary.main', borderBottom: '1px solid rgba(201,169,110,0.15)', py: 2 }}>
        <Container maxWidth="lg">
          <Stack direction="row" spacing={4} sx={{ justifyContent: 'center', flexWrap: 'wrap', gap: 2 }}>
            {[
              { icon: <LocalShippingOutlinedIcon fontSize="small" />, text: 'Island-wide Delivery' },
              { icon: <VerifiedOutlinedIcon fontSize="small" />, text: 'Premium Quality Guaranteed' },
              { icon: <WhatsAppIcon fontSize="small" />, text: 'WhatsApp Support' },
            ].map(item => (
              <Stack key={item.text} direction="row" spacing={1} sx={{ alignItems: 'center', color: '#C9A96E' }}>
                {item.icon}
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{item.text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* Promotions */}
      {promos.length > 0 && (
        <Box sx={{ py: { xs: 5, md: 7 }, background: 'linear-gradient(180deg, #F4F6F9 0%, #fff 100%)' }}>
          <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Special Offers</Typography>
                <Typography color="text.secondary">Limited-time deals for our customers</Typography>
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 2.5,
                overflowX: 'auto',
                pb: 1,
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {promos.map(p => (
                <PromoCard key={p.id} promo={p} onCopy={handleCopyCode} />
              ))}
            </Box>
          </Container>
        </Box>
      )}

      {/* Categories */}
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Shop by Category
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Find exactly what you need for your next candle project
        </Typography>
        <Grid container spacing={2}>
          {CATEGORIES.map(cat => (
            <Grid size={{ xs: 6, sm: 4, md: 2 }} key={cat.value}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  textAlign: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  borderRadius: 3,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 16px rgba(196,119,34,0.15)',
                    transform: 'translateY(-2px)',
                  },
                }}
                onClick={() => navigate(`/products?category=${cat.value}`)}
              >
                <Typography variant="h4" sx={{ mb: 1 }}>{cat.emoji}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{cat.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Featured Products */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                Featured Products
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Our most popular candle-making ingredients
              </Typography>
            </Box>
            <Button
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate('/products')}
              sx={{ color: 'primary.main', display: { xs: 'none', sm: 'flex' } }}
            >
              View All
            </Button>
          </Box>
          <Grid container spacing={3}>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                    <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 3 }} />
                  </Grid>
                ))
              : featured.map(p => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={p.id}>
                    <ProductCard product={p} />
                  </Grid>
                ))}
          </Grid>
          {!loading && featured.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">No featured products yet.</Typography>
              <Button variant="outlined" onClick={() => navigate('/products')} sx={{ mt: 2 }}>
                Browse All Products
              </Button>
            </Box>
          )}
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="outlined"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate('/products')}
              sx={{ px: 4 }}
            >
              View All Products
            </Button>
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Box
        sx={{
          background: 'linear-gradient(150deg, #0A1428 0%, #132040 100%)',
          py: { xs: 6, md: 8 },
          px: 3,
          textAlign: 'center',
        }}
      >
        <Box component="img" src="/logo.jpg" alt="Candle Heaven"
          sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', border: '2px solid rgba(201,169,110,0.4)', mb: 3 }}
        />
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1.5, color: 'white' }}>
          Need Help Choosing?
        </Typography>
        <Typography variant="body1" sx={{ mb: 4, maxWidth: 480, mx: 'auto', color: 'rgba(255,255,255,0.65)', lineHeight: 1.8 }}>
          The Candle Heaven team knows candle-making inside out. Reach us on WhatsApp or Facebook for personalised ingredient advice.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<WhatsAppIcon />}
          href="https://wa.me/94705320205"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1DA851' }, color: 'white', px: 4, py: 1.5 }}
        >
          Chat on WhatsApp
        </Button>
      </Box>

      <Snackbar
        open={copySnack}
        autoHideDuration={2000}
        onClose={() => setCopySnack(false)}
        message="Promo code copied!"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
