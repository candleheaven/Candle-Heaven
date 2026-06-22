import { useState } from 'react';
import { Box, Fab, Popover, Typography, Button, Tooltip, IconButton } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

const PHONE_DISPLAY = '+94 705 320 205';
const WA_NUMBER = '94705320205';
const WA_URL = `https://wa.me/${WA_NUMBER}`;
const WA_WEB_URL = `https://web.whatsapp.com/send?phone=${WA_NUMBER}`;
const WA_GREEN = '#25D366';

function isMobileDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export default function WhatsAppButton() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLElement>) {
    if (isMobileDevice()) {
      window.open(WA_URL, '_blank', 'noopener,noreferrer');
    } else {
      setAnchor(e.currentTarget);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(PHONE_DISPLAY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <Tooltip title="Chat with us on WhatsApp" placement="left">
        <Fab
          onClick={handleClick}
          aria-label="Chat with us on WhatsApp"
          sx={{
            position: 'fixed',
            bottom: 28,
            right: 24,
            bgcolor: WA_GREEN,
            color: '#fff',
            boxShadow: '0 4px 20px rgba(37,211,102,0.45)',
            '&:hover': { bgcolor: '#1ebe5d', boxShadow: '0 6px 24px rgba(37,211,102,0.55)' },
            zIndex: 1200,
          }}
        >
          <WhatsAppIcon sx={{ fontSize: 28 }} />
        </Fab>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              p: 2.5,
              width: 260,
              boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
              mb: 1,
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{ bgcolor: WA_GREEN, borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <WhatsAppIcon sx={{ color: '#fff', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Chat with us</Typography>
            <Typography variant="caption" color="text.secondary">We typically reply within minutes</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f5f5f5', borderRadius: 1.5, px: 1.5, py: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', flex: 1 }}>
            {PHONE_DISPLAY}
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy number'}>
            <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? WA_GREEN : 'text.secondary' }}>
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        <Button
          fullWidth
          variant="contained"
          href={WA_WEB_URL}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<WhatsAppIcon />}
          sx={{
            bgcolor: WA_GREEN,
            fontWeight: 600,
            borderRadius: 2,
            '&:hover': { bgcolor: '#1ebe5d' },
          }}
        >
          Open WhatsApp
        </Button>
      </Popover>
    </>
  );
}
