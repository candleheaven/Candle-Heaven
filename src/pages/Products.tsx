import { useEffect, useState, useCallback } from 'react';
import {
  Container,
  Typography,
  Grid,
  Box,
  Chip,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Skeleton,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/products/ProductCard';
import { getAllProducts } from '../services/products';
import type { Product, ProductCategory } from '../types';

const CATEGORIES: { label: string; value: ProductCategory }[] = [
  { label: 'All', value: 'all' },
  { label: 'Waxes', value: 'wax' },
  { label: 'Fragrances', value: 'fragrance' },
  { label: 'Wicks', value: 'wicks' },
  { label: 'Colours', value: 'dye' },
  { label: 'Molds', value: 'molds' },
  { label: 'Tools & Kits', value: 'tools' },
  { label: 'Starter Kits', value: 'kits' },
];

type SortKey = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [all, setAll] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name_asc');

  const activeCategory = (searchParams.get('category') ?? 'all') as ProductCategory;

  useEffect(() => {
    getAllProducts()
      .then(products => { setAll(products); setLoading(false); })
      .catch(() => { setError('Failed to load products. Please try again.'); setLoading(false); });
  }, []);

  const applyFilters = useCallback(() => {
    let result = [...all];
    if (activeCategory !== 'all') result = result.filter(p => p.category === activeCategory);
    if (search.trim()) result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()));
    result.sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'price_asc') return a.price - b.price;
      if (sort === 'price_desc') return b.price - a.price;
      return 0;
    });
    setFiltered(result);
  }, [all, activeCategory, search, sort]);

  useEffect(() => { applyFilters(); }, [applyFilters]);

  const setCategory = (cat: ProductCategory) => {
    if (cat === 'all') searchParams.delete('category');
    else searchParams.set('category', cat);
    setSearchParams(searchParams);
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        {activeCategory === 'all' ? 'All Products' : CATEGORIES.find(c => c.value === activeCategory)?.label}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {filtered.length} product{filtered.length !== 1 ? 's' : ''} available
      </Typography>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {CATEGORIES.map(cat => (
          <Chip
            key={cat.value}
            label={cat.label}
            onClick={() => setCategory(cat.value)}
            color={activeCategory === cat.value ? 'primary' : 'default'}
            variant={activeCategory === cat.value ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search products…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Sort by</InputLabel>
          <Select value={sort} label="Sort by" onChange={e => setSort(e.target.value as SortKey)}>
            <MenuItem value="name_asc">Name A–Z</MenuItem>
            <MenuItem value="name_desc">Name Z–A</MenuItem>
            <MenuItem value="price_asc">Price: Low to High</MenuItem>
            <MenuItem value="price_desc">Price: High to Low</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 3 }} />
              </Grid>
            ))
          : filtered.map(p => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={p.id}>
                <ProductCard product={p} />
              </Grid>
            ))}
      </Grid>

      {!loading && !error && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">No products found</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            Try a different search term or category
          </Typography>
        </Box>
      )}
    </Container>
  );
}
