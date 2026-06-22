import { useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Divider,
  Grid, Alert, InputAdornment, Chip,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { getDeliverySettings, saveDeliverySettings, calculateDeliveryFee } from '../../services/delivery';
import type { DeliverySettings } from '../../services/delivery';

const GOLD = '#C9A96E';

function SettingField({
  label, value, onChange, unit, helperText,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  helperText?: string;
}) {
  return (
    <TextField
      label={label}
      type="number"
      fullWidth
      size="small"
      value={value}
      onChange={e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 0) onChange(v);
      }}
      helperText={helperText}
      slotProps={unit ? { input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } } : undefined}
    />
  );
}

export default function DeliverySettings() {
  const [settings, setSettings] = useState<DeliverySettings>(getDeliverySettings());
  const [saved, setSaved] = useState(false);

  // Preview calculator
  const [previewWeight, setPreviewWeight] = useState(1.5);
  const [previewZone, setPreviewZone] = useState(3);

  const set = (field: keyof DeliverySettings) => (v: number) =>
    setSettings(s => ({ ...s, [field]: v }));

  function handleSave() {
    saveDeliverySettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const previewFee = calculateDeliveryFee(previewWeight, previewZone, settings);

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <LocalShippingIcon sx={{ color: GOLD, fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Delivery Settings</Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Rate card */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>Rate Card</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Base fee covers orders up to the base weight. Extra weight is charged per kg (rounded up).
            </Typography>

            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <SettingField
                  label="Base weight threshold"
                  value={settings.baseWeightKg}
                  onChange={set('baseWeightKg')}
                  unit="kg"
                  helperText="Orders at or below this weight pay only the base fee"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <SettingField
                  label="Extra charge per kg"
                  value={settings.additionalPerKg}
                  onChange={set('additionalPerKg')}
                  unit="LKR"
                  helperText="Applied per additional kg above threshold (ceiling)"
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Divider>
                  <Typography variant="caption" color="text.secondary">Zone Rates</Typography>
                </Divider>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <SettingField
                  label={`Zones 1–${settings.zone5Threshold - 1} base fee`}
                  value={settings.zone1to4Fee}
                  onChange={set('zone1to4Fee')}
                  unit="LKR"
                  helperText="e.g. Colombo, suburbs, nearby districts"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <SettingField
                  label={`Zone ${settings.zone5Threshold}+ base fee`}
                  value={settings.zone5PlusFee}
                  onChange={set('zone5PlusFee')}
                  unit="LKR"
                  helperText="Outer zones / outstations"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <SettingField
                  label="Zone 5+ threshold"
                  value={settings.zone5Threshold}
                  onChange={v => set('zone5Threshold')(Math.round(v))}
                  unit="zone ID"
                  helperText="Zones ≥ this value use the higher base fee"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved</Alert>}
              <Button variant="contained" size="large" onClick={handleSave} sx={{ px: 4 }}>
                Save Changes
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Preview calculator */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Preview Calculator</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Test how the current settings apply to a given order.
            </Typography>

            <TextField
              label="Order weight"
              type="number"
              size="small"
              fullWidth
              value={previewWeight}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setPreviewWeight(v); }}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">kg</InputAdornment> } }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Zone ID"
              type="number"
              size="small"
              fullWidth
              value={previewZone}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setPreviewZone(v); }}
              helperText="From the city's zone_id in the Curfox API"
              sx={{ mb: 3 }}
            />

            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Delivery fee</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: GOLD }}>
                  LKR {previewFee.toLocaleString()}
                </Typography>
              </Box>
              <Chip
                label={previewZone < settings.zone5Threshold ? `Zone 1–${settings.zone5Threshold - 1}` : `Zone ${settings.zone5Threshold}+`}
                size="small"
                variant="outlined"
              />
            </Box>
            {previewWeight > settings.baseWeightKg && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Base LKR {previewZone < settings.zone5Threshold ? settings.zone1to4Fee : settings.zone5PlusFee}
                {' + '}
                {Math.ceil(previewWeight - settings.baseWeightKg)} kg × LKR {settings.additionalPerKg}
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
