import { Box, Typography, Divider, Link, Stack } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'secondary.dark',
        color: 'rgba(255,255,255,0.85)',
        mt: 'auto',
        py: 5,
        px: { xs: 3, md: 8 },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' },
          gap: 4,
          mb: 4,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box
              component="img"
              src="/logo.jpg"
              alt="Candle Heaven"
              sx={{ height: 44, width: 44, objectFit: 'cover', borderRadius: '50%', border: '1.5px solid rgba(201,169,110,0.4)' }}
            />
            <Box>
              <Typography sx={{ fontWeight: 700, color: '#C9A96E', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                Candle Heaven
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(201,169,110,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: '0.55rem' }}>
                Premium Candle Ingredients
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" sx={{ opacity: 0.75, lineHeight: 1.8, maxWidth: 320 }}>
            Premium candle-making ingredients sourced for crafters. From soy wax to exotic
            fragrances — everything you need to create beautiful candles.
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }}>
            {[
              { Icon: WhatsAppIcon, href: 'https://wa.me/94705320205' },
              { Icon: FacebookIcon, href: '#' },
              { Icon: InstagramIcon, href: '#' },
            ].map(({ Icon, href }, i) => (
              <Link key={i} href={href} color="inherit" target={href !== '#' ? '_blank' : undefined} rel="noopener noreferrer"
                sx={{ color: 'rgba(201,169,110,0.6)', transition: 'color 0.2s', '&:hover': { color: '#C9A96E' } }}
              >
                <Icon />
              </Link>
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#C9A96E', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2, fontSize: '0.75rem' }}>
            Shop
          </Typography>
          {['Waxes', 'Fragrances', 'Wicks', 'Colours', 'Molds', 'Tools & Kits'].map(item => (
            <Typography key={item} variant="body2" sx={{ opacity: 0.65, mb: 0.75, cursor: 'pointer', '&:hover': { opacity: 1, color: '#C9A96E' }, transition: 'all 0.2s' }}>
              {item}
            </Typography>
          ))}
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#C9A96E', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2, fontSize: '0.75rem' }}>
            Contact
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.65, mb: 0.75 }}>
            Orders via WhatsApp
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.65, mb: 0.75 }}>
            or Facebook / Instagram
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.65, mt: 2, mb: 0.75 }}>
            Mon–Sat: 9am – 6pm
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(201,169,110,0.15)', mb: 3 }} />

      <Typography variant="body2" sx={{ opacity: 0.4, textAlign: 'center' }}>
        © {new Date().getFullYear()} Candle Heaven. All rights reserved.
      </Typography>
    </Box>
  );
}
